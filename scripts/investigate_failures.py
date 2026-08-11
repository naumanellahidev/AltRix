#!/usr/bin/env python3
"""Investigate the 4 verification failures"""
import subprocess, os

VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
admin_pass = ""
with open(VPS_PG_CONFIG) as f:
    for line in f:
        if line.startswith("VPS_PG_ADMIN_PASSWORD="):
            admin_pass = line.split("=", 1)[1].strip().strip("\"'")

env = dict(os.environ, PGPASSWORD=admin_pass)

def psql(sql):
    r = subprocess.run(["psql","-h","127.0.0.1","-p","5432","-U","altrix_admin","-d","altrix","-t","-A","-c",sql],
                       env=env, capture_output=True, text=True)
    return r.stdout.strip()

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.stdout.strip()

print("=" * 70)
print("FAILURE INVESTIGATION")
print("=" * 70)

# 1. Startup + Schema validation from full logs
print("\n[A] APP STARTUP & SCHEMA VALIDATION (from full logs)")
out = run("docker logs altrix_backend 2>&1 | grep -i -E 'startup complete|Uvicorn running|Schema validation|no drift' | tail -5")
print(out)

# 2. Find correct holiday table name
print("\n[B] HOLIDAY TABLE NAME SEARCH")
result = psql("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE '%holiday%' OR tablename LIKE '%event%' OR tablename LIKE '%calendar%') ORDER BY tablename;")
print(f"  Tables matching holiday/event/calendar: {result or '(none)'}")

# Also search with broader pattern
result2 = psql("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%holid%' ORDER BY tablename;")
print(f"  Tables matching holid%: {result2 or '(none)'}")

# Check if the app code references holiday_events
out = run("grep -rl 'holiday' /app/app/ 2>/dev/null | head -10")
print(f"\n  App files referencing 'holiday': {out or '(none)'}")
if out:
    for f in out.split("\n"):
        if not f.strip(): continue
        tables = run(f"grep -i 'holiday' '{f}' | head -3")
        print(f"    {f}: {tables[:120]}")

# 3. Docs endpoint check
print("\n[C] DOCS ENDPOINT")
for url in ["/docs", "/api/docs", "/api/v1/docs", "/redoc", "/openapi.json", "/api/openapi.json"]:
    code = run(f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:8000{url}")
    print(f"  http://127.0.0.1:8000{url} -> HTTP {code}")

# 4. Application log errors detail
print("\n[D] ERROR LOG DETAIL (last 30 min)")
out = run("docker logs --since 30m altrix_backend 2>&1 | grep -i 'ERROR' | grep -v redis | grep -v Redis | head -5")
print(f"  {out or '(none)'}")

print("\n" + "=" * 70)
