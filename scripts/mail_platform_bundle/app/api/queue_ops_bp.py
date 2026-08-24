import re
import json
import time
import subprocess
from flask import Blueprint, jsonify, request, g
from app.security.rbac import require_auth, require_role
from app.database import log_audit
from app.utils.response import api_success, api_error

queue_bp = Blueprint("queue_bp", __name__)

def classify_bounce_reason(status_text, dsn=""):
    text_lower = status_text.lower()
    
    if "saved" in text_lower or "status=sent" in text_lower or "250 2.0.0" in text_lower or "queued as" in text_lower:
        return "DELIVERED"
    if "domain not found" in text_lower or "nxdomain" in text_lower or "host or domain name not found" in text_lower or "no mx" in text_lower:
        return "DNS_FAILURE"
    if "user unknown" in text_lower or "mailbox unavailable" in text_lower or "recipient address rejected" in text_lower or "5.1.1" in dsn:
        return "MAILBOX_NOT_FOUND"
    if "relay access denied" in text_lower or "relay denied" in text_lower or "5.7.1" in dsn:
        return "REMOTE_REJECTED"
    if "spam" in text_lower or "rspamd" in text_lower or "spamhaus" in text_lower or "policy block" in text_lower or "blocked" in text_lower:
        return "SPAM_REJECTION"
    if "rate limit" in text_lower or "too many connections" in text_lower or "greylisted" in text_lower or "try again later" in text_lower or "4.7.1" in dsn:
        return "RATE_LIMITED"
    if "authentication failed" in text_lower or "badauth" in text_lower or "sasl" in text_lower or "5.7.8" in dsn or "535" in text_lower:
        return "AUTHENTICATION_FAILURE"
    if "ssl" in text_lower or "tls" in text_lower or "certificate" in text_lower or "handshake" in text_lower:
        return "TLS_FAILURE"
    if status_text.startswith("4") or "status=deferred" in text_lower or dsn.startswith("4."):
        return "TEMPORARY_FAILURE"
    if status_text.startswith("5") or "status=bounced" in text_lower or dsn.startswith("5."):
        return "PERMANENT_FAILURE"
    return "UNKNOWN"

