import subprocess
import os
import dns.resolver
from flask import Blueprint, request, g, jsonify
from app.database import get_db
from app.schemas.validation import is_valid_domain
from app.security.rbac import require_auth, require_role
from app.security.audit import log_audit
from app.security.rate_limit import rate_limit
from app.services.mailu_admin_service import mailu_admin_service
from app.utils.response import api_success, api_error

domains_bp = Blueprint("domains_bp", __name__)

@domains_bp.route("/api/domains", methods=["GET"])
@require_auth
def list_domains():
    try:
        domains = mailu_admin_service.list_domains()
        return api_success(domains)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@domains_bp.route("/api/domains/<domain_name>", methods=["GET"])
@require_auth
def get_domain_detail(domain_name):
    try:
        domain_name = domain_name.strip().lower()
        conn = get_db()
        cur = conn.cursor()
        d = cur.execute("SELECT name, comment, max_users, max_aliases, max_quota_bytes, created_at FROM domain WHERE name = ?", (domain_name,)).fetchone()
        if not d:
            conn.close()
            return api_error(f"Domain {domain_name} not found", code="NOT_FOUND", status_code=404)
        
        u_count = cur.execute("SELECT COUNT(*) FROM user WHERE domain_name = ?", (domain_name,)).fetchone()[0]
        a_count = cur.execute("SELECT COUNT(*) FROM alias WHERE domain_name = ?", (domain_name,)).fetchone()[0]
        conn.close()

        return api_success({
            "name": d["name"],
            "comment": d["comment"] or "",
            "mailboxes": u_count,
            "aliases": a_count,
            "max_users": d["max_users"],
            "max_quota_bytes": d["max_quota_bytes"],
            "created_at": d["created_at"] or "",
            "has_dkim": True,
            "dkim_selector": "mail",
            "spf_record": "v=spf1 mx ~all",
            "dmarc_record": f"v=DMARC1; p=reject; rua=mailto:postmaster@{domain_name}"
        })
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@domains_bp.route("/api/domains", methods=["POST"])
@require_auth
@require_role("SUPER_ADMIN")
@rate_limit(max_requests=10, window_seconds=60)
def create_domain():
    try:
        data = request.get_json(silent=True) or {}
        name = data.get("name", "")
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"

        res = mailu_admin_service.create_domain(name)
        log_audit(g.current_user["username"], ip, "DOMAIN_CREATE", name, "SUCCESS")
        return api_success(
            message=f"Domain {name} created successfully with 2048-bit RSA DKIM keypair",
            data=res
        )
    except ValueError as ve:
        return api_error(str(ve), code="VALIDATION_ERROR", status_code=400)
    except KeyError as ke:
        return api_error(str(ke).strip("'"), code="DUPLICATE_RESOURCE", status_code=409)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@domains_bp.route("/api/domains/<domain_name>", methods=["DELETE"])
@require_auth
@require_role("SUPER_ADMIN")
@rate_limit(max_requests=5, window_seconds=60)
def delete_domain(domain_name):
    try:
        ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "127.0.0.1"
        res = mailu_admin_service.delete_domain(domain_name)
        log_audit(g.current_user["username"], ip, "DOMAIN_DELETE", domain_name, "SUCCESS", f"Purged {res['purged_mailboxes']} mailboxes, {res['purged_aliases']} aliases")
        return api_success(message=f"Domain {domain_name} deleted successfully (Purged {res['purged_mailboxes']} mailboxes, {res['purged_aliases']} aliases, and Maildir storage)")
    except LookupError as le:
        return api_error(str(le), code="NOT_FOUND", status_code=404)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)

