from fastapi import APIRouter, HTTPException
from sqlmodel import Session, select
from database import engine
from models import AlertModel, LogEntry

router = APIRouter(prefix="/api/alerts")

@router.get("")
async def get_alerts(only_open: bool = False):
    """Veritabanından alarmları (anomali tespitleri) getirir, bağlı logun AI analizini de ekler."""
    with Session(engine) as session:
        # AlertModel ve LogEntry'yi log_id üzerinden birleştiriyoruz
        statement = select(AlertModel, LogEntry).where(AlertModel.log_id == LogEntry.id)
        
        if only_open:
            statement = statement.where(AlertModel.is_resolved == False, AlertModel.is_false_positive == False)

        statement = statement.order_by(AlertModel.created_at.desc())
        results = session.exec(statement).all()
        
        response = []
        for alert, log in results:
            alert_data = alert.model_dump(mode="json")
            # Log'dan gelen AI ve Enrichment bilgilerini alert paketine ekliyoruz
            alert_data["ai_analysis"] = log.ai_analysis
            alert_data["enrichment"] = log.enrichment
            response.append(alert_data)
            
        return response

@router.post("/{alert_id}/resolve")
async def resolve_alert(alert_id: int):
    """Bir alarmı 'çözüldü' olarak işaretler."""
    with Session(engine) as session:
        alert = session.get(AlertModel, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alarm bulunamadı")
        alert.is_resolved = True
        session.add(alert)
        session.commit()
        return {"status": "resolved", "id": alert_id}

@router.post("/{alert_id}/false-positive")
async def mark_false_positive(alert_id: int):
    """Bir alarmı 'hatalı alarm' olarak işaretler."""
    with Session(engine) as session:
        alert = session.get(AlertModel, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alarm bulunamadı")
        alert.is_false_positive = True
        session.add(alert)
        session.commit()
        return {"status": "false_positive", "id": alert_id}
