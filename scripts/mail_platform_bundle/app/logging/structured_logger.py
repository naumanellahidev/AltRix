import logging
import json
import time
import os
from datetime import datetime
from flask import request, g

SENSITIVE_KEYS = {"password", "token", "new_password", "old_password", "secret", "authorization"}

def sanitize_data(data):
    if isinstance(data, dict):
        clean = {}
        for k, v in data.items():
            if any(s in k.lower() for s in SENSITIVE_KEYS):
                clean[k] = "[REDACTED]"
            elif isinstance(v, (dict, list)):
                clean[k] = sanitize_data(v)
            else:
                clean[k] = v
        return clean
    elif isinstance(data, list):
        return [sanitize_data(item) for item in data]
    return data

class StructuredLogger:
    def __init__(self, app=None):
        if app:
            self.init_app(app)

    def init_app(self, app):
        logging.basicConfig(level=logging.INFO, format="%(message)s")
        self.logger = logging.getLogger("control_center")

        @app.before_request
        def before_request_logging():
            g.start_time = time.time()
            g.request_id = os.urandom(8).hex()

        @app.after_request
        def after_request_logging(response):
            if request.path.startswith("/assets/"):
                return response
            duration_ms = round((time.time() - getattr(g, "start_time", time.time())) * 1000, 2)
            log_entry = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "request_id": getattr(g, "request_id", "unknown"),
                "method": request.method,
                "path": request.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "ip": request.headers.get("X-Forwarded-For", request.remote_addr),
                "actor": getattr(g, "current_user", {}).get("username", "anonymous") if hasattr(g, "current_user") else "anonymous"
            }
            self.logger.info(json.dumps(log_entry))
            return response

structured_logger = StructuredLogger()
