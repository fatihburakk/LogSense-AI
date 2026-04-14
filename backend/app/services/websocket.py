from typing import List
from fastapi import WebSocket
from ..core.config import BUFFER_SIZE
import os
import json
import asyncio
from loguru import logger

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

    async def broadcast_ai_update(self, event_data: dict):
        """Celery'den gelen AI Update verisini tüm istemcilere dağıtır."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(event_data)
            except Exception:
                disconnected.append(connection)
        
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)

    async def listen_redis_pubsub(self):
        """Redis pub/sub kanalını dinleyerek dışarıdan gelen (Worker) event'leri WebSocket'e bağlar."""
        redis_url = os.getenv("REDIS_URL")
        if not redis_url:
            logger.info("❌ REDIS_URL bulunamadı, Pub/Sub dinleyicisi başlatılmadı.")
            return

        try:
            import redis.asyncio as aioredis
            redis_client = aioredis.from_url(redis_url, decode_responses=True)
            pubsub = redis_client.pubsub()
            await pubsub.subscribe("logsense_updates")
            logger.info("📡 Redis PubSub dinleyicisi başlatıldı (Kanal: logsense_updates)")
            
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    logger.debug(f"🔔 PubSub'dan mesaj geldi: {data['type']}")
                    await self.broadcast_ai_update(data)
                    
        except Exception as e:
            logger.error(f"PubSub dinleme hatası: {e}")

manager = ConnectionManager()
