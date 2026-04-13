"""
LogSense AI — FastAPI Backend v2.2
Gerçek zamanlı log toplama, WebSocket yayını ve anomali analiz merkezi.

Faz 3: BackgroundTasks ile asenkron işleme.
  - POST /api/logs → anında 202 Accepted döner
  - ML + LLM + DB + WebSocket işlemleri arka planda çalışır
  - LLM çağrılarına asyncio.timeout ile zaman aşımı koruması
"""

import os
import asyncio
from datetime import datetime, timezone
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from loguru import logger
from dotenv import load_dotenv

from ai_engine import ai_engine
from log_enricher import log_enricher
from correlation_engine import correlation_engine
from database import init_db, engine
from models import LogEntry as LogModel, CorrelationModel, AlertModel
from sqlmodel import Session, select

load_dotenv()

# ──────────────────────────────────────────────
# Logging Yapılandırması (Sadece Konsol)
# ──────────────────────────────────────────────
logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{message}</cyan>",
    level="INFO"
)
logger.info("🚀 LogSense AI başlatılıyor... (Sadece Konsol Loglama Aktif)")

# ──────────────────────────────────────────────
# Güvenlik — API Key
# ──────────────────────────────────────────────
LOGSENSE_API_KEY = os.getenv("LOGSENSE_API_KEY", "")
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "12"))
BUFFER_SIZE = int(os.getenv("BUFFER_SIZE", "100"))


def verify_api_key(x_api_key: str = Header(..., alias="X-API-KEY")):
    """X-API-KEY header doğrulaması. Hatalı/eksik → 403 Forbidden"""
    if not LOGSENSE_API_KEY:
        logger.warning("LOGSENSE_API_KEY tanımlı değil — güvenlik devre dışı!")
        return
    if x_api_key != LOGSENSE_API_KEY:
        logger.warning(f"Geçersiz API Key denemesi: '{x_api_key[:8]}...'")
        raise HTTPException(status_code=403, detail="Geçersiz API anahtarı")


# ──────────────────────────────────────────────
# Pydantic Models
# ──────────────────────────────────────────────
class LogEntry(BaseModel):
    """Tek bir log satırını temsil eder."""
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    level: str = Field(..., description="Log seviyesi: INFO, WARN, ERROR, CRITICAL")
    message: str = Field(..., description="Log mesajı")
    source: str = Field(default="unknown", description="Logun kaynağı (servis adı)")
    enrichment: Optional[dict] = None
    ai_analysis: Optional[dict] = None


class LogAccepted(BaseModel):
    """Asenkron kabul yanıtı — log arka planda işlenecek."""
    status: str = "accepted"
    message: str
    log_id: str


