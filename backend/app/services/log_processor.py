import asyncio
from loguru import logger
from sqlmodel import Session, select

from ai_engine import ai_engine
from log_enricher import log_enricher
from correlation_engine import correlation_engine
from database import engine
from models import LogEntry as LogModel, CorrelationModel, AlertModel
from .websocket import manager
from ..core.config import LLM_TIMEOUT_SECONDS
try:
    from worker import process_llm_anomaly
except ImportError:
    process_llm_anomaly = None

async def _process_log_background(log_data: dict):
    """
    Log işleme pipeline'ı — arka planda çalışır, request'i bloklamaz.
    Adımlar: Enrichment → ML → LLM (zaman aşımlı) → DB → WebSocket
    """
    source = log_data.get("source", "unknown")
    level = log_data.get("level", "INFO")

    # 1. Log Enrichment
    try:
        enrichment = log_enricher.enrich(log_data)
        if enrichment:
            log_data["enrichment"] = enrichment
    except Exception as e:
        logger.error(f"Enrichment hatası ({source}): {e}")

    # 2 & 3. AI Analizi — ML senkron, LLM asyncio.timeout korumalı
    try:
        # ai_engine.process_log sadece ML analizi yapar
        ai_result = ai_engine.process_log(log_data)
        
        # Celery flag'ini al ve json'dan çıkar (DB'ye yazılmaması için)
        should_call_llm = ai_result.pop("_should_call_llm", False)
        
        log_data["ai_analysis"] = ai_result
        logger.debug(f"AI ML tamamlandı: {source} | skor={ai_result.get('anomaly_score', 0):.2f}")
    except Exception as e:
        logger.error(f"AI engine hatası ({source}): {e}")
        log_data["ai_analysis"] = {"model_used": "error", "ml_prediction": "normal", "anomaly_score": 0.0, "llm_analysis": None}
        should_call_llm = False

    # 4. Event Correlation
    correlation_group = None
    try:
        correlation_group = correlation_engine.process(log_data)
    except Exception as e:
        logger.error(f"Correlation engine hatası: {e}")

    # 5. Veritabanına Kaydet
    try:
        with Session(engine) as session:
            db_log = LogModel(**{k: v for k, v in log_data.items() if k != "_ts"})
            session.add(db_log)
            session.commit()
            session.refresh(db_log)
            log_data.update(db_log.model_dump(mode="json"))

            ai_result = log_data.get("ai_analysis", {})
            if ai_result.get("ml_prediction") == "anomaly":
                db_alert = AlertModel(
                    log_id=db_log.id,
                    level=log_data["level"],
                    source=log_data["source"],
                    message=log_data["message"],
                    timestamp=log_data["timestamp"]
                )
                session.add(db_alert)
                session.commit()
                logger.info(f"🔔 Yeni Alert oluşturuldu: #{db_log.id}")

            if correlation_group:
                stmt = select(CorrelationModel).where(
                    CorrelationModel.group_id == correlation_group["group_id"]
                )
                existing_corr = session.exec(stmt).first()
                if existing_corr:
                    for key, value in correlation_group.items():
                        setattr(existing_corr, key, value)
                    session.add(existing_corr)
                else:
                    db_corr = CorrelationModel(**correlation_group)
                    session.add(db_corr)
                session.commit()

            logger.info(f"💾 Kaydedildi: [ID:{db_log.id}] [{log_data['level']}] {log_data['source']} — {log_data['message'][:60]}")
            
            # Celery'ye işi gönder (DB'ye yazıldıktan sonra ID ile beraber)
            if should_call_llm and process_llm_anomaly:
                model_type = log_data["ai_analysis"].get("model_used", log_data["source"])
                score = log_data["ai_analysis"].get("anomaly_score", 0.0)
                process_llm_anomaly.delay(
                    log_id=db_log.id, 
                    source=log_data["source"], 
                    message=log_data["message"], 
                    level=log_data["level"], 
                    model_type=model_type, 
                    score=score
                )
                logger.info(f"🚀 Celery: #{db_log.id} LLM kuyruğuna alındı.")

    except Exception as e:
        logger.error(f"Veritabanı hatası: {e}")

    # 6. WebSocket Broadcast
    try:
        await manager.broadcast(log_data)
        if correlation_group:
            await manager.send_correlation(correlation_group)
        logger.debug(f"📡 WS yayını tamam: {log_data['message'][:40]}")
    except Exception as e:
        logger.error(f"WebSocket broadcast hatası: {e}")
