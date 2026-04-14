import os
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from datetime import datetime
from database import engine
from models import SystemSettings
from worker import run_maintenance

router = APIRouter(prefix="/api/system", tags=["System"])

BACKUP_DIR = "/app/backups"

@router.get("/settings")
def get_settings():
    with Session(engine) as session:
        settings = session.exec(select(SystemSettings)).first()
        return settings

@router.post("/settings")
def update_settings(new_settings: dict):
    with Session(engine) as session:
        settings = session.exec(select(SystemSettings)).first()
        if not settings:
            settings = SystemSettings()
        
        if "retention_days" in new_settings:
            settings.retention_days = new_settings["retention_days"]
        if "auto_backup" in new_settings:
            settings.auto_backup = new_settings["auto_backup"]
            
        settings.updated_at = datetime.utcnow()
        session.add(settings)
        session.commit()
        session.refresh(settings)
        return settings

@router.get("/backups")
def list_backups():
    if not os.path.exists(BACKUP_DIR):
        return []
    
    backups = []
    for filename in os.listdir(BACKUP_DIR):
        if filename.endswith(".gz") or filename.endswith(".csv"):
            filepath = os.path.join(BACKUP_DIR, filename)
            stats = os.stat(filepath)
            backups.append({
                "filename": filename,
                "size_mb": round(stats.st_size / (1024 * 1024), 2),
                "created_at": datetime.fromtimestamp(stats.st_ctime).isoformat()
            })
    
    # Sort by date descending
    return sorted(backups, key=lambda x: x["created_at"], reverse=True)

@router.get("/backups/{filename}/download")
def download_backup(filename: str):
    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Yedek dosyası bulunamadı")
    
    return FileResponse(
        path=filepath,
        filename=filename,
        media_type="application/gzip"
    )

@router.delete("/backups/{filename}")
def delete_backup(filename: str):
    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Yedek dosyası bulunamadı")
    
    os.remove(filepath)
    return {"status": "success", "message": f"{filename} silindi"}

@router.post("/maintenance")
async def trigger_maintenance():
    """Bakım görevini manuel olarak tetikler (asenkron)."""
    # Bu basitlik için doğrudan worker fonksiyonunu çağırmak yerine 
    # Celery görevi olarak kuyruğa atıyoruz.
    run_maintenance.delay()
    return {"status": "success", "message": "Bakım görevi kuyruğa alındı."}
