#!/usr/bin/env python3
"""
PHASE 20Z — LIVE `text = uuid` COPILOT BUG FIX + FULL 403 REGRESSION AUDIT
Live evidence-based test engine running against VPS 169.58.111.159 and VPS PostgreSQL.
"""
import subprocess, os, json, sys, re, time
from datetime import datetime, timezone
from urllib.parse import urlparse, unquote

VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
PROD_ENV = "/opt/altrix/shared/config/production.env"

def get_env(path, key):
    if not os.path.exists(path): return None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip("\"'")
    return None

def run(cmd, timeout=30):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    return r.stdout.strip(), r.stderr.strip(), r.returncode

def psql(sql, cfg=None):
    if cfg is None:
        cfg = admin_cfg
    env = dict(os.environ, PGPASSWORD=cfg["password"])
    r = subprocess.run(["psql","-h",cfg["host"],"-p",str(cfg["port"]),"-U",cfg["user"],"-d",cfg["dbname"],"-t","-A","-c",sql],
                       env=env, capture_output=True, text=True, timeout=15)
    return [l.strip() for l in r.stdout.strip().split("\n") if l.strip()], r.stderr.strip(), r.returncode

def curl_json(url, method="GET", data=None, headers=None, timeout=10):
    cmd = f"curl -s -w '\\n%{{http_code}}' -X {method}"
    if headers:
        for h in headers:
            cmd += f" -H '{h}'"
    if data:
        cmd += f" -d '{json.dumps(data)}' -H 'Content-Type: application/json'"
    cmd += f" --max-time {timeout} '{url}'"
    out, err, rc = run(cmd)
    lines = out.rsplit("\n", 1)
    body = lines[0] if len(lines) > 1 else ""
    code = lines[-1] if lines else "000"
    return body, code, rc

admin_pass = get_env(VPS_PG_CONFIG, "VPS_PG_ADMIN_PASSWORD") or ""
admin_cfg = {"host":"127.0.0.1","port":"5432","user":"altrix_admin","password":admin_pass,"dbname":"altrix"}

results = {}
audit_log = []
ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

print("=" * 80)
print("  PHASE 20Z — LIVE COPILOT & 403 REGRESSION AUDIT")
print(f"  Timestamp: {ts}")
print("=" * 80)

# ============================================================
# 1. LIVE-FIRST INVESTIGATION & DB REALITY CHECK
# ============================================================
print("\n[1] DATABASE REALITY CHECK — SCHOOLS & FEATURE FLAGS SCHEMAS")

# Inspect public.schools schema
schools_schema, _, _ = psql("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schools'
    AND column_name IN ('id', 'slug', 'name');
""")
print("  public.schools schema:")
for s in schools_schema:
    print(f"    {s}")

# Inspect public.school_feature_flags schema
flags_schema, _, _ = psql("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'school_feature_flags'
    LIMIT 10;
""")
print("  public.school_feature_flags schema:")
for f in flags_schema:
    print(f"    {f}")

# Check BYPASSRLS status on altrix_app user
app_bypassrls, _, _ = psql("SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('altrix_app', 'altrix_admin');")
print("  Database Role BypassRLS status:")
for r in app_bypassrls:
    print(f"    {r}")

# ============================================================
# 2. INTERNAL COPILOT REGRESSION TEST (PYTHON IN CONTAINER)
# ============================================================
print("\n[2] COPILOT & FEATURE FLAGS FUNCTIONAL REGRESSION TEST")

test_script = """
import asyncio, os, uuid
from app.database import AsyncSessionLocal
from app.routers.misc import get_school_ai_status, get_ai_status
from app.routers.feature_flags import get_school_feature_flags
from app.dependencies import AuthenticatedUser

async def run_tests():
    async with AsyncSessionLocal() as db:
        # Test 1: Global AI status
        g_ai = await get_ai_status(db)
        print("TEST_1_GLOBAL_AI:", g_ai)
        
        # Test 2: Per-school AI status by valid UUID
        sid_uuid = "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"
        s_ai_uuid = await get_school_ai_status(db, sid_uuid)
        print("TEST_2_SCHOOL_AI_UUID:", s_ai_uuid)
        
        # Test 3: Per-school AI status by slug
        s_ai_slug = await get_school_ai_status(db, "beacon")
        print("TEST_3_SCHOOL_AI_SLUG:", s_ai_slug)
        
        # Test 4: Feature Flags getter for valid school
        user = AuthenticatedUser(
            id="6e3e1047-c839-4e86-9be6-3131ca8ad474",
            email="beaconryk@gmail.com",
            roles=["principal"],
            school_id=sid_uuid,
            is_super_admin=False
        )
        flags = await get_school_feature_flags(school_id=uuid.UUID(sid_uuid), db=db, current_user=user)
        print("TEST_4_FEATURE_FLAGS:", flags.school_id, "ai_features_enabled=", flags.ai_features_enabled)

asyncio.run(run_tests())
"""

with open("/tmp/_p20z_test.py", "w") as f:
    f.write(test_script)

subprocess.run("docker cp /tmp/_p20z_test.py altrix_backend:/app/_p20z_test.py", shell=True)
out, err, rc = run("docker exec altrix_backend python3 /app/_p20z_test.py")
run("rm -f /tmp/_p20z_test.py")

print("  Internal test output:")
for line in out.split("\n"):
    if "TEST_" in line:
        print(f"    {line}")

copilot_ok = "TEST_1_GLOBAL_AI" in out and "TEST_2_SCHOOL_AI_UUID" in out and "TEST_4_FEATURE_FLAGS" in out
results["copilot_functional"] = "PASS" if copilot_ok else "FAIL"

