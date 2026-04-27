import os
from sqlmodel import SQLModel, create_engine, Session, select
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Veritabanı yapılandırması
# DATABASE_URL: postgresql://user:pass@host:port/dbname
# Eğer Docker ya da dış bir DB kullanılıyorsa DATABASE_URL set edilir.
# Boşsa, yerel SQLite (logs.db) kullanılır.
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    DB_FILE = Path(__file__).parent / "logs.db"
    DATABASE_URL = f"sqlite:///{DB_FILE}"

# Engine oluşturma
# SQLite için 'check_same_thread=False' gereklidir, PostgreSQL için gerekmez.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

def init_db():
    """Tabloları oluşturur ve varsayılan ayarları ilklendirir."""
    SQLModel.metadata.create_all(engine)
    
    # Varsayılan ayarları kontrol et ve ekle
    from models import SystemSettings
    with Session(engine) as session:
        settings = session.exec(select(SystemSettings)).first()
        if not settings:
            default_settings = SystemSettings(retention_days=15, auto_backup=True)
            session.add(default_settings)
            session.commit()

def get_session():
    """Veritabanı oturumu sağlar."""
    with Session(engine) as session:
        yield session
