import os
import json
import hashlib
from celery import Celery
from openai import OpenAI
from loguru import logger
import redis
from sqlmodel import Session, select
from database import engine
from models import AlertModel, LogEntry

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
