from sqlmodel import SQLModel, create_engine, Session
from pathlib import Path

# Veritabanı dosya yolu (backend klasörü içinde logs.db)
DB_FILE = Path(__file__).parent / "logs.db"
sqlite_url = f"sqlite:///{DB_FILE}"

# Engine oluşturma (check_same_thread=False SQLite için gerekli)
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

def init_db():
    """Tabloları oluşturur."""
    SQLModel.metadata.create_all(engine)

def get_session():
    """Veritabanı oturumu sağlar."""
    with Session(engine) as session:
        yield session
