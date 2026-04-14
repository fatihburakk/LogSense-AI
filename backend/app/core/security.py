from fastapi import Header, HTTPException
from loguru import logger
from .config import LOGSENSE_API_KEY

from typing import Optional

def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-KEY")):
    """X-API-KEY header doğrulaması. Hatalı/eksik → 403 Forbidden"""
    # Eğer sistemde bir API key tanımlanmamışsa her gelen isteği kabul et
    if not LOGSENSE_API_KEY:
        return

    # Anahtar tanımlıysa ama istemci göndermemişse veya yanlış göndermişse reddet
    if not x_api_key or x_api_key != LOGSENSE_API_KEY:
        logger.warning(f"Geçersiz veya eksik API Key denemesi.")
        raise HTTPException(status_code=403, detail="Geçersiz API anahtarı")