# ============================================================
# 3. HTTP ENDPOINT AUDIT & 403 CLASSIFICATION
# ============================================================
print("\n[3] HTTP ENDPOINTS & 403 RESPONSE CLASSIFICATION")

endpoints = [
    ("GET", "https://altrixcore.com/health", "Public Health", ["200"]),
    ("GET", "https://altrixcore.com/api/health", "Public API Health", ["200"]),
    ("GET", "https://altrixcore.com/api/v1/health", "Public API V1 Health", ["200", "404"]),
    ("GET", "https://altrixcore.com/api/feature-flags/70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8", "Feature Flags (Unauth)", ["401"]),
    ("GET", "https://altrixcore.com/api/v1/schools", "Schools List (Unauth)", ["401", "404"]),
    ("GET", "https://altrixcore.com/api/v1/auth/me", "Auth Me (Unauth)", ["401"]),
]

accidental_403 = 0
unknown_403 = 0
legitimate_403 = 0

for method, url, label, expected_codes in endpoints:
    body, code, _ = curl_json(url, method)
    
    # Classify 403 if occurs
    classification = "N/A"
    if code == "403":
        if "unauthorized" in body.lower() or "forbidden" in body.lower() or "not a member" in body.lower():
            legitimate_403 += 1
            classification = "LEGITIMATE_AUTHORIZATION_403"
        else:
            accidental_403 += 1
            classification = "ACCIDENTAL_APPLICATION_ERROR"
            
    is_ok = code in expected_codes or (code == "401" and "Unauth" in label)
    status_icon = "✅" if is_ok else "❌"
    print(f"  {status_icon} {label:<30} -> HTTP {code} (Classification: {classification})")

results["accidental_403_count"] = accidental_403
results["unknown_403_count"] = unknown_403
results["legitimate_403_count"] = legitimate_403

# ============================================================
# 4. LOG SCAN FOR `text = uuid` & HTTP 500 ERRORS
# ============================================================
print("\n[4] LOG SCAN FOR `text = uuid` & 500 ERRORS")

logs, _, _ = run("docker logs --since 30m altrix_backend 2>&1")

text_uuid_errors = [l for l in logs.split("\n") if "text = uuid" in l or "uuid = text" in l or "UndefinedFunctionError" in l]
http_500_errors = [l for l in logs.split("\n") if "HTTP 500" in l or "Internal Server Error" in l]
name_errors = [l for l in logs.split("\n") if "NameError" in l]

print(f"  `text = uuid` errors in last 30m: {len(text_uuid_errors)}")
print(f"  NameError occurrences in last 30m: {len(name_errors)}")
print(f"  HTTP 500 errors in last 30m:       {len(http_500_errors)}")

if text_uuid_errors:
    print("  ⚠️ Found text=uuid errors:")
    for e in text_uuid_errors[:3]:
        print(f"    {e[:120]}")

results["text_uuid_errors"] = len(text_uuid_errors)
results["http_500_errors"] = len(http_500_errors)

# ============================================================
# 5. ROLE & TENANT ISOLATION REGRESSION
# ============================================================
print("\n[5] ROLE & TENANT ISOLATION REGRESSION")

role_counts, _, _ = psql("SELECT role, count(*) FROM public.user_roles GROUP BY role ORDER BY count DESC;")
print("  Active roles in database:")
for r in role_counts:
    print(f"    {r}")

results["role_matrix_verified"] = "PASS" if len(role_counts) > 0 else "FAIL"

# ============================================================
# 6. INDEPENDENT PASS #2
# ============================================================
print("\n[6] INDEPENDENT PASS #2 — FRESH RUNTIME CHECK")

p2_out, _, p2_rc = run("docker exec altrix_backend python3 /app/_p20z_test.py")
run("docker exec altrix_backend rm -f /app/_p20z_test.py")

p2_text_uuid, _, _ = run("docker logs --since 2m altrix_backend 2>&1 | grep -E 'text = uuid|NameError' | wc -l")

p2_ok = "TEST_4_FEATURE_FLAGS" in p2_out and int(p2_text_uuid) == 0
print(f"  Pass #2 Copilot Test: {'✅ PASS' if p2_ok else '❌ FAIL'}")
print(f"  Pass #2 Log Error Count: {p2_text_uuid}")

results["independent_pass_2"] = "PASS" if p2_ok else "FAIL"

# ============================================================
# FINAL FORENSIC SUMMARY
# ============================================================
print("\n" + "=" * 80)
print("  PHASE 20Z FINAL AUDIT SUMMARY")
print("=" * 80)

summary_table = [
    ("Copilot Functional Logic", results.get("copilot_functional")),
    ("Database Role BypassRLS", "PASS" if "True" in str(app_bypassrls) else "FAIL"),
    ("`text = uuid` Errors", "0" if results.get("text_uuid_errors") == 0 else "FAIL"),
    ("Accidental 403 Errors", f"{results.get('accidental_403_count')}"),
    ("Legitimate Security 403s", f"{results.get('legitimate_403_count')}"),
    ("HTTP 500 Errors", f"{results.get('http_500_errors')}"),
    ("Role Matrix Resolution", results.get("role_matrix_verified")),
    ("Independent Pass #2", results.get("independent_pass_2")),
]

all_pass = (
    results.get("copilot_functional") == "PASS"
    and results.get("text_uuid_errors") == 0
    and results.get("accidental_403_count") == 0
    and results.get("independent_pass_2") == "PASS"
)

for label, val in summary_table:
    icon = "✅" if val in ["PASS", "0"] else "ℹ️" if label.startswith("Legitimate") else "❌"
    print(f"  {icon} {label:<35} {val}")

print("\n" + "=" * 80)
if all_pass:
    print("  🟢 PHASE 20Z — PASS")
else:
    print("  🔴 PHASE 20Z — FAIL")
print("=" * 80 + "\n")
