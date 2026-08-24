from flask import jsonify, g
from datetime import datetime

def api_success(data=None, message="Operation completed successfully", meta=None, status_code=200):
    payload = {
        "success": True,
        "status": "success",
        "message": message,
        "data": data if data is not None else {},
        "meta": {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "version": "v1",
            "request_id": getattr(g, "request_id", None),
            **(meta or {})
        }
    }
    return jsonify(payload), status_code

def api_error(message, code="BAD_REQUEST", status_code=400, details=None):
    payload = {
        "success": False,
        "status": "error",
        "message": message,
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": getattr(g, "request_id", None)
        }
    }
    return jsonify(payload), status_code