@queue_bp.route("/api/queue/status", methods=["GET"])
@require_auth
def get_queue_status():
    try:
        p = subprocess.run(["docker", "exec", "mailu_smtp", "postqueue", "-j"], capture_output=True, text=True, timeout=5)
        
        messages = []
        active_count = 0
        deferred_count = 0
        held_count = 0
        oldest_age_sec = 0
        now = time.time()

        if p.returncode == 0 and p.stdout.strip():
            for line in p.stdout.splitlines():
                line = line.strip()
                if not line or not line.startswith("{"):
                    continue
                try:
                    item = json.loads(line)
                    q_name = item.get("queue_name", "active").lower()
                    q_id = item.get("queue_id", "UNKNOWN")
                    arrival = item.get("arrival_time", now)
                    size = item.get("message_size", 0)
                    sender = item.get("sender", "<>")
                    
                    if q_name == "active":
                        active_count += 1
                    elif q_name == "deferred":
                        deferred_count += 1
                    elif q_name == "hold":
                        held_count += 1

                    age_sec = max(0, int(now - arrival))
                    if age_sec > oldest_age_sec:
                        oldest_age_sec = age_sec

                    rcpt_list = item.get("recipients", [])
                    rcpt_addrs = [r.get("address", "") for r in rcpt_list if isinstance(r, dict)]
                    delay_reasons = [r.get("delay_reason", "") for r in rcpt_list if isinstance(r, dict) and r.get("delay_reason")]
                    primary_reason = delay_reasons[0] if delay_reasons else ""

                    messages.append({
                        "id": q_id,
                        "queue_name": q_name,
                        "sender": sender,
                        "recipients": rcpt_addrs,
                        "size_bytes": size,
                        "arrival_timestamp": arrival,
                        "age_seconds": age_sec,
                        "delay_reason": primary_reason,
                        "classification": classify_bounce_reason(primary_reason) if primary_reason else "QUEUED"
                    })
                except Exception:
                    continue

        total_queued = active_count + deferred_count + held_count
        if total_queued == 0:
            health = "HEALTHY_EMPTY"
        elif total_queued < 20:
            health = "NORMAL"
        elif total_queued < 100:
            health = "CONGESTED"
        else:
            health = "CRITICAL"

        return api_success({
            "health": health,
            "total_queued": total_queued,
            "breakdown": {
                "active": active_count,
                "deferred": deferred_count,
                "held": held_count
            },
            "oldest_age_seconds": oldest_age_sec,
            "messages": messages
        })
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@queue_bp.route("/api/queue/flush", methods=["POST"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN", "superadmin", "admin")
def flush_mail_queue():
    try:
        actor = getattr(g, "current_user", {}).get("username", "admin")
        p = subprocess.run(["docker", "exec", "mailu_smtp", "postqueue", "-f"], capture_output=True, text=True, timeout=10)
        
        if p.returncode == 0:
            log_audit(
                actor=actor,
                ip=request.remote_addr,
                action="QUEUE_FLUSH",
                resource="postfix_queue",
                status="SUCCESS",
                details="Triggered full postqueue -f delivery retry across all deferred queues"
            )
            return api_success({"message": "Postfix mail queue flush initiated successfully."})
        else:
            return api_error(f"Failed to flush queue: {p.stderr or p.stdout}", code="EXEC_ERROR", status_code=500)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@queue_bp.route("/api/queue/delete", methods=["POST"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN", "superadmin", "admin")
def delete_queue_message():
    try:
        actor = getattr(g, "current_user", {}).get("username", "admin")
        body = request.get_json() or {}
        queue_id = body.get("queue_id", "").strip()
        
        if not queue_id:
            return api_error("Missing queue_id parameter", code="VALIDATION_ERROR", status_code=400)

        p = subprocess.run(["docker", "exec", "mailu_smtp", "postsuper", "-d", queue_id], capture_output=True, text=True, timeout=10)
        
        log_audit(
            actor=actor,
            ip=request.remote_addr,
            action="QUEUE_DELETE",
            resource=f"postfix_queue:{queue_id}",
            status="SUCCESS" if p.returncode == 0 else "FAILURE",
            details=f"Output: {p.stdout or p.stderr}"
        )

        if p.returncode == 0:
            return api_success({"message": f"Queued message {queue_id} deleted successfully."})
        else:
            return api_error(f"Failed to delete queue message: {p.stderr or p.stdout}", code="EXEC_ERROR", status_code=500)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@queue_bp.route("/api/queue/hold", methods=["POST"])
@require_auth
@require_role("SUPER_ADMIN", "ADMIN", "superadmin", "admin")
def hold_queue_message():
    try:
        actor = getattr(g, "current_user", {}).get("username", "admin")
        body = request.get_json() or {}
        queue_id = body.get("queue_id", "").strip()
        action = body.get("action", "hold").lower()
        
        if not queue_id:
            return api_error("Missing queue_id parameter", code="VALIDATION_ERROR", status_code=400)

        flag = "-h" if action == "hold" else "-H"
        p = subprocess.run(["docker", "exec", "mailu_smtp", "postsuper", flag, queue_id], capture_output=True, text=True, timeout=10)
        
        log_audit(
            actor=actor,
            ip=request.remote_addr,
            action=f"QUEUE_{action.upper()}",
            resource=f"postfix_queue:{queue_id}",
            status="SUCCESS" if p.returncode == 0 else "FAILURE",
            details=f"Output: {p.stdout or p.stderr}"
        )

        if p.returncode == 0:
            return api_success({"message": f"Queued message {queue_id} state updated to {action}."})
        else:
            return api_error(f"Failed to update queue message: {p.stderr or p.stdout}", code="EXEC_ERROR", status_code=500)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@queue_bp.route("/api/queue/logs", methods=["GET"])
@require_auth
def get_delivery_logs():
    try:
        event_filter = request.args.get("event_type", "all").lower()
        domain_filter = request.args.get("domain", "").lower()
        search_query = request.args.get("search", "").lower()
        limit = min(200, max(1, int(request.args.get("limit", 50))))
        offset = max(0, int(request.args.get("offset", 0)))

        p = subprocess.run(["docker", "logs", "--tail", "300", "mailu_smtp"], capture_output=True, text=True, timeout=6)
        raw_lines = (p.stdout or p.stderr).splitlines()

        parsed_events = []

        status_re = re.compile(r'([A-Za-z]{3}\s+\d+\s+\d+:\d+:\d+).*?postfix/(\w+)\[\d+\]:\s+([0-9A-Fa-f]+):\s+to=<([^>]+)>(?:,\s+relay=([^,]+))?.*?(?:dsn=([^,]+))?,\s+status=(\w+)\s+\(([^)]+)\)')
        reject_re = re.compile(r'([A-Za-z]{3}\s+\d+\s+\d+:\d+).*?postfix/smtpd\[\d+\]:\s+NOQUEUE:\s+reject:\s+RCPT\s+from\s+([^:]+):\s+(\d+)\s+([0-9.]+)\s+<([^>]+)>:\s+([^;]+);\s+from=<([^>]*)>\s+to=<([^>]+)>')

        for line in reversed(raw_lines):
            m_stat = status_re.search(line)
            if m_stat:
                ts, daemon, qid, to_addr, relay, dsn, status, reason = m_stat.groups()
                classification = classify_bounce_reason(f"{status} {reason}", dsn or "")
                event_type = status.lower()
                
                parsed_events.append({
                    "timestamp": ts,
                    "queue_id": qid,
                    "event_type": event_type,
                    "sender": "Local Delivery / Authenticated",
                    "recipient": to_addr,
                    "relay": relay or "internal",
                    "dsn": dsn or ("2.0.0" if event_type == "sent" else "4.0.0"),
                    "status_text": reason,
                    "classification": classification
                })
                continue

            m_rej = reject_re.search(line)
            if m_rej:
                ts, client_host, code, dsn, target, reason, from_addr, to_addr = m_rej.groups()
                classification = classify_bounce_reason(f"{code} {reason}", dsn)

                parsed_events.append({
                    "timestamp": ts,
                    "queue_id": "NOQUEUE",
                    "event_type": "reject",
                    "sender": from_addr or "<>",
                    "recipient": to_addr,
                    "relay": client_host,
                    "dsn": dsn,
                    "status_text": f"{code} {reason}",
                    "classification": classification
                })

        filtered = []
        for ev in parsed_events:
            if event_filter != "all":
                if event_filter == "delivered" and ev["event_type"] != "sent":
                    continue
                elif event_filter == "deferred" and ev["event_type"] != "deferred":
                    continue
                elif event_filter == "bounced" and ev["event_type"] not in ["bounced", "reject"]:
                    continue
                elif event_filter == "reject" and ev["event_type"] != "reject":
                    continue

            if domain_filter:
                if domain_filter not in ev["recipient"] and domain_filter not in ev["sender"]:
                    continue

            if search_query:
                combined = f"{ev['queue_id']} {ev['sender']} {ev['recipient']} {ev['status_text']} {ev['classification']}".lower()
                if search_query not in combined:
                    continue

            filtered.append(ev)

        total_count = len(filtered)
        paginated = filtered[offset:offset+limit]

        return api_success({
            "total_count": total_count,
            "limit": limit,
            "offset": offset,
            "events": paginated
        })
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@queue_bp.route("/api/queue/alerts", methods=["GET"])
@require_auth
def get_queue_alerts():
    try:
        p_q = subprocess.run(["docker", "exec", "mailu_smtp", "postqueue", "-j"], capture_output=True, text=True, timeout=4)
        total_queued = len([l for l in p_q.stdout.splitlines() if l.strip().startswith("{")]) if p_q.returncode == 0 else 0

        alerts = []
        if total_queued > 50:
            alerts.append({
                "type": "QUEUE_BACKLOG",
                "severity": "CRITICAL" if total_queued > 100 else "WARNING",
                "message": f"Mail queue has {total_queued} backlog messages pending dispatch."
            })

        p_df = subprocess.run(["df", "-h", "/"], capture_output=True, text=True, timeout=4)
        if p_df.returncode == 0:
            lines = p_df.stdout.splitlines()
            if len(lines) > 1:
                parts = lines[1].split()
                if len(parts) >= 5 and parts[4].endswith("%"):
                    pct = int(parts[4].replace("%", ""))
                    if pct > 85:
                        alerts.append({
                            "type": "DISK_PRESSURE",
                            "severity": "CRITICAL" if pct > 90 else "WARNING",
                            "message": f"Root volume storage utilization is high at {pct}%."
                        })

        return api_success({
            "active_alerts": alerts,
            "has_alerts": len(alerts) > 0
        })
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)
