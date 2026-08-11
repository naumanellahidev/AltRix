#!/usr/bin/env python3
"""
Live Foreign Key Audit: VPS PostgreSQL vs Supabase PostgreSQL
Read-only comparison — no modifications to either database.
"""
import subprocess, os, json, sys
from urllib.parse import urlparse, unquote

VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
SUPABASE_ROLLBACK = "/opt/altrix/shared/config/production_supabase_rollback.env"

def get_env(path, key):
    if not os.path.exists(path): return None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip("\"'")
    return None

def parse_url(url):
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    p = urlparse(url)
    return {
        "host": p.hostname or "localhost",
        "port": str(p.port or 5432),
        "user": unquote(p.username) if p.username else "",
        "password": unquote(p.password) if p.password else "",
        "dbname": p.path.lstrip("/") or "postgres"
    }

def run_psql(cfg, sql):
    env = dict(os.environ, PGPASSWORD=cfg["password"])
    cmd = ["psql", "-h", cfg["host"], "-p", cfg["port"], "-U", cfg["user"], "-d", cfg["dbname"], "-t", "-A", "-c", sql]
    r = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=30)
    lines = [l.strip() for l in r.stdout.strip().split("\n") if l.strip()]
    return lines, r.stderr.strip(), r.returncode

FK_QUERY = """
SELECT
    tc.table_schema || '.' || tc.table_name AS source_table,
    kcu.column_name AS source_column,
    ccu.table_schema || '.' || ccu.table_name AS target_table,
    ccu.column_name AS target_column,
    tc.constraint_name,
    rc.update_rule,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
    AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema IN ('public', 'auth')
ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.column_name;
"""

print("=" * 80)
print("  LIVE FOREIGN KEY AUDIT: VPS PostgreSQL vs Supabase PostgreSQL")
print("=" * 80)

# Get VPS config
admin_pass = get_env(VPS_PG_CONFIG, "VPS_PG_ADMIN_PASSWORD") or ""
vps_cfg = {"host": "127.0.0.1", "port": "5432", "user": "altrix_admin", "password": admin_pass, "dbname": "altrix"}

# Get Supabase config
supa_url = get_env(SUPABASE_ROLLBACK, "DATABASE_URL")
if not supa_url:
    # Try alternate key names
    supa_url = get_env(SUPABASE_ROLLBACK, "SUPABASE_DATABASE_URL")
if not supa_url:
    # Read entire file and find any postgresql URL
    with open(SUPABASE_ROLLBACK) as f:
        for line in f:
            line = line.strip()
            if "postgresql" in line and "supabase" in line:
                supa_url = line.split("=", 1)[1].strip("\"'") if "=" in line else None
                break

if not supa_url:
    print("  ERROR: Cannot find Supabase DATABASE_URL in rollback config")
    print(f"  Checked: {SUPABASE_ROLLBACK}")
    sys.exit(1)

supa_cfg = parse_url(supa_url)
print(f"\n  VPS:      {vps_cfg['host']}:{vps_cfg['port']}/{vps_cfg['dbname']}")
print(f"  Supabase: {supa_cfg['host']}:{supa_cfg['port']}/{supa_cfg['dbname']}")

# Query VPS
print("\n[1] Querying VPS PostgreSQL foreign keys...")
vps_rows, vps_err, vps_rc = run_psql(vps_cfg, FK_QUERY)
if vps_rc != 0:
    print(f"  ERROR: {vps_err}")
    sys.exit(1)
print(f"  VPS foreign keys found: {len(vps_rows)}")

# Query Supabase
print("[2] Querying Supabase PostgreSQL foreign keys...")
supa_rows, supa_err, supa_rc = run_psql(supa_cfg, FK_QUERY)
if supa_rc != 0:
    print(f"  ERROR: {supa_err}")
    sys.exit(1)
print(f"  Supabase foreign keys found: {len(supa_rows)}")

# Parse into structured dicts
def parse_fk(row):
    parts = row.split("|")
    if len(parts) < 7:
        return None
    return {
        "source_table": parts[0],
        "source_column": parts[1],
        "target_table": parts[2],
        "target_column": parts[3],
        "constraint_name": parts[4],
        "update_rule": parts[5],
        "delete_rule": parts[6],
    }

