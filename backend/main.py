"""
LogSense AI — FastAPI Backend
Gerçek zamanlı log toplama, WebSocket yayını ve anomali analiz merkezi.
"""

import json
import asyncio
from datetime import datetime, timezone
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from ai_engine import ai_engine
from log_enricher import log_enricher
from correlation_engine import correlation_engine
from database import init_db, engine
from models import LogEntry as LogModel, CorrelationModel, AlertModel
from sqlmodel import Session, select


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


class LogResponse(BaseModel):
    status: str
    log: LogEntry


# ──────────────────────────────────────────────
# WebSocket Connection Manager
# ──────────────────────────────────────────────
class ConnectionManager:
    """Aktif WebSocket bağlantılarını yönetir."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.log_buffer: List[dict] = []
        self.buffer_size: int = 100  # Bellekte tutulacak son log sayısı

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        # Yeni bağlanan istemciye mevcut log geçmişini gönder
        if self.log_buffer:
            await websocket.send_json({
                "type": "history",
                "data": self.log_buffer
            })

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, log_data: dict):
        """Logu tüm bağlı istemcilere yayınla ve buffer'a ekle."""
        self.log_buffer.append(log_data)
        if len(self.log_buffer) > self.buffer_size:
            self.log_buffer.pop(0)

        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json({
                    "type": "log",
                    "data": log_data
                })
            except Exception:
                disconnected.append(connection)

        for conn in disconnected:
            self.active_connections.remove(conn)


manager = ConnectionManager()


# ──────────────────────────────────────────────
# FastAPI Application
# ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 LogSense AI Backend başlatıldı!")
    # Veritabanı tablolarını oluştur
    init_db()
    print("📁 SQLite Veritabanı (logs.db) hazır.")
    
    # Startup'ta son 100 logu DB'den buffer'a yükle (opsiyonel)
    with Session(engine) as session:
        statement = select(LogModel).order_by(LogModel.created_at.desc()).limit(100)
        db_logs = session.exec(statement).all()
        # Modelleri dict'e çevirip buffer'a ekle
        manager.log_buffer = [log.model_dump() for log in reversed(db_logs)]
        print(f"📦 Veritabanından {len(manager.log_buffer)} geçmiş kayıt yüklendi.")

    print("📡 WebSocket: ws://localhost:8000/ws/logs")
    print("📥 Log Endpoint: POST http://localhost:8000/api/logs")
    yield
    print("🛑 LogSense AI Backend kapatıldı.")


app = FastAPI(
    title="LogSense AI",
    description="Akıllı Sistem Gözlemleme ve Anomali Tespit Sistemi",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — Next.js frontend erişimi
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
        "version": "2.0.0",
        "status": "running",
        "loaded_models": list(ai_engine.models.keys()),
        "llm_active": ai_engine.client is not None,
        "endpoints": {
            "logs": "POST /api/logs",
            "websocket": "ws://localhost:8000/ws/logs",
            "stats": "GET /api/stats",
        }
    }


@app.post("/api/logs", response_model=LogResponse)
async def receive_log(log: LogEntry):
    """
    Log kabul noktası. Gelen logu:
    1. Log Enrichment işleminden geçirir (IP, HTTP kod vb.)
    2. Kaynak (source) bilgisine göre doğru ML modeline yönlendirir
    3. Anomali tespit edilirse LLM'e derinlemesine analiz yaptırır
    4. Korelasyon analizine sokar, yeni grup oluşursa yayınlar
    5. Tüm sonuçları WebSocket ile dashboard'a yayınlar
    """
    log_data = log.model_dump()

    # 1. Log Enrichment (Zenginleştirme)
    enrichment = log_enricher.enrich(log_data)
    if enrichment:
        log_data["enrichment"] = enrichment

    # 2 & 3. AI Analizi (ML + LLM)
    ai_result = ai_engine.process_log(log_data)
    log_data["ai_analysis"] = ai_result

    # 4. Event Correlation (Korelasyon)
    correlation_group = None
    try:
        correlation_group = correlation_engine.process(log_data)
    except Exception as e:
        print(f"❌ Correlation error: {e}")

    # 5. Veritabanına Kaydet (Persistence)
    try:
        with Session(engine) as session:
            db_log = LogModel(**log_data)
            session.add(db_log)
            
            # Eğer anomali ise Alert tablosuna da kaydet
            if ai_result.get("ml_prediction") == "anomaly":
                db_alert = AlertModel(
                    log_id=0,
                    level=log_data["level"],
                    source=log_data["source"],
                    message=log_data["message"],
                    timestamp=log_data["timestamp"]
                )
                session.add(db_alert)
            
            if correlation_group:
                stmt = select(CorrelationModel).where(CorrelationModel.group_id == correlation_group["group_id"])
                existing_corr = session.exec(stmt).first()
                if existing_corr:
                    for key, value in correlation_group.items():
                        setattr(existing_corr, key, value)
                    session.add(existing_corr)
                else:
                    db_corr = CorrelationModel(**correlation_group)
                    session.add(db_corr)
            
            session.commit()
            print(f"💾 Log DB'ye kaydedildi: {log_data['level']} / {log_data['source']}")
    except Exception as e:
        print(f"❌ Database error: {e}")

    # 6. WebSocket üzerinden broadcast
    try:
        await manager.broadcast(log_data)
        if correlation_group:
            for connection in manager.active_connections:
                try:
                    await connection.send_json({"type": "correlation", "data": correlation_group})
                except: pass
        print(f"📡 WebSocket yayını tamam: {log_data['message'][:30]}...")
    except Exception as e:
        print(f"❌ WebSocket broadcast error: {e}")

    return {"status": "received", "log": log_data}


@app.get("/api/stats")
async def get_stats():
    """Anlık sistem durumu istatistikleri."""
    buffer = manager.log_buffer
    level_counts = {}
    anomaly_count = 0

    for entry in buffer:
        level = entry.get("level", "UNKNOWN")
        level_counts[level] = level_counts.get(level, 0) + 1

        ai = entry.get("ai_analysis", {})
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
    """
    Canlı log akışı WebSocket endpoint'i.
    Dashboard bu endpoint'e bağlanarak gerçek zamanlı log izler.
    """
    await manager.connect(websocket)
    print(f"✅ Yeni WebSocket bağlantısı. Toplam: {len(manager.active_connections)}")

    try:
        while True:
            # İstemciden gelen mesajları dinle (keep-alive / komut)
            data = await websocket.receive_text()
            # İleride buradan komut gönderilebilir (örn: filtre değiştir)
            pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print(f"❌ WebSocket bağlantısı koptu. Kalan: {len(manager.active_connections)}")
