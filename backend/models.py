from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, JSON, Column

class LogBase(SQLModel):
    timestamp: str
    level: str
    message: str
    source: str
    # JSON alanları SQLAlchemy'nin JSON tipini kullanması için Column(JSON) olarak tanımlıyoruz
    enrichment: Optional[Dict[str, Any]] = Field(default={}, sa_column=Column(JSON))
    ai_analysis: Optional[Dict[str, Any]] = Field(default={}, sa_column=Column(JSON))

class LogEntry(LogBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CorrelationModel(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    group_id: str = Field(index=True)
    chain_type: str
    chain_label: str
    event_count: int
    # events listesini JSON olarak saklıyoruz
    events: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    root_cause: Optional[str] = None
    impact_summary: Optional[str] = None
    age_seconds: float
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AlertModel(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    log_id: int
    level: str
    source: str
    message: str
    timestamp: str
    is_resolved: bool = Field(default=False)
    is_false_positive: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