vps_fks = {}
for r in vps_rows:
    fk = parse_fk(r)
    if fk:
        key = f"{fk['source_table']}.{fk['source_column']} -> {fk['target_table']}.{fk['target_column']}"
        vps_fks[key] = fk

supa_fks = {}
for r in supa_rows:
    fk = parse_fk(r)
    if fk:
        key = f"{fk['source_table']}.{fk['source_column']} -> {fk['target_table']}.{fk['target_column']}"
        supa_fks[key] = fk

vps_keys = set(vps_fks.keys())
supa_keys = set(supa_fks.keys())

# Compare
only_vps = vps_keys - supa_keys
only_supa = supa_keys - vps_keys
common = vps_keys & supa_keys

# Check rule differences on common FKs
rule_diffs = []
for key in sorted(common):
    v = vps_fks[key]
    s = supa_fks[key]
    if v["update_rule"] != s["update_rule"] or v["delete_rule"] != s["delete_rule"]:
        rule_diffs.append({
            "fk": key,
            "vps_update": v["update_rule"], "supa_update": s["update_rule"],
            "vps_delete": v["delete_rule"], "supa_delete": s["delete_rule"],
        })

# Check constraint name differences
name_diffs = []
for key in sorted(common):
    v = vps_fks[key]
    s = supa_fks[key]
    if v["constraint_name"] != s["constraint_name"]:
        name_diffs.append({
            "fk": key,
            "vps_name": v["constraint_name"],
            "supa_name": s["constraint_name"],
        })

# Report
print("\n" + "=" * 80)
print("  COMPARISON RESULTS")
print("=" * 80)

print(f"\n  Total VPS FKs:        {len(vps_fks)}")
print(f"  Total Supabase FKs:   {len(supa_fks)}")
print(f"  Common (matched):     {len(common)}")
print(f"  Only in VPS:          {len(only_vps)}")
print(f"  Only in Supabase:     {len(only_supa)}")
print(f"  Rule differences:     {len(rule_diffs)}")
print(f"  Name differences:     {len(name_diffs)}")

if only_vps:
    print(f"\n{'=' * 80}")
    print(f"  FOREIGN KEYS ONLY IN VPS ({len(only_vps)})")
    print(f"{'=' * 80}")
    for fk in sorted(only_vps):
        v = vps_fks[fk]
        print(f"  {fk}")
        print(f"    Constraint: {v['constraint_name']}  ON UPDATE {v['update_rule']}  ON DELETE {v['delete_rule']}")

if only_supa:
    print(f"\n{'=' * 80}")
    print(f"  FOREIGN KEYS ONLY IN SUPABASE ({len(only_supa)})")
    print(f"{'=' * 80}")
    for fk in sorted(only_supa):
        s = supa_fks[fk]
        print(f"  {fk}")
        print(f"    Constraint: {s['constraint_name']}  ON UPDATE {s['update_rule']}  ON DELETE {s['delete_rule']}")

if rule_diffs:
    print(f"\n{'=' * 80}")
    print(f"  RULE DIFFERENCES ({len(rule_diffs)})")
    print(f"{'=' * 80}")
    for d in rule_diffs:
        print(f"  {d['fk']}")
        print(f"    VPS:      ON UPDATE {d['vps_update']}  ON DELETE {d['vps_delete']}")
        print(f"    Supabase: ON UPDATE {d['supa_update']}  ON DELETE {d['supa_delete']}")

if name_diffs:
    print(f"\n{'=' * 80}")
    print(f"  CONSTRAINT NAME DIFFERENCES ({len(name_diffs)})")
    print(f"{'=' * 80}")
    for d in name_diffs[:20]:
        print(f"  {d['fk']}")
        print(f"    VPS:      {d['vps_name']}")
        print(f"    Supabase: {d['supa_name']}")
    if len(name_diffs) > 20:
        print(f"  ... and {len(name_diffs) - 20} more")

if not only_vps and not only_supa and not rule_diffs:
    print(f"\n  🟢 FOREIGN KEYS ARE IDENTICAL BETWEEN VPS AND SUPABASE")
else:
    total_diffs = len(only_vps) + len(only_supa) + len(rule_diffs)
    print(f"\n  🔴 {total_diffs} FOREIGN KEY DIFFERENCE(S) DETECTED")

print("\n" + "=" * 80)
