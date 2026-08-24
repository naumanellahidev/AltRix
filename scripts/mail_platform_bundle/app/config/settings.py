import os

class Config:
    BIND_HOST = os.environ.get("BACKEND_BIND_HOST", "0.0.0.0")
    BIND_PORT = int(os.environ.get("BACKEND_BIND_PORT", "5000"))
    DATABASE_PATH = os.environ.get("DATABASE_PATH", "/data/main.db")
    MAIL_STORAGE_ROOT = os.environ.get("MAIL_STORAGE_ROOT", "/mail")
    DKIM_STORAGE_ROOT = os.environ.get("DKIM_STORAGE_ROOT", "/dkim")
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
    SECRET_KEY = os.environ.get("SECRET_KEY", "control-center-secure-key-2026")
    MAIL_HOSTNAME = os.environ.get("MAIL_HOSTNAME", "")
    API_VERSION = "v1"

config = Config()
