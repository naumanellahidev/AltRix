#!/usr/bin/env python3
"""Phase 20Y-Z: Diagnose and verify VPS database connectivity from altrix_backend container"""
import subprocess, json, os, sys

def run(cmd, capture=True):
    r = subprocess.run(cmd, shell=True, capture_output=capture, text=True)
    return r.stdout.strip(), r.stderr.strip(), r.returncode

print("=" * 70)
print("PHASE 20Y-Z DIAGNOSTIC & INDEPENDENCE VERIFICATION")
print("=" * 70)

# 1. PostgreSQL listening addresses
print("\n[1] PostgreSQL Listening Addresses")
out, _, _ = run("ss -tlnp | grep 5432")
print(out or "  (none found)")

# 2. Test TCP connectivity from container to 172.19.0.1:5432
print("\n[2] TCP Connectivity Test from Container")
# Write a small test script into the container
tcp_test = """
import socket
targets = [("172.19.0.1", 5432), ("172.20.0.1", 5432), ("127.0.0.1", 5432)]
for host, port in targets:
    s = socket.socket()
    s.settimeout(3)
    r = s.connect_ex((host, port))
    print(f"  TCP {host}:{port} -> {'OK' if r == 0 else f'FAILED (errno={r})'}")
    s.close()
"""
with open("/tmp/_tcp_test.py", "w") as f:
    f.write(tcp_test)
subprocess.run("docker cp /tmp/_tcp_test.py altrix_backend:/tmp/_tcp_test.py", shell=True)
out, err, rc = run("docker exec altrix_backend python3 /tmp/_tcp_test.py")
print(out)
if err: print(f"  stderr: {err}")

# 3. DATABASE_URL scheme check
print("\n[3] Container DATABASE_URL (redacted)")
out, _, _ = run("docker exec altrix_backend printenv DATABASE_URL")
if out:
    # Redact credentials
    import re
    redacted = re.sub(r'://[^:]+:[^@]+@', '://USER:***@', out)
    print(f"  {redacted}")
    
    # Check scheme
    if out.startswith("postgresql+asyncpg://"):
        print("  Scheme: postgresql+asyncpg (async OK)")
    elif out.startswith("postgresql://"):
        print("  Scheme: postgresql (may need asyncpg conversion)")
    
    # Parse host
    from urllib.parse import urlparse, unquote
    url = out.replace("postgresql+asyncpg://", "postgresql://")
    p = urlparse(url)
    print(f"  Host: {p.hostname}")
    print(f"  Port: {p.port}")
    print(f"  Database: {p.path.lstrip('/')}")
    print(f"  User: {unquote(p.username) if p.username else 'N/A'}")
    
    is_vps = p.hostname in ["127.0.0.1", "localhost", "172.19.0.1", "172.20.0.1", "172.17.0.1"]
    is_supabase = "supabase" in (p.hostname or "")
    print(f"  Is VPS endpoint: {is_vps}")
    print(f"  Is Supabase endpoint: {is_supabase}")

# 4. Application database.py - how does it handle the URL?
print("\n[4] Application database.py Configuration")
out, _, _ = run("docker exec altrix_backend cat /app/app/database.py")
if out:
    # Show relevant lines only
    for i, line in enumerate(out.split("\n"), 1):
        line_lower = line.lower()
        if any(k in line_lower for k in ["database_url", "engine", "asyncpg", "create_async", "pool", "sessionmaker"]):
            # Redact any inline URLs
            redacted_line = re.sub(r'postgresql[+\w]*://[^\s"\']+', 'postgresql://***REDACTED***', line)
            print(f"  L{i}: {redacted_line.rstrip()}")

# 5. Full container logs
print("\n[5] Container Logs (last 30 lines)")
out, err, _ = run("docker logs --tail 30 altrix_backend 2>&1")
print(out[:3000] if out else "(empty)")

# 6. PostgreSQL auth test from host
print("\n[6] Direct psql Test from Host")
# Read VPS PG password
vps_pg_conf = "/opt/altrix/shared/config/vps_postgresql.env"
admin_pass = None
if os.path.exists(vps_pg_conf):
    with open(vps_pg_conf) as f:
        for line in f:
            if line.startswith("VPS_PG_ADMIN_PASSWORD="):
                admin_pass = line.split("=", 1)[1].strip().strip("\"'")

if admin_pass:
    env = dict(os.environ, PGPASSWORD=admin_pass)
    r = subprocess.run(
        ["psql", "-h", "127.0.0.1", "-p", "5432", "-U", "altrix_admin", "-d", "altrix", "-t", "-A", "-c",
         "SELECT current_user, current_database(), inet_server_addr(), inet_server_port();"],
        env=env, capture_output=True, text=True
    )
    print(f"  Result: {r.stdout.strip()}")
    if r.stderr.strip():
        print(f"  Error: {r.stderr.strip()}")

# 7. Test with app user credentials from DATABASE_URL
print("\n[7] psql Test with App User (from DATABASE_URL) via 172.19.0.1")
out_url, _, _ = run("cat /opt/altrix/shared/config/production.env | grep '^DATABASE_URL='")
if out_url:
    url_val = out_url.split("=", 1)[1].strip().strip("\"'")
    url_clean = url_val.replace("postgresql+asyncpg://", "postgresql://")
    p2 = urlparse(url_clean)
    app_user = unquote(p2.username) if p2.username else ""
    app_pass = unquote(p2.password) if p2.password else ""
    app_host = p2.hostname or "172.19.0.1"
    app_port = str(p2.port or 5432)
    app_db = p2.path.lstrip("/") or "altrix"
    
    env2 = dict(os.environ, PGPASSWORD=app_pass)
    r2 = subprocess.run(
        ["psql", "-h", app_host, "-p", app_port, "-U", app_user, "-d", app_db, "-t", "-A", "-c",
         "SELECT current_user, current_database(), inet_server_addr(), inet_server_port();"],
        env=env2, capture_output=True, text=True
    )
    print(f"  Result: {r2.stdout.strip()}")
    if r2.stderr.strip():
        print(f"  Error: {r2.stderr.strip()}")

# 8. Check if altrix_app user exists in PostgreSQL
print("\n[8] PostgreSQL User Check")
if admin_pass:
    env = dict(os.environ, PGPASSWORD=admin_pass)
    r3 = subprocess.run(
        ["psql", "-h", "127.0.0.1", "-p", "5432", "-U", "altrix_admin", "-d", "altrix", "-t", "-A", "-c",
         "SELECT usename, usesuper FROM pg_user WHERE usename LIKE 'altrix%';"],
        env=env, capture_output=True, text=True
    )
    print(f"  Users: {r3.stdout.strip()}")

# 9. Health check endpoints
print("\n[9] Production Endpoint Status")
for url in ["http://127.0.0.1:8000/health", "https://altrixcore.com/health", "https://altrixcore.com/api/health"]:
    out, _, _ = run(f"curl -s -o /dev/null -w '%{{http_code}}' {url}")
    print(f"  {url} -> HTTP {out}")

print("\n" + "=" * 70)
print("DIAGNOSTIC COMPLETE")
print("=" * 70)
