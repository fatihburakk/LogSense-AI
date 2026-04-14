from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, BackgroundTasks
from loguru import logger
from sqlmodel import Session, select

from models import LogEntry as LogModel, AlertModel, CorrelationModel
from database import engine
from sqlmodel import Session, select, delete
from ..core.security import verify_api_key
from ..services.websocket import manager
from ..services.log_processor import _process_log_background

from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Optional

router = APIRouter()

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

@router.post(
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

    background_tasks.add_task(_process_log_background, log_data)

    log_id = f"{log_data['source']}-{log_data['timestamp'][-8:]}"
    logger.debug(f"📥 Log kabul edildi → arka plana alındı: {log_id}")

    return LogAccepted(
        status="accepted",
        message="Log arkaplanda işleniyor",
        log_id=log_id,
    )

@router.get("/api/history/logs")
async def get_log_history(limit: int = 100):
    """Veritabanından geçmiş logları getirir."""
    with Session(engine) as session:
        statement = select(LogModel).order_by(LogModel.created_at.desc()).limit(limit)
        results = session.exec(statement).all()
        return [r.model_dump(mode="json") for r in results]

@router.delete("/api/history/clear-all")
async def delete_all_history():
    """Tüm log, alarm ve korelasyon geçmişini siler."""
    with Session(engine) as session:
        # Tüm tabloları siliyoruz
        session.execute(delete(LogModel))
        session.execute(delete(AlertModel))
        session.execute(delete(CorrelationModel))
        session.commit()
        logger.warning("🗑️ Tüm geçmiş veriler (logs, alerts, correlations) veritabanından silindi.")
        return {"status": "success", "message": "Tüm geçmiş temizlendi"}

@router.websocket("/ws/logs")
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
