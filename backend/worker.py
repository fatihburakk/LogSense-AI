import os
import json
import hashlib
import gzip
import csv
import shutil
from datetime import datetime, timezone, timedelta
from celery import Celery
from celery.schedules import crontab
from openai import OpenAI
from loguru import logger
import redis
from sqlmodel import Session, select, delete
from database import engine
from models import AlertModel, LogEntry, CorrelationModel, SystemSettings

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Initialize Celery app
celery_app = Celery(
    "logsense_worker",
    broker=REDIS_URL,
    backend=REDIS_URL
)

# Initialize Redis client for caching and Pub/Sub
try:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
except Exception as e:
    logger.error(f"Redis bağlantı hatası: {e}")
    redis_client = None

# ──── CELERY BEAT SCHEDULE ────
celery_app.conf.beat_schedule = {
    'daily-maintenance-task': {
        'task': 'run_maintenance',
        'schedule': crontab(hour=0, minute=0),  # Her gece yarısı
    },
}
celery_app.conf.timezone = 'UTC'
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

CACHE_TTL = 3600 * 2  # 2 hours

def get_cache_key(source: str, level: str, message: str) -> str:
    """Mesajın değişen kısımlarını filtreleyip benzersiz bir imza (hash) oluşturur."""
    # Rakamları ve UUID benzeri yapıları temizle (basitçe)
    import re
    clean_msg = re.sub(r'\d+', 'X', message)
    signature = f"{source}:{level}:{clean_msg}"
    return "llm_cache:" + hashlib.md5(signature.encode()).hexdigest()

@celery_app.task(name="process_llm_anomaly")
def process_llm_anomaly(log_id: int, source: str, message: str, level: str, model_type: str, score: float):
    if not openai_client:
        logger.warning("OpenAI API Key yok, LLM analizi atlanıyor.")
        return

    cache_key = get_cache_key(source, level, message)
    
    # 1. Check Cache
    llm_comment = None
    if redis_client:
        cached_result = redis_client.get(cache_key)
        if cached_result:
            logger.info("⚡ LLM Caching Devrede: Daha önce analiz edilmiş hata, cache'den getirildi.")
            llm_comment = cached_result

    # 2. Call OpenAI if not cached
    if not llm_comment:
        logger.info("🧠 LLM çağrılıyor (Cache Miss) — OpenAI API kullanılıyor.")
        prompt = f"""Bir Kıdemli Site Reliability Engineer (SRE) ve Sistem Mimarı olarak aşağıdaki sistem logunda tespit edilen anomaliyi analiz et.

[ BAĞLAM VE KANITLAR ]
📌 Kaynak:  {source} ({model_type} modeli)
📌 Seviye:  {level}
📌 Skor:    {score:.2f}
📌 Log:     {message}

[ GÖREV VE KURALLAR ]
Sadece elindeki log metninde yazan teknik kanıtlara dayanarak, hiçbir varsayımda (hallucination) bulunmadan aşağıdaki soruları SIFIR hata payı ile yanıtla. Olası durumu belirt.

Aşağıdaki formatı kullanarak KISA, NET ve PROFESYONEL Türkçe yanıt ver:
1. **Kök Neden**: (Hatanın teknik sebebi)
2. **Etki**:      (Sisteme etkisi)
3. **Çözüm**:     (Çözüm için 2 kesin adım)"""

        try:
            response = openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "Sen kıdemli bir DevOps/SRE uzmanısın. Net ve teknik yanıt verirsin."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=300,
                temperature=0.1
            )
            llm_comment = response.choices[0].message.content.strip()
            
            # Save to Cache
            if redis_client:
                redis_client.setex(cache_key, CACHE_TTL, llm_comment)
                logger.info("💾 Yeni LLM analizi Cache'e kaydedildi.")
                
        except Exception as e:
            logger.error(f"LLM Celery Görevinde hata: {e}")
            return

    # 3. Update Database
    with Session(engine) as session:
        # Update LogEntry ai_analysis json
        log_entry = session.get(LogEntry, log_id)
        if log_entry:
            current_analysis = log_entry.ai_analysis or {}
            current_analysis_dict = dict(current_analysis)
            current_analysis_dict["llm_analysis"] = llm_comment
            log_entry.ai_analysis = current_analysis_dict
            session.add(log_entry)

        # Notify via Pub/Sub for realtime UI update
        if redis_client:
            event_data = {
                "type": "llm_update",
                "log_id": log_id,
                "llm_analysis": llm_comment
            }
            redis_client.publish("logsense_updates", json.dumps(event_data))
            logger.info(f"📢 Pub/Sub yayını yapıldı (Log ID: {log_id})")

        session.commit()
    

    return True

# ──── MAINTENANCE TASKS (BACKUP & PRUNE) ────

@celery_app.task(name="run_maintenance")
def run_maintenance():
    """Yedekleme ve Temizleme işlemlerini sırayla yürütür."""
    logger.info("🛠️ Günlük bakım görevi başlatıldı.")
    
    with Session(engine) as session:
        settings = session.exec(select(SystemSettings)).first()
        if not settings:
            logger.warning("Sistem ayarları bulunamadı, varsayılanlar kullanılıyor.")
            retention_days = 15
            auto_backup = True
        else:
            retention_days = settings.retention_days
            auto_backup = settings.auto_backup

    # 1. Backup if enabled
    if auto_backup:
        backup_path = backup_to_gz()
        if not backup_path:
            logger.error("❌ Yedekleme başarısız, temizlik işlemi güvenlik nedeniyle iptal edildi.")
            return False

    # 2. Prune old data
    prune_old_data(retention_days)
    
    logger.info("✅ Günlük bakım başarıyla tamamlandı.")
    return True

def backup_to_gz():
    """Tüm log veritabanını GZIP sıkıştırmalı CSV olarak yedekler."""
    backup_dir = "/app/backups"
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"logsense_backup_{timestamp}.csv.gz"
    filepath = os.path.join(backup_dir, filename)
    
    try:
        with Session(engine) as session:
            logs = session.exec(select(LogEntry)).all()
            
        with gzip.open(filepath, 'wt', encoding='utf-8', newline='') as f:
            writer = csv.writer(f, delimiter=';')
            writer.writerow(['ID', 'Timestamp', 'Level', 'Source', 'Message'])
            for log in logs:
                writer.writerow([log.id, log.timestamp, log.level, log.source, log.message])
        
        file_size = os.path.getsize(filepath) / (1024 * 1024)
        logger.info(f"📦 Yedekleme tamamlandı: {filename} ({file_size:.2f} MB)")
        return filepath
    except Exception as e:
        logger.error(f"⚠️ Yedekleme sırasında hata: {e}")
        return None

def prune_old_data(days: int):
    """Belirlenen günden eski verileri temizler."""
    threshold_date = datetime.now(timezone.utc) - timedelta(days=days)
    logger.info(f"🧹 {days} günden eski veriler temizleniyor... (Eşik: {threshold_date})")
    
    try:
        with Session(engine) as session:
            # Delete old logs, alerts, correlations
            session.exec(delete(LogEntry).where(LogEntry.created_at < threshold_date))
            session.exec(delete(AlertModel).where(AlertModel.created_at < threshold_date))
            session.exec(delete(CorrelationModel).where(CorrelationModel.created_at < threshold_date))
            session.commit()
            logger.info("✨ Veritabanı başarıyla temizlendi.")
    except Exception as e:
        logger.error(f"⚠️ Temizlik sırasında hata: {e}")
