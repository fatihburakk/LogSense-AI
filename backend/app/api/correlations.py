from fastapi import APIRouter
from sqlmodel import Session, select
from database import engine
from models import CorrelationModel

router = APIRouter(prefix="/api/history/correlations")

@router.get("")
async def get_correlation_history(limit: int = 20):
    """Veritabanından geçmiş korelasyonları getirir."""
    with Session(engine) as session:
        statement = select(CorrelationModel).order_by(CorrelationModel.created_at.desc()).limit(limit)
        results = session.exec(statement).all()
        return [r.model_dump(mode="json") for r in results]