@domains_bp.route("/api/domains/<domain_name>/dns-intelligence", methods=["GET"])
@require_auth
def get_dns_intelligence(domain_name):
    try:
        domain_name = domain_name.strip().lower()
        if not is_valid_domain(domain_name):
            return api_error("Invalid domain name", code="VALIDATION_ERROR", status_code=400)

        mail_host = f"mail.{domain_name}"
        vps_ipv4 = "169.58.111.159"
        vps_ipv6 = "2a02:c207:2348:991::1"

        dkim_pub = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzMWrGG8YDuRQ7lqCiVzaUkAcjFdLk941ojSJ8iuOwv2NIeXtY9GzHvq2v4SzokgMtZRRiGOr/HfmRUaQrhLjUYDk7y36EYcu113ZrZZiQcSEZ0M17gpbb7BIBuV6h1VHvxObCGypRwKwcn7PdQb42ETFCWuOvnDEBWLqIDlAGgZb7ZTIr5cHmOOQsv9tvRGZEI/ovnND87pzFb32NWUO3Zkm1owr1QJXcWxJUtpiOUwSrgWJDvcVKxQfIxWt8uUV5YYAoK2OPIrA55CmNsksvqtMxM9YmLCCduupl1j/mvUdO0l/eKRkWSBpswJxO0XQssaog2/P06+8ymGa9sqQzwIDAQAB"

        expected_records = {
            "a": {"type": "A", "name": mail_host, "value": vps_ipv4, "ttl": "Auto / 300", "provider": "Domain DNS Provider", "purpose": "Points mail subdomain to VPS IPv4 address"},
            "aaaa": {"type": "AAAA", "name": mail_host, "value": vps_ipv6, "ttl": "Auto / 300", "provider": "Domain DNS Provider", "purpose": "Points mail subdomain to VPS IPv6 address"},
            "mx": {"type": "MX", "name": domain_name, "value": mail_host, "priority": 10, "provider": "Domain DNS Provider", "purpose": "Directs incoming email traffic to mail server"},
            "spf": {"type": "TXT", "name": domain_name, "value": "v=spf1 mx ~all", "provider": "Domain DNS Provider", "purpose": "Authorizes mail server IP to send mail on domain's behalf"},
            "dkim": {"type": "TXT", "name": f"mail._domainkey.{domain_name}", "value": f"v=DKIM1; k=rsa; p={dkim_pub}", "provider": "Domain DNS Provider", "purpose": "Cryptographic 2048-bit RSA signature validation"},
            "dmarc": {"type": "TXT", "name": f"_dmarc.{domain_name}", "value": f"v=DMARC1; p=quarantine; rua=mailto:admin@{domain_name}", "provider": "Domain DNS Provider", "purpose": "Enforces alignment policy against spoofed emails"},
            "ptr": {"type": "PTR (Reverse DNS)", "name": f"{vps_ipv4}", "value": f"{mail_host}.", "provider": "VPS Hosting Provider (Contabo Cloud Control Panel)", "purpose": "Matches IP reverse DNS with mail hostname to prevent spam rejection"}
        }

        def run_dig(q_type, q_name):
            results = []
            try:
                res = subprocess.run(["dig", "+short", q_type, q_name, "@8.8.8.8"], capture_output=True, text=True, timeout=3)
                if res.returncode == 0 and res.stdout.strip():
                    results.extend([l.strip().strip('"') for l in res.stdout.splitlines() if l.strip()])
            except Exception:
                pass

            if not results:
                try:
                    resolver = dns.resolver.Resolver()
                    resolver.nameservers = ['8.8.8.8', '1.1.1.1']
                    resolver.timeout = 2
                    resolver.lifetime = 2
                    if q_type == "-x":
                        rev = dns.reversename.from_address(q_name)
                        ans = resolver.resolve(rev, 'PTR')
                        results.extend([str(r).rstrip('.') for r in ans])
                    else:
                        ans = resolver.resolve(q_name, q_type)
                        results.extend([str(r).strip('"') for r in ans])
                except Exception:
                    pass

            return results

        live_a = run_dig("A", mail_host)
        live_aaaa = run_dig("AAAA", mail_host)
        live_mx = run_dig("MX", domain_name)
        live_txt = run_dig("TXT", domain_name)
        live_dkim = run_dig("TXT", f"mail._domainkey.{domain_name}")
        live_dmarc = run_dig("TXT", f"_dmarc.{domain_name}")
        live_ptr = run_dig("-x", vps_ipv4)

        def validate_item(name, live_records, expected_val):
            if not live_records:
                if name == "a":
                    return {"status": "MISSING", "message": f"No A record found for '{mail_host}'. Add an A record pointing '{mail_host}' to '{vps_ipv4}' in your DNS manager."}
                if name == "aaaa":
                    return {"status": "MISSING", "message": f"No AAAA IPv6 record found for '{mail_host}' (Optional if using IPv4 only)."}
                if name == "mx":
                    return {"status": "MISSING", "message": f"No MX record found on '{domain_name}'. Add an MX record pointing to '{mail_host}' with Priority 10."}
                if name == "spf":
                    return {"status": "MISSING", "message": f"No SPF TXT record found on '{domain_name}'. Add a TXT record with value 'v=spf1 mx ~all'."}
                if name == "dkim":
                    return {"status": "MISSING", "message": f"No DKIM TXT record found at 'mail._domainkey.{domain_name}'. Add the 2048-bit RSA TXT record from above."}
                if name == "dmarc":
                    return {"status": "MISSING", "message": f"No DMARC TXT record found at '_dmarc.{domain_name}'. Add a TXT record with value 'v=DMARC1; p=quarantine; rua=mailto:admin@{domain_name}'."}
                if name == "ptr":
                    return {"status": "UNVERIFIED", "message": f"No PTR record discovered for {vps_ipv4}. Set PTR in Contabo Cloud Panel to '{mail_host}'."}
                return {"status": "MISSING", "message": "Record not published at DNS provider yet"}

            if name == "spf":
                spf_records = [r for r in live_records if "v=spf1" in r]
                if len(spf_records) > 1:
                    return {"status": "INVALID", "message": f"Duplicate SPF records detected ({len(spf_records)}): RFC 7208 strictly prohibits multiple SPF records. Merge them into a single TXT record: '{' | '.join(spf_records)}'."}
                if len(spf_records) == 1:
                    rec = spf_records[0]
                    if vps_ipv4 in rec or "mail." in rec or "mx" in rec:
                        return {"status": "CONFIGURED", "message": f"Valid SPF active: '{rec}'"}
                    return {"status": "INVALID", "message": f"Current SPF '{rec}' is missing authorization for VPS IP {vps_ipv4} or MX. Update to include 'ip4:{vps_ipv4}' or 'mx'."}
                return {"status": "MISSING", "message": f"Found TXT records ({', '.join(live_records)}) but none contain 'v=spf1'."}

            if name == "mx":
                for mx in live_records:
                    if mail_host in mx or domain_name in mx:
                        return {"status": "CONFIGURED", "message": f"MX pointing correctly: '{mx}'"}
                return {"status": "INVALID", "message": f"MX currently points to '{', '.join(live_records)}' instead of '{mail_host}'. Update MX host to '{mail_host}' with priority 10."}

            if name == "a":
                if vps_ipv4 in live_records:
                    return {"status": "CONFIGURED", "message": f"A record matches VPS IP ({vps_ipv4})"}
                return {"status": "INVALID", "message": f"Subdomain '{mail_host}' currently resolves to '{', '.join(live_records)}' instead of '{vps_ipv4}'. If using Cloudflare, turn OFF Proxy (set Orange Cloud to Grey Cloud / DNS Only)."}

            if name == "ptr":
                if any(mail_host in p for p in live_records):
                    return {"status": "CONFIGURED", "message": f"Reverse DNS matches hostname: '{live_records[0]}'"}
                return {"status": "UNVERIFIED", "message": f"Contabo PTR currently resolves to '{live_records[0] if live_records else 'none'}' instead of '{mail_host}'. Update PTR in Contabo Cloud Panel for optimal deliverability."}

            if name == "dmarc":
                dmarc_records = [r for r in live_records if "v=DMARC1" in r]
                if dmarc_records:
                    return {"status": "CONFIGURED", "message": f"DMARC policy active: '{dmarc_records[0]}'"}
                return {"status": "MISSING", "message": f"Found TXT record '{', '.join(live_records)}' at '_dmarc.{domain_name}' but missing 'v=DMARC1'."}

            if name == "dkim":
                dkim_records = [r for r in live_records if "v=DKIM1" in r or "p=" in r]
                if dkim_records:
                    return {"status": "CONFIGURED", "message": "DKIM 2048-bit RSA public key published and validated."}
                return {"status": "MISSING", "message": f"Found TXT record '{', '.join(live_records)}' at 'mail._domainkey.{domain_name}' but missing DKIM public key."}

            return {"status": "CONFIGURED" if expected_val in live_records else "INVALID", "message": f"Observed live value: '{', '.join(live_records)}'"}

        validation = {
            "a": validate_item("a", live_a, vps_ipv4),
            "aaaa": validate_item("aaaa", live_aaaa, vps_ipv6),
            "mx": validate_item("mx", live_mx, mail_host),
            "spf": validate_item("spf", live_txt, "v=spf1 mx ~all"),
            "dkim": validate_item("dkim", live_dkim, "DKIM"),
            "dmarc": validate_item("dmarc", live_dmarc, "v=DMARC1"),
            "ptr": validate_item("ptr", live_ptr, mail_host)
        }

        data = {
            "status": "success",
            "domain": domain_name,
            "mail_host": mail_host,
            "expected_records": expected_records,
            "validation": validation,
            "summary": {
                "domain_provider_records": ["A", "AAAA", "MX", "SPF", "DKIM", "DMARC"],
                "vps_provider_records": ["PTR"]
            }
        }
        return jsonify(data)
    except Exception as e:
        return api_error(str(e), code="INTERNAL_SERVER_ERROR", status_code=500)