from fastapi import APIRouter
from ..services.websocket import manager
from ..core.config import LOGSENSE_API_KEY, LLM_TIMEOUT_SECONDS
from ai_engine import ai_engine
from correlation_engine import correlation_engine

router = APIRouter()

@router.get("/")
async def root():
    return {
        "service": "LogSense AI",
        "version": "3.0.0",
        "status": "running",
        "processing": "async (BackgroundTasks)",
        "security": "API Key enabled" if LOGSENSE_API_KEY else "OPEN",
        "llm_timeout_seconds": LLM_TIMEOUT_SECONDS,
        "loaded_models": list(ai_engine.models.keys()),
        "llm_active": ai_engine.client is not None,
    }

@router.get("/api/stats")
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

@router.get("/api/health")
async def health_check():
    """Sistem sağlık kontrolü — yük dengeleyiciler için."""
    return {
        "status": "healthy",
        "models_loaded": len(ai_engine.models),
        "ws_connections": len(manager.active_connections),
        "buffer_size": len(manager.log_buffer),
    }
