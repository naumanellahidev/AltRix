import os
import time
import socket
import ssl
import subprocess
import requests
import urllib3
from flask import Blueprint, jsonify, request
from app.security.rbac import require_auth
from app.utils.response import api_success, api_error

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

webmail_bp = Blueprint("webmail_bp", __name__)

def check_tcp_port(host, port, use_ssl=False, timeout=3.0):
    start = time.time()
    try:
        if use_ssl:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with socket.create_connection((host, port), timeout=timeout) as sock:
                with ctx.wrap_socket(sock) as ssock:
                    latency = (time.time() - start) * 1000
                    return True, round(latency, 1), "OK"
        else:
            with socket.create_connection((host, port), timeout=timeout):
                latency = (time.time() - start) * 1000
                return True, round(latency, 1), "OK"
    except Exception as e:
        return False, 0, str(e)

@webmail_bp.route("/api/webmail/status", methods=["GET"])
@require_auth
def get_webmail_status():
    try:
        # 1. Container status check
        p_cont = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Status}}", "mailu_webmail"],
            capture_output=True, text=True, timeout=5
        )
        container_status = p_cont.stdout.strip().lower() or "unknown"
        is_running = container_status == "running"

        # 2. Internal HTTP probe
        http_ok = False
        http_latency = 0.0
        http_code = 0
        if is_running:
            t0 = time.time()
            try:
                r = requests.get("https://front:443/webmail/", verify=False, timeout=4, allow_redirects=True)
                http_latency = round((time.time() - t0) * 1000, 1)
                http_code = r.status_code
                http_ok = r.status_code in [200, 302]
            except Exception:
                # Fallback to local gateway
                try:
                    r2 = requests.get("https://127.0.0.1:8443/webmail/", verify=False, timeout=4, allow_redirects=True)
                    http_latency = round((time.time() - t0) * 1000, 1)
                    http_code = r2.status_code
                    http_ok = r2.status_code in [200, 302]
                except Exception:
                    http_ok = False

        # 3. IMAP & SMTP Subsystem Probes
        imap_ok, imap_latency, _ = check_tcp_port("front", 993, use_ssl=True)
        if not imap_ok:
            imap_ok, imap_latency, _ = check_tcp_port("169.58.111.159", 993, use_ssl=True)

        smtp_ok, smtp_latency, _ = check_tcp_port("front", 465, use_ssl=True)
        if not smtp_ok:
            smtp_ok, smtp_latency, _ = check_tcp_port("169.58.111.159", 465, use_ssl=True)

        # 4. Public Hostname Configuration
        mail_host = os.environ.get("MAIL_HOSTNAME", "").strip()
        public_configured = bool(mail_host and mail_host != "localhost" and not mail_host.endswith(".local"))
        public_url = f"https://{mail_host}/webmail/" if public_configured else None

        # 5. Aggregate Status Determination
        if not is_running or not http_ok:
            aggregate_status = "UNAVAILABLE"
        elif not (imap_ok and smtp_ok):
            aggregate_status = "DEGRADED"
        elif not public_configured:
            aggregate_status = "HEALTHY_INTERNAL"
        else:
            aggregate_status = "HEALTHY"

        return api_success({
            "engine": "Roundcube Webmail (Mailu Integrated)",
            "status": aggregate_status,
            "container_status": container_status,
            "internal_http": {
                "accessible": http_ok,
                "status_code": http_code,
                "latency_ms": http_latency
            },
            "subsystems": {
                "imap_ssl": {"status": "OPERATIONAL" if imap_ok else "UNAVAILABLE", "port": 993, "latency_ms": imap_latency},
                "smtp_ssl": {"status": "OPERATIONAL" if smtp_ok else "UNAVAILABLE", "port": 465, "latency_ms": smtp_latency}
            },
            "public_access": {
                "configured": public_configured,
                "public_url": public_url,
                "guidance": "Public webmail access will be activated once the platform public hostname is finalized." if not public_configured else "Direct webmail access active."
            },
            "capabilities": [
                "HTML Rich Text Compose",
                "Attachment Upload & Download",
                "Instant IMAP Synchronization",
                "Folder Hierarchy (Inbox, Sent, Drafts, Trash, Junk)",
                "Full-Text Mailbox Search",
                "Address Book & Contact Management",
                "Spam Filter Integration (Rspamd)",
                "DKIM/SPF Authentication on Outbound Delivery"
            ]
        })
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)
