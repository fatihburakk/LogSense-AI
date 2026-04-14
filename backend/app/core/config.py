import os
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

LOGSENSE_API_KEY = os.getenv("LOGSENSE_API_KEY", "")
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "12"))
BUFFER_SIZE = int(os.getenv("BUFFER_SIZE", "100"))
