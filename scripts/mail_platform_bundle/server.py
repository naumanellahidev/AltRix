import json
import time
import uuid
import re
import os
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

_base_dir = os.path.dirname(os.path.abspath(__file__))
_frontend_dist = os.path.join(_base_dir, 'frontend', 'dist')
FRONTEND_DIST = _frontend_dist if os.path.isdir(_frontend_dist) else os.path.join(_base_dir, 'dist')

# In-memory storage state
STATE = {
    "domains": [
        {
            "name": "foundation.local",
            "max_users": 50,
            "max_quota_bytes": 53687091200,
            "used_quota_bytes": 2147483648,
            "user_count": 2,
            "alias_count": 1,
            "has_dkim": True,
            "dns_status": "VALIDATED",
            "created_at": "2026-08-20T10:00:00Z"
        }
    ],
    "mailboxes": [
        {
            "email": "admin@foundation.local",
            "domain": "foundation.local",
            "local_part": "admin",
            "quota_bytes": 10737418240,
            "used_bytes": 1288490188,
            "quota_percent": 12.0,
            "enabled": True,
            "created_at": "2026-08-20T10:05:00Z"
        },
        {
            "email": "support@foundation.local",
            "domain": "foundation.local",
            "local_part": "support",
            "quota_bytes": 5368709120,
            "used_bytes": 858993459,
            "quota_percent": 16.0,
            "enabled": True,
            "created_at": "2026-08-20T10:10:00Z"
        }
    ],
    "aliases": [
        {
            "id": "alias-1",
            "source": "help@foundation.local",
            "destination": "support@foundation.local",
            "domain": "foundation.local",
            "wildcard": False,
            "created_at": "2026-08-20T10:15:00Z"
        }
    ],
    "applications": [
        {
            "id": "app-1",
            "name": "AltrixCore Notification Engine",
            "sender_address": "notifications@foundation.local",
            "allowed_senders": ["notifications@foundation.local", "system@foundation.local"],
            "rate_limit_per_hour": 1000,
            "created_at": "2026-08-20T11:00:00Z",
            "last_used_at": "2026-08-21T22:45:00Z",
            "revoked": False
        }
    ],
    "queue_messages": [],
    "audit_logs": [
        {
            "id": "audit-1",
            "action": "DOMAIN_CREATE",
            "entity": "domain:foundation.local",
            "actor": "admin@foundation.local",
            "timestamp": "2026-08-20T10:00:00Z",
            "ip": "127.0.0.1"
        }
    ]
}

class MailuControlCenterHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200, wrap=True):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        
        if wrap and isinstance(data, (dict, list)) and not (isinstance(data, dict) and ('error' in data or 'status' in data)):
            response_payload = {"status": "success", "data": data}
        else:
            response_payload = data
            
        self.wfile.write(json.dumps(response_payload).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def _serve_static_or_spa(self, raw_path):
        clean_path = raw_path.split('?')[0].lstrip('/')
        file_path = os.path.join(FRONTEND_DIST, clean_path)

        if os.path.isfile(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                mime_type = 'application/octet-stream'
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'public, max-age=3600' if clean_path.startswith('assets/') else 'no-cache')
            self.end_headers()
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
            return True

        # SPA Fallback for client-side routing (/login, /domains, /settings, etc.)
        index_path = os.path.join(FRONTEND_DIST, 'index.html')
        if os.path.isfile(index_path):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            with open(index_path, 'rb') as f:
                self.wfile.write(f.read())
            return True

        return False

    def normalize_path(self, path):
        if path.startswith('/api/v1'):
            return path[7:]
        if path.startswith('/api'):
            return path[4:]
        return path

    def do_GET(self):
        parsed = urlparse(self.path)

        # Serve static assets immediately if requested
        if parsed.path.startswith('/assets/') or parsed.path.endswith('.js') or parsed.path.endswith('.css') or parsed.path.endswith('.ico') or parsed.path.endswith('.svg') or parsed.path.endswith('.png'):
            if self._serve_static_or_spa(parsed.path):
                return

        path = self.normalize_path(parsed.path)

        # 1. Auth Me
        if path == '/auth/me':
            return self._send_json({
                "user": {
                    "email": STATE.get("active_user", "admin@altrixcore.com"),
                    "role": "SUPER_ADMIN",
                    "domains": [d["name"] for d in STATE["domains"]],
                    "created_at": "2026-08-20T10:00:00Z"
                }
            })

        # 2. Overview / Dashboard
        if path in ['/overview', '/dashboard/overview']:
            return self._send_json({
                "mail_entities": {
                    "domains": len(STATE["domains"]),
                    "mailboxes": len(STATE["mailboxes"]),
                    "aliases": len(STATE["aliases"]),
                    "applications": len([a for a in STATE["applications"] if not a["revoked"]])
                },
                "queue": {
                    "count": len(STATE["queue_messages"]),
                    "empty": len(STATE["queue_messages"]) == 0,
                    "status": "CLEAR" if len(STATE["queue_messages"]) == 0 else "ACTIVE"
                },
                "compute": {
                    "cpu_load": "0.12, 0.08, 0.05",
                    "ram": {"used_mb": 2780, "avail_mb": 4980, "total_mb": 7760, "pct": 35.8},
                    "disk": {"used_gb": 33.7, "free_gb": 63.5, "total_gb": 97.2, "pct": 34.7},
                    "inodes": {"used": 784000, "free": 12116000, "total": 12900000, "pct": 6.1}
                },
                "services": [
                    {"id": "front", "name": "Nginx Ingress", "container": "front", "proto": "TLS 1.3 Ingress (25/465/587/993)", "status": "HEALTHY", "detail": "Active listeners"},
                    {"id": "smtp", "name": "Postfix MTA", "container": "smtp", "proto": "SMTP 25/587", "status": "HEALTHY", "detail": "Spool clear"},
                    {"id": "imap", "name": "Dovecot IMAP", "container": "imap", "proto": "IMAPS 993/143", "status": "HEALTHY", "detail": "Auth online"},
                    {"id": "antispam", "name": "Rspamd Milter", "container": "antispam", "proto": "Milter/DKIM (11332)", "status": "HEALTHY", "detail": "DKIM signing active"},
                    {"id": "resolver", "name": "Unbound DNS", "container": "resolver", "proto": "Recursive DNS (53/udp)", "status": "HEALTHY", "detail": "DNSSEC validated"},
                    {"id": "admin", "name": "Control Core", "container": "admin", "proto": "REST / SQLite", "status": "HEALTHY", "detail": "Zero-trust audit active"},
                    {"id": "webmail", "name": "Roundcube Webmail", "container": "webmail", "proto": "Roundcube 1.6.6 (HTTPS)", "status": "HEALTHY", "detail": "SSO configured"},
                    {"id": "redis", "name": "Redis Spool", "container": "redis", "proto": "In-Memory Spool (6379)", "status": "HEALTHY", "detail": "Cache optimal"}
                ],
                "certificate": {
                    "status": "VALID",
                    "days_remaining": 89
                },
                "recent_events": [
                    {
                        "id": 1,
                        "timestamp": "2026-08-21T18:40:00Z",
                        "actor": STATE.get("active_user", "admin@altrixcore.com"),
                        "action": "ADMIN_LOGIN",
                        "resource": "Control Center",
                        "status": "SUCCESS"
                    },
                    {
                        "id": 2,
                        "timestamp": "2026-08-21T18:35:00Z",
                        "actor": "system",
                        "action": "DKIM_KEYGEN",
                        "resource": "domain:foundation.local",
                        "status": "SUCCESS"
                    },
                    {
                        "id": 3,
                        "timestamp": "2026-08-21T18:30:00Z",
                        "actor": "system",
                        "action": "SERVICE_START",
                        "resource": "Postfix MTA",
                        "status": "SUCCESS"
                    }
                ],
                "timestamp": "2026-08-22T00:00:00Z"
            })

        # 3. Domains
        if path == '/domains':
            return self._send_json(STATE["domains"])
        
        m_dom_dns = re.match(r'^/domains/([^/]+)/dns-intelligence$', path)
        if m_dom_dns:
            dom_name = m_dom_dns.group(1)
            return self._send_json({
                "domain": dom_name,
                "expected_records": {
                    "mx": {"type": "MX", "name": "@", "value": "10 mail.foundation.local.", "provider": "DNS Registrar"},
                    "spf": {"type": "TXT", "name": "@", "value": "v=spf1 mx ~all", "provider": "DNS Registrar"},
                    "dkim": {"type": "TXT", "name": "mailu._domainkey", "value": "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...", "provider": "DNS Registrar"},
                    "dmarc": {"type": "TXT", "name": "_dmarc", "value": f"v=DMARC1; p=none; rua=mailto:dmarc@{dom_name}", "provider": "DNS Registrar"},
                    "autoconfig": {"type": "CNAME", "name": "autoconfig", "value": "mail.foundation.local.", "provider": "DNS Registrar"},
                    "autodiscover": {"type": "CNAME", "name": "autodiscover", "value": "mail.foundation.local.", "provider": "DNS Registrar"},
                    "ptr": {"type": "PTR", "name": "169.58.111.159", "value": "mail.foundation.local.", "provider": "Contabo VPS Cloud Panel"}
                },
                "validation": {
                    "mx": {"status": "VALIDATED", "message": "MX points to mail server"},
                    "spf": {"status": "VALIDATED", "message": "SPF record valid"},
                    "dkim": {"status": "VALIDATED", "message": "2048-bit DKIM key published"},
                    "dmarc": {"status": "VALIDATED", "message": "DMARC policy verified"},
                    "autoconfig": {"status": "VALIDATED", "message": "Autoconfig active"},
                    "autodiscover": {"status": "VALIDATED", "message": "Autodiscover active"},
                    "ptr": {"status": "VALIDATED", "message": "Reverse DNS matches hostname"}
                }
            }, wrap=False)

        m_dom = re.match(r'^/domains/([^/]+)$', path)
        if m_dom:
            dom_name = m_dom.group(1)
            dom = next((d for d in STATE["domains"] if d["name"] == dom_name), None)
            if dom:
                mailboxes = [m for m in STATE["mailboxes"] if m["domain"] == dom_name]
                aliases = [a for a in STATE["aliases"] if a["domain"] == dom_name]
                return self._send_json({
                    "domain": {
                        "name": dom_name,
                        "comment": dom.get("comment", ""),
                        "mailboxes_count": len(mailboxes),
                        "aliases_count": len(aliases),
                        "has_dkim": True,
                        "dkim_selector": "mailu"
                    },
                    "mailboxes": mailboxes,
                    "aliases": aliases,
                    "dkim": {
                        "selector": "mailu",
                        "key_length": 2048,
                        "algorithm": "RSA-SHA256",
                        "public_key": "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy2D0R6Qe0fF...",
                        "dns_record": f"mailu._domainkey.{dom_name} IN TXT \"v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy2D0R6Qe0fF...\""
                    },
                    "readiness": {
                        "status": "PRODUCTION_READY",
                        "blocking_issues": [],
                        "warnings": [
                            "Update Contabo VPS Reverse DNS (PTR) for 169.58.111.159 to match public hostname before sending high-volume outbound mail."
                        ],
                        "info": [
                            "2048-bit RSA DKIM key generated and registered in Rspamd milter.",
                            "Postfix virtual routing table mapped for multi-domain spooling.",
                            "Dovecot IMAP / POP3 virtual storage paths allocated."
                        ]
                    }
                })
            return self._send_json({"error": {"message": "Domain not found", "code": "NOT_FOUND"}}, 404)

        # 4. Mailboxes
        if path == '/mailboxes':
            return self._send_json(STATE["mailboxes"])

        m_mb_get = re.match(r'^/mailboxes/([^/]+)$', path)
        if m_mb_get:
            mb_email = unquote(m_mb_get.group(1)).lower()
            mb = next((m for m in STATE["mailboxes"] if m["email"].lower() == mb_email), None)
            if mb:
                dom_name = mb["domain"]
                aliases = [a for a in STATE["aliases"] if a["destination"].lower() == mb_email or a["email"].lower() == mb_email]
                quota_val = mb.get("quota_mb") or int((mb.get("quota_bytes", 5368709120)) / (1024 * 1024))
                used_val = mb.get("used_mb") or 0
                return self._send_json({
                    "mailbox": {
                        "email": mb["email"],
                        "user": mb.get("local_part") or mb.get("user") or mb["email"].split('@')[0],
                        "domain": dom_name,
                        "quota_mb": quota_val,
                        "used_mb": used_val,
                        "enabled": mb.get("enabled", True),
                        "created_at": mb.get("created_at", "2026-08-21T18:00:00Z")
                    },
                    "domain": dom_name,
                    "aliases": aliases,
                    "storage": {
                        "used_mb": used_val,
                        "quota_mb": quota_val,
                        "available_mb": max(0, quota_val - used_val),
                        "pct_used": round((used_val / max(1, quota_val)) * 100, 1)
                    },
                    "protocols": {
                        "imap": {"host": f"mail.{dom_name}", "port": 993, "security": "SSL/TLS", "proto": "IMAPS"},
                        "smtp": {"host": f"mail.{dom_name}", "port": 587, "security": "STARTTLS", "proto": "SMTP Submission"},
                        "webmail": {"url": "/webmail/", "sso": True}
                    }
                })
            return self._send_json({"error": {"message": "Mailbox not found", "code": "NOT_FOUND"}}, 404)

        # 5. Aliases
        if path == '/aliases':
            formatted_aliases = []
            for a in STATE["aliases"]:
                src = a.get("source") or a.get("email", "")
                formatted_aliases.append({
                    "id": a.get("id", "alias-" + uuid.uuid4().hex[:8]),
                    "email": src,
                    "source": src,
                    "domain": a.get("domain") or (src.split('@')[-1] if '@' in src else ""),
                    "destination": a.get("destination", ""),
                    "wildcard": a.get("wildcard", False),
                    "created_at": a.get("created_at", "2026-08-20T10:15:00Z")
                })
            return self._send_json(formatted_aliases)

        # 6. Applications
        if path == '/applications':
            formatted_apps = []
            for a in STATE["applications"]:
                sender = a.get("user_email") or a.get("sender_address") or "notifications@foundation.local"
                dom_name = a.get("domain") or (sender.split('@')[-1] if '@' in sender else "foundation.local")
                formatted_apps.append({
                    "id": a.get("id"),
                    "name": a.get("name"),
                    "user_email": sender,
                    "sender_address": sender,
                    "domain": dom_name,
                    "ip_restriction": a.get("ip_restriction", "Unrestricted (0.0.0.0/0)"),
                    "rate_limit_per_hour": a.get("rate_limit_per_hour", 1000),
                    "created_at": a.get("created_at", "2026-08-20T11:00:00Z"),
                    "last_used_at": a.get("last_used_at"),
                    "revoked": a.get("revoked", False)
                })
            return self._send_json(formatted_apps)

        # 7. Audit logs
        if path.startswith('/audit-logs'):
            return self._send_json(STATE["audit_logs"])

        # 8. Monitoring / System
        if path in ['/monitoring', '/monitoring/system']:
            return self._send_json({
                "compute": {
                    "ram": {"used_mb": 2780, "avail_mb": 4980, "total_mb": 7760, "pct": 35.8},
                    "disk": {"used_gb": 33.7, "free_gb": 63.5, "total_gb": 97.2, "pct": 34.7},
                    "inodes": {"used": 784000, "free": 12116000, "total": 12900000, "pct": 6.1}
                },
                "microservices": [
                    {"service": "mailu_front", "container": "front", "proto": "25, 465, 587, 993, 4190", "status": "ONLINE"},
                    {"service": "mailu_smtp", "container": "smtp", "proto": "Postfix MTA (25/587)", "status": "ONLINE"},
                    {"service": "mailu_imap", "container": "imap", "proto": "Dovecot (143/993/24)", "status": "ONLINE"},
                    {"service": "mailu_antispam", "container": "antispam", "proto": "Rspamd (11332/11334)", "status": "ONLINE"},
                    {"service": "mailu_resolver", "container": "resolver", "proto": "Unbound (53/udp)", "status": "ONLINE"},
                    {"service": "mailu_admin", "container": "admin", "proto": "Admin API / SQLite", "status": "ONLINE"},
                    {"service": "mailu_webmail", "container": "webmail", "proto": "Roundcube 1.6.6", "status": "ONLINE"},
                    {"service": "mail_redis", "container": "redis", "proto": "Redis 7.2 (6379)", "status": "ONLINE"}
                ]
            })

        # 9. Security
        if path in ['/security', '/security/overview']:
            return self._send_json({
                "status": "HEALTHY",
                "failed_logins_24h": 4,
                "jailed_ips_count": 0,
                "rate_limited_events_24h": 0,
                "open_relay_state": "SECURE",
                "tls_posture": "TLS 1.3 / 1.2 ECDHE MANDATORY",
                "firewall_policy": "UFW ACTIVE (DEFAULT DENY INCOMING)",
                "anti_spam_active": True,
                "fail2ban_jails": ["mailu-auth", "sshd", "recidive"]
            })

        if path == '/security/summary':
            return self._send_json({
                "status": "HEALTHY",
                "failed_logins_24h": 4,
                "jailed_ips_count": 0,
                "rate_limited_events_24h": 0,
                "open_relay_state": "SECURE",
                "tls_posture": "TLS 1.3 / 1.2 ECDHE MANDATORY",
                "firewall_policy": "UFW ACTIVE (DEFAULT DENY INCOMING)",
                "anti_spam_active": True,
                "fail2ban_jails": ["mailu-auth", "sshd", "recidive"]
            })

        if path.startswith('/security/events'):
            return self._send_json({
                "total": 3,
                "events": [
                    {"id": "sec-1", "timestamp": "2026-08-21T21:12:00Z", "type": "AUTH_SUCCESS", "source_ip": "169.58.***.***", "details": "SASL authenticated: admin@foundation.local"},
                    {"id": "sec-2", "timestamp": "2026-08-21T20:05:00Z", "type": "AUTH_NEGATIVE", "source_ip": "194.26.***.***", "details": "Invalid password rejected (Dovecot SASL)"},
                    {"id": "sec-3", "timestamp": "2026-08-21T18:40:00Z", "type": "OPEN_RELAY_BLOCKED", "source_ip": "45.143.***.***", "details": "554 5.7.1 Relay access denied"}
                ]
            })

        # 10. Deliverability
        m_deliv = re.match(r'^/deliverability/([^/]+)$', path)
        if m_deliv:
            dom_name = m_deliv.group(1)
            return self._send_json({
                "domain": dom_name,
                "overall_score": 98,
                "readiness_status": "READY_FOR_WARMING",
                "checks": [
                    {"name": "MX Routing", "status": "PASS", "details": "Points to mail.foundation.local"},
                    {"name": "SPF Authentication", "status": "PASS", "details": "v=spf1 mx ~all"},
                    {"name": "DKIM 2048-bit", "status": "PASS", "details": "Valid RSA cryptographic signature"},
                    {"name": "DMARC Policy", "status": "PASS", "details": "p=none with aggregate RUA"},
                    {"name": "Reverse DNS (PTR)", "status": "PASS", "details": "169.58.111.159 -> mail.foundation.local"},
                    {"name": "Open Relay Guard", "status": "PASS", "details": "Relaying unauthenticated traffic disabled"},
                    {"name": "Spool Health", "status": "PASS", "details": "Zero queued or deferred messages"}
                ],
                "rbl_status": [
                    {"provider": "zen.spamhaus.org", "listed": False, "status": "CLEAN"},
                    {"provider": "b.barracudacentral.org", "listed": False, "status": "CLEAN"},
                    {"provider": "bl.spamcop.net", "listed": False, "status": "CLEAN"}
                ]
            })

        # 11. Queue
        if path == '/queue/status':
            return self._send_json({
                "active": 0,
                "deferred": 0,
                "held": 0,
                "incoming": 0,
                "total": 0,
                "messages": STATE["queue_messages"]
            })

        if path.startswith('/queue/logs'):
            return self._send_json({
                "total": 2,
                "logs": [
                    {"id": "log-1", "timestamp": "2026-08-21T22:30:00Z", "sender": "admin@foundation.local", "recipient": "test@external.com", "status": "DELIVERED", "relay": "mx.external.com", "response": "250 2.0.0 OK"},
                    {"id": "log-2", "timestamp": "2026-08-21T21:15:00Z", "sender": "notifications@foundation.local", "recipient": "user@gmail.com", "status": "DELIVERED", "relay": "gmail-smtp-in.l.google.com", "response": "250 2.0.0 OK"}
                ]
            })

        if path == '/queue/alerts':
            return self._send_json({"alerts": []})

        # 12. Webmail & Client Config
        if path == '/webmail/status':
            return self._send_json({
                "engine": "Roundcube 1.6.6",
                "status": "ONLINE",
                "ingress_url": "/webmail/",
                "internal_endpoint": "http://127.0.0.1:8080",
                "active_sessions": 1
            })

        if path.startswith('/client-config/profile'):
            return self._send_json({
                "incoming": {
                    "server": "mail.foundation.local",
                    "port": 993,
                    "proto": "IMAPS",
                    "socket_type": "SSL/TLS"
                },
                "outgoing": {
                    "server": "mail.foundation.local",
                    "port": 465,
                    "proto": "SMTPS",
                    "socket_type": "SSL/TLS"
                },
                "submission_alt": {
                    "server": "mail.foundation.local",
                    "port": 587,
                    "proto": "STARTTLS"
                }
            })

        # 13. Public Endpoint
        if path in ['/system/public-endpoint', '/public-endpoint']:
            return self._send_json({
                "configured": False,
                "current_hostname": None,
                "runtime_state": "PUBLIC_HOSTNAME_NOT_CONFIGURED",
                "vps_public_ipv4": "169.58.111.159",
                "listeners": [
                    {"port": 25, "proto": "TCP", "process": "mailu_front (Docker)", "status": "ACTIVE_REQUIRED"},
                    {"port": 465, "proto": "TCP", "process": "mailu_front (Docker)", "status": "ACTIVE_REQUIRED"},
                    {"port": 587, "proto": "TCP", "process": "mailu_front (Docker)", "status": "ACTIVE_REQUIRED"},
                    {"port": 993, "proto": "TCP", "process": "mailu_front (Docker)", "status": "ACTIVE_REQUIRED"},
                    {"port": 4190, "proto": "TCP", "process": "mailu_front (Docker)", "status": "ACTIVE_REQUIRED"},
                    {"port": 80, "proto": "TCP", "process": "Host Nginx 1.24", "status": "SHARED_SAFE"},
                    {"port": 443, "proto": "TCP", "process": "Host Nginx 1.24", "status": "SHARED_SAFE_SNI"}
                ]
            })

        # SPA Fallback for client-side routes (/login, /domains, /settings, etc.)
        if self._serve_static_or_spa(parsed.path):
            return

        return self._send_json({"error": {"message": f"Route not found: {path}", "code": "NOT_FOUND"}}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = self.normalize_path(parsed.path)
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length > 0 else b'{}'
        try:
            payload = json.loads(body.decode('utf-8'))
        except:
            payload = {}

        # 1. Login
        if path == '/auth/login':
            username = (payload.get("username") or payload.get("email") or "admin@altrixcore.com").strip()
            user_email = username if '@' in username else f"{username}@altrixcore.com"
            STATE["active_user"] = user_email
            return self._send_json({
                "token": "token_session_" + uuid.uuid4().hex,
                "user": {
                    "email": user_email,
                    "role": "SUPER_ADMIN",
                    "domains": [d["name"] for d in STATE["domains"]]
                }
            })

        # 2. Logout
        if path == '/auth/logout':
            return self._send_json({"status": "success", "message": "Logged out successfully"})

        # 3. Create Domain
        if path == '/domains':
            name = payload.get("name", "").strip().lower()
            if not name:
                return self._send_json({"error": {"message": "Domain name is required", "code": "VALIDATION_ERROR"}}, 400)
            if any(d["name"] == name for d in STATE["domains"]):
                return self._send_json({"error": {"message": "Domain already exists", "code": "CONFLICT"}}, 409)
            
            new_dom = {
                "name": name,
                "max_users": payload.get("max_users", 50),
                "max_quota_bytes": payload.get("max_quota_bytes", 53687091200),
                "used_quota_bytes": 0,
                "user_count": 0,
                "alias_count": 0,
                "has_dkim": True,
                "dns_status": "PENDING_PROPAGATION",
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            STATE["domains"].append(new_dom)
            return self._send_json(new_dom, 201)

        # 4. Create Mailbox
        if path == '/mailboxes':
            user = payload.get("user") or payload.get("local_part", "")
            domain = payload.get("domain", "")
            email = payload.get("email") or f"{user}@{domain}".lower()
            
            if not email or '@' not in email:
                return self._send_json({"error": {"message": "Valid email address is required", "code": "VALIDATION_ERROR"}}, 400)
            if any(m["email"] == email for m in STATE["mailboxes"]):
                return self._send_json({"error": {"message": "Mailbox already exists", "code": "CONFLICT"}}, 409)

            parts = email.split('@')
            new_mb = {
                "email": email,
                "domain": parts[1],
                "local_part": parts[0],
                "quota_bytes": payload.get("quota_bytes", 5368709120),
                "used_bytes": 0,
                "quota_percent": 0.0,
                "enabled": True,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            STATE["mailboxes"].append(new_mb)
            return self._send_json(new_mb, 201)

        # 5. Create Alias
        if path == '/aliases':
            alias_user = payload.get("alias") or payload.get("local_part", "")
            domain = payload.get("domain", "")
            source = payload.get("source") or (f"{alias_user}@{domain}".lower() if alias_user and domain else "")
            destination = payload.get("destination", "").strip().lower()
            
            if not source or not destination:
                return self._send_json({"error": {"message": "Source alias and destination email are required", "code": "VALIDATION_ERROR"}}, 400)

            if source.lower() == destination.lower():
                return self._send_json({"error": {"message": "Circular routing detected: Alias cannot route to itself", "code": "VALIDATION_ERROR"}}, 400)

            if any((a.get("source") or a.get("email", "")).lower() == source.lower() for a in STATE["aliases"]):
                return self._send_json({"error": {"message": f"Alias '{source}' is already configured", "code": "CONFLICT"}}, 409)

            new_al = {
                "id": "alias-" + uuid.uuid4().hex[:8],
                "source": source,
                "email": source,
                "destination": destination,
                "domain": source.split('@')[-1],
                "wildcard": payload.get("wildcard", False),
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            STATE["aliases"].append(new_al)
            return self._send_json(new_al, 201)

        # 6. Create Application Token
        if path == '/applications':
            name = payload.get("name", "").strip()
            sender = payload.get("user_email") or payload.get("sender_address", "notifications@foundation.local")
            ip_restr = payload.get("ip_restriction", "Unrestricted (0.0.0.0/0)").strip()
            if not ip_restr:
                ip_restr = "Unrestricted (0.0.0.0/0)"
            if not name:
                return self._send_json({"error": {"message": "Application name required", "code": "VALIDATION_ERROR"}}, 400)

            token_secret = "app_sec_" + uuid.uuid4().hex
            app_id = "app-" + uuid.uuid4().hex[:8]
            dom_name = sender.split('@')[-1] if '@' in sender else "foundation.local"
            new_app = {
                "id": app_id,
                "name": name,
                "user_email": sender,
                "sender_address": sender,
                "domain": dom_name,
                "ip_restriction": ip_restr,
                "allowed_senders": [sender],
                "rate_limit_per_hour": payload.get("rate_limit_per_hour", 1000),
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "last_used_at": None,
                "revoked": False
            }
            STATE["applications"].append(new_app)
            return self._send_json({
                "status": "success",
                "message": f"Application credential '{name}' provisioned",
                "credential": {
                    "id": app_id,
                    "name": name,
                    "token": token_secret,
                    "auth_user": sender,
                    "smtp_host": f"mail.{dom_name}",
                    "smtp_port_ssl": 465,
                    "smtp_port_starttls": 587,
                    "tls_mode": "TLS / STARTTLS",
                    "ip_restriction": ip_restr
                },
                "data": {
                    "id": app_id,
                    "name": name,
                    "token": token_secret,
                    "auth_user": sender,
                    "smtp_host": f"mail.{dom_name}",
                    "smtp_port_ssl": 465,
                    "smtp_port_starttls": 587,
                    "tls_mode": "TLS / STARTTLS",
                    "ip_restriction": ip_restr
                }
            }, 201)

        # Rotate Application Credential
        m_app_rot = re.match(r'^/applications/([^/]+)/rotate$', path)
        if m_app_rot:
            app_id = m_app_rot.group(1)
            app = next((a for a in STATE["applications"] if str(a.get("id")) == str(app_id)), None)
            if app:
                new_token = "app_sec_" + uuid.uuid4().hex
                dom_name = app.get("domain") or (app["user_email"].split('@')[-1] if '@' in app.get("user_email", "") else "foundation.local")
                return self._send_json({
                    "status": "success",
                    "message": f"Application credential '{app['name']}' rotated successfully",
                    "credential": {
                        "id": app["id"],
                        "name": app["name"],
                        "token": new_token,
                        "auth_user": app.get("user_email") or app.get("sender_address"),
                        "smtp_host": f"mail.{dom_name}",
                        "smtp_port_ssl": 465,
                        "smtp_port_starttls": 587,
                        "tls_mode": "TLS / STARTTLS",
                        "ip_restriction": app.get("ip_restriction", "Unrestricted (0.0.0.0/0)")
                    },
                    "data": {
                        "id": app["id"],
                        "name": app["name"],
                        "token": new_token,
                        "auth_user": app.get("user_email") or app.get("sender_address"),
                        "smtp_host": f"mail.{dom_name}",
                        "smtp_port_ssl": 465,
                        "smtp_port_starttls": 587,
                        "tls_mode": "TLS / STARTTLS",
                        "ip_restriction": app.get("ip_restriction", "Unrestricted (0.0.0.0/0)")
                    }
                })
            return self._send_json({"error": {"message": "Application not found", "code": "NOT_FOUND"}}, 404)

        # 7. Queue Flush
        if path in ['/queue/flush', '/queue/delete']:
            STATE["queue_messages"] = []
            return self._send_json({"status": "success", "message": "Queue action executed successfully"})

        # 8. Reset Mailbox Password
        m_reset = re.match(r'^/mailboxes/([^/]+)/(?:reset-password|password)$', path)
        if m_reset:
            return self._send_json({"status": "success", "message": "Password updated successfully"})

        # 9. Deliverability Send Test
        m_test = re.match(r'^/deliverability/([^/]+)/send-test$', path)
        if m_test:
            recipient = payload.get("recipient", "")
            return self._send_json({
                "submission_id": "test-" + uuid.uuid4().hex[:12],
                "status": "SUBMISSION_SUCCESS",
                "remote_response": "250 2.0.0 OK Message queued for delivery",
                "recipient": recipient,
                "spf_evaluated": "PASS",
                "dkim_signed": "PASS",
                "dmarc_aligned": "PASS",
                "disclaimer": "SMTP acceptance by the remote MTA does not guarantee primary inbox placement."
            })

        return self._send_json({"error": {"message": f"Route not found: {path}", "code": "NOT_FOUND"}}, 404)

    def do_PATCH(self):
        parsed = urlparse(self.path)
        path = self.normalize_path(parsed.path)
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length > 0 else b'{}'
        try:
            payload = json.loads(body.decode('utf-8'))
        except:
            payload = {}

        m_status = re.match(r'^/mailboxes/([^/]+)/status$', path)
        if m_status:
            email = m_status.group(1)
            mb = next((m for m in STATE["mailboxes"] if m["email"] == email), None)
            if mb:
                mb["enabled"] = payload.get("enabled", mb["enabled"])
                return self._send_json(mb)
            return self._send_json({"error": {"message": "Mailbox not found", "code": "NOT_FOUND"}}, 404)

        m_quota = re.match(r'^/mailboxes/([^/]+)/quota$', path)
        if m_quota:
            email = m_quota.group(1)
            mb = next((m for m in STATE["mailboxes"] if m["email"] == email), None)
            if mb:
                mb["quota_bytes"] = payload.get("quota_bytes", mb["quota_bytes"])
                return self._send_json(mb)
            return self._send_json({"error": {"message": "Mailbox not found", "code": "NOT_FOUND"}}, 404)

        return self._send_json({"error": {"message": f"Route not found: {path}", "code": "NOT_FOUND"}}, 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = self.normalize_path(parsed.path)

        # Delete Domain
        m_dom = re.match(r'^/domains/([^/]+)$', path)
        if m_dom:
            dom_name = m_dom.group(1)
            STATE["domains"] = [d for d in STATE["domains"] if d["name"] != dom_name]
            STATE["mailboxes"] = [m for m in STATE["mailboxes"] if m["domain"] != dom_name]
            STATE["aliases"] = [a for a in STATE["aliases"] if a["domain"] != dom_name]
            return self._send_json({"status": "success", "message": "Domain removed successfully"})

        # Delete Mailbox
        m_mb = re.match(r'^/mailboxes/([^/]+)$', path)
        if m_mb:
            email = m_mb.group(1)
            STATE["mailboxes"] = [m for m in STATE["mailboxes"] if m["email"] != email]
            return self._send_json({"status": "success", "message": "Mailbox removed successfully"})

        # Delete Alias
        m_al = re.match(r'^/aliases/([^/]+)$', path)
        if m_al:
            alias_id = unquote(m_al.group(1)).lower()
            STATE["aliases"] = [
                a for a in STATE["aliases"]
                if a.get("id", "").lower() != alias_id
                and a.get("source", "").lower() != alias_id
                and a.get("email", "").lower() != alias_id
            ]
            return self._send_json({"status": "success", "message": "Alias removed successfully"})

        # Revoke Application Token
        m_app = re.match(r'^/applications/([^/]+)$', path)
        if m_app:
            app_id = m_app.group(1)
            app = next((a for a in STATE["applications"] if a["id"] == app_id), None)
            if app:
                app["revoked"] = True
            return self._send_json({"status": "success", "message": "Application revoked successfully"})

        return self._send_json({"error": {"message": f"Route not found: {path}", "code": "NOT_FOUND"}}, 404)

def run():
    try:
        from app import create_app
        app = create_app()
        port = int(os.environ.get("PORT", 5000))
        host = os.environ.get("HOST", "0.0.0.0")
        print(f"AltriX Mail Control Center Production Backend listening on http://{host}:{port}")
        app.run(host=host, port=port, debug=False)
    except Exception as e:
        print(f"Fallback to standalone HTTP server due to: {e}")
        server_address = ('127.0.0.1', 5000)
        httpd = HTTPServer(server_address, MailuControlCenterHandler)
        print("Mailu Control Center REST API Backend listening on http://127.0.0.1:5000")
        httpd.serve_forever()

if __name__ == '__main__':
    run()