# ──────────────────────────────────────────────
# WebSocket Connection Manager
# ──────────────────────────────────────────────
class ConnectionManager:
    """Aktif WebSocket bağlantılarını yönetir."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.log_buffer: List[dict] = []
        self.buffer_size: int = BUFFER_SIZE

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        if self.log_buffer:
            await websocket.send_json({"type": "history", "data": self.log_buffer})

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, log_data: dict):
        """Logu tüm bağlı istemcilere yayınla ve buffer'a ekle."""
        self.log_buffer.append(log_data)
        if len(self.log_buffer) > self.buffer_size:
            self.log_buffer.pop(0)

        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json({"type": "log", "data": log_data})
            except Exception:
                disconnected.append(connection)

        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)

    async def send_correlation(self, correlation_data: dict):
        """Korelasyon grubunu tüm bağlı istemcilere gönderir."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json({"type": "correlation", "data": correlation_data})
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)


manager = ConnectionManager()


# ──────────────────────────────────────────────
# Arka Plan İşleme (Asenkron Pipeline)
# ──────────────────────────────────────────────
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
        # ai_engine.process_log LLM çağrısı yapabilir; thread'de çalıştırıyoruz
        # böylece uzun süren OpenAI isteği event loop'u bloklamaz
        ai_result = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(
                None, ai_engine.process_log, log_data
            ),
            timeout=LLM_TIMEOUT_SECONDS
        )
        log_data["ai_analysis"] = ai_result
        logger.debug(f"AI tamamlandı: {source} | skor={ai_result.get('anomaly_score', 0):.2f}")
    except asyncio.TimeoutError:
        logger.warning(f"⏱ LLM zaman aşımı ({LLM_TIMEOUT_SECONDS}s) — {source}/{level}. Fallback skor kullanılıyor.")
        log_data["ai_analysis"] = {
            "model_used": "timeout-fallback",
            "ml_prediction": "anomaly" if level in ("ERROR", "CRITICAL") else "normal",
            "anomaly_score": 0.75 if level in ("ERROR", "CRITICAL") else 0.1,
            "llm_analysis": None,
        }
    except Exception as e:
        logger.error(f"AI engine hatası ({source}): {e}")
        log_data["ai_analysis"] = {"model_used": "error", "ml_prediction": "normal", "anomaly_score": 0.0, "llm_analysis": None}

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
            log_data["id"] = db_log.id

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


# ──────────────────────────────────────────────
# FastAPI Application
# ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 LogSense AI Backend başlatıldı!")
    init_db()
    logger.info("📁 SQLite Veritabanı (logs.db) hazır.")

    with Session(engine) as session:
        statement = select(LogModel).order_by(LogModel.created_at.desc()).limit(100)
        db_logs = session.exec(statement).all()
        manager.log_buffer = [log.model_dump() for log in reversed(db_logs)]
        logger.info(f"📦 {len(manager.log_buffer)} geçmiş kayıt belleğe yüklendi.")

    logger.info("📡 WebSocket : ws://localhost:8000/ws/logs")
    logger.info("📥 Log Kabul : POST http://localhost:8000/api/logs  (Asenkron)")
    if LOGSENSE_API_KEY:
        logger.info(f"🔒 API Key   : AKTİF ({LOGSENSE_API_KEY[:8]}...)")
    else:
        logger.warning("⚠️  LOGSENSE_API_KEY yok — güvenlik KAPALI")
    logger.info(f"⏱  LLM Timeout : {LLM_TIMEOUT_SECONDS}s")
    yield
    logger.info("🛑 LogSense AI Backend kapatıldı.")


app = FastAPI(
    title="LogSense AI",
    description="Akıllı Sistem Gözlemleme ve Anomali Tespit Sistemi — Asenkron Pipeline",
    version="2.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# REST Endpoints
# ──────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "service": "LogSense AI",
        "version": "2.2.0",
        "status": "running",
        "processing": "async (BackgroundTasks)",
        "security": "API Key enabled" if LOGSENSE_API_KEY else "OPEN",
        "llm_timeout_seconds": LLM_TIMEOUT_SECONDS,
        "loaded_models": list(ai_engine.models.keys()),
        "llm_active": ai_engine.client is not None,
    }


@app.post(
    "/api/logs",
    response_model=LogAccepted,
    status_code=202,
    dependencies=[Depends(verify_api_key)],
)
async def receive_log(log: LogEntry, background_tasks: BackgroundTasks):
    """
    Log kabul noktası — ASENKRON.
    İsteği derhal kabul eder (202), işlemi arka plana alır.
    Güvenlik: X-API-KEY header zorunludur.
    """
    log_data = log.model_dump()

    # Logu arka planda işle — request bloklanmaz
    background_tasks.add_task(_process_log_background, log_data)

    log_id = f"{log_data['source']}-{log_data['timestamp'][-8:]}"
    logger.debug(f"📥 Log kabul edildi → arka plana alındı: {log_id}")

    return LogAccepted(
        status="accepted",
        message="Log arkaplanda işleniyor",
        log_id=log_id,
    )


@app.get("/api/stats")
async def get_stats():
    """Anlık sistem durumu istatistikleri."""
    buffer = manager.log_buffer
    level_counts: dict = {}
    anomaly_count = 0

    for entry in buffer:
        level = entry.get("level", "UNKNOWN")
        level_counts[level] = level_counts.get(level, 0) + 1
        ai = entry.get("ai_analysis") or {}
        if ai.get("ml_prediction") == "anomaly":
            anomaly_count += 1

    return {
        "total_logs": len(buffer),
        "active_connections": len(manager.active_connections),
        "level_breakdown": level_counts,
        "anomalies_detected": anomaly_count,
        "active_correlations": correlation_engine.get_active_groups(),
        "loaded_models": list(ai_engine.models.keys()),
        "buffer_capacity": f"{len(buffer)}/{manager.buffer_size}",
        "security": "enabled" if LOGSENSE_API_KEY else "disabled",
        "processing_mode": "async",
        "llm_timeout_seconds": LLM_TIMEOUT_SECONDS,
    }


@app.get("/api/health")
async def health_check():
    """Sistem sağlık kontrolü — yük dengeleyiciler için."""
    return {
        "status": "healthy",
        "models_loaded": len(ai_engine.models),
        "ws_connections": len(manager.active_connections),
        "buffer_size": len(manager.log_buffer),
    }


@app.get("/api/history/logs")
async def get_log_history(limit: int = 100):
    """Veritabanından geçmiş logları getirir."""
    with Session(engine) as session:
        statement = select(LogModel).order_by(LogModel.created_at.desc()).limit(limit)
        results = session.exec(statement).all()
        return [r.model_dump() for r in results]


@app.get("/api/history/correlations")
async def get_correlation_history(limit: int = 20):
    """Veritabanından geçmiş korelasyonları getirir."""
    with Session(engine) as session:
        statement = select(CorrelationModel).order_by(CorrelationModel.created_at.desc()).limit(limit)
        results = session.exec(statement).all()
        return [r.model_dump() for r in results]


# ──────────────────────────────────────────────
# WebSocket Endpoint
# ──────────────────────────────────────────────
@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    """Canlı log akışı — dashboard bağlantı noktası."""
    await manager.connect(websocket)
    logger.info(f"✅ WebSocket bağlandı. Toplam: {len(manager.active_connections)}")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"❌ WebSocket ayrıldı. Kalan: {len(manager.active_connections)}")
