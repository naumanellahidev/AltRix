import os
import subprocess
from datetime import datetime
from flask import Blueprint, jsonify
from app.services.health_service import health_service

health_bp = Blueprint("health_bp", __name__)

_commit_sha = os.environ.get("GIT_COMMIT_SHA")
if not _commit_sha:
    try:
        _commit_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        _commit_sha = "0494c46"

_startup_time = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

@health_bp.route("/api/health", methods=["GET"])
@health_bp.route("/api/v1/health", methods=["GET"])
def health_liveness():
    res = health_service.get_liveness()
    return jsonify(res), 200

@health_bp.route("/api/ready", methods=["GET"])
@health_bp.route("/api/v1/ready", methods=["GET"])
def health_readiness():
    res = health_service.get_readiness()
    status_code = 200 if res["status"] == "ready" else 503
    return jsonify(res), status_code

@health_bp.route("/api/runtime/version", methods=["GET"])
@health_bp.route("/api/v1/runtime/version", methods=["GET"])
@health_bp.route("/api/version", methods=["GET"])
@health_bp.route("/api/v1/version", methods=["GET"])
def runtime_version():
    return jsonify({
        "status": "healthy",
        "service": "altrix-mail-control-center",
        "version": "1.0.0",
        "commit": _commit_sha,
        "short_commit": _commit_sha[:7] if _commit_sha else "unknown",
        "environment": os.environ.get("APP_ENV", "production"),
        "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "startup_time": _startup_time
    }), 200
