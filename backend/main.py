import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from sqlmodel import Session, select

from database import init_db, engine
from models import LogEntry as LogModel
from app.services.websocket import manager
from app.core.config import LOGSENSE_API_KEY, LLM_TIMEOUT_SECONDS
from app.api import logs, alerts, stats, correlations, system

# ──────────────────────────────────────────────
# Logging Yapılandırması (Sadece Konsol)
# ──────────────────────────────────────────────
logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{message}</cyan>",
    level="INFO"
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 LogSense AI Backend başlatıldı!")
    init_db()
    logger.info("📁 SQLite Veritabanı (logs.db) hazır.")

    with Session(engine) as session:
        statement = select(LogModel).order_by(LogModel.created_at.desc()).limit(100)
        db_logs = session.exec(statement).all()
        manager.log_buffer = [log.model_dump(mode="json") for log in reversed(db_logs)]
        logger.info(f"📦 {len(manager.log_buffer)} geçmiş kayıt belleğe yüklendi.")

    logger.info("📡 WebSocket : ws://localhost:8000/ws/logs")
    logger.info("📥 Log Kabul : POST http://localhost:8000/api/logs  (Asenkron)")
    if LOGSENSE_API_KEY:
        logger.info(f"🔒 API Key   : AKTİF")
    else:
        logger.warning("⚠️  LOGSENSE_API_KEY yok — güvenlik KAPALI")
    logger.info(f"⏱  LLM Timeout : {LLM_TIMEOUT_SECONDS}s")
    
    import asyncio
    asyncio.create_task(manager.listen_redis_pubsub())
    
    yield
    logger.info("🛑 LogSense AI Backend kapatıldı.")

app = FastAPI(
    title="LogSense AI",
    description="Akıllı Sistem Gözlemleme ve Anomali Tespit Sistemi — Clean Architecture",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(logs.router)
app.include_router(alerts.router)
app.include_router(stats.router)
app.include_router(correlations.router)
app.include_router(system.router)
