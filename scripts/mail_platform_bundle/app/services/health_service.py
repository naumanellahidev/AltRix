import os
import sqlite3
import time
from app.config.settings import config
from app.integrations.mailu_cli import mailu_cli

START_TIME = time.time()

class HealthService:
    @staticmethod
    def get_liveness():
        return {
            "status": "healthy",
            "uptime_seconds": round(time.time() - START_TIME, 1),
            "service": "altrix-mail-control-center",
            "api_version": config.API_VERSION
        }

    @staticmethod
    def get_readiness():
        checks = {}
        # 1. Database Check
        try:
            conn = sqlite3.connect(config.DATABASE_PATH)
            cur = conn.cursor()
            cur.execute("SELECT 1")
            conn.close()
            checks["database"] = {"status": "ok"}
        except Exception as e:
            checks["database"] = {"status": "error", "message": "Database query failed"}

        # 2. SMTP Daemon Check
        smtp_status = mailu_cli.inspect_container("mailu_smtp")
        checks["smtp"] = {"status": "ok" if smtp_status == "running" else "degraded"}

        # 3. IMAP Daemon Check
        imap_status = mailu_cli.inspect_container("mailu_imap")
        checks["imap"] = {"status": "ok" if imap_status == "running" else "degraded"}

        is_ready = all(v["status"] == "ok" for v in checks.values())
        return {
            "status": "ready" if is_ready else "not_ready",
            "checks": checks
        }

health_service = HealthService()
