#!/usr/bin/env python3
import os, subprocess, json

def get_env_var(file_path, var_name):
    if not os.path.exists(file_path):
        return None
    with open(file_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{var_name}="):
                return line.split("=", 1)[1].strip("\"'")
    return None

def run_p(cfg, sql):
    env = dict(os.environ, PGPASSWORD=cfg["password"])
    cmd = ["psql", "-h", cfg["host"], "-p", cfg["port"], "-U", cfg["user"], "-d", cfg["dbname"], "-t", "-A", "-c", sql]
    res = subprocess.run(cmd, env=env, capture_output=True, text=True)
    return set([line.strip() for line in res.stdout.strip().split("\n") if line.strip()])

src_cfg = {
    "host": "aws-1-ap-southeast-1.pooler.supabase.com",
    "port": "5432",
    "user": "postgres.nhossjmkdjeeacbajelq",
    "password": get_env_var("/opt/altrix/shared/config/production_supabase_rollback.env", "DATABASE_URL").split(":", 2)[2].split("@")[0],
    "dbname": "postgres"
}

tgt_cfg = {
    "host": "127.0.0.1",
    "port": "5432",
    "user": "altrix_admin",
    "password": get_env_var("/opt/altrix/shared/config/vps_postgresql.env", "VPS_PG_ADMIN_PASSWORD") or "altrix_secure_admin_pass",
    "dbname": "altrix"
}

# 1. PK Differences
pk_sql = """
SELECT tc.table_schema || '.' || tc.table_name || '::' || string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position)
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema IN ('public', 'auth')
GROUP BY tc.table_schema, tc.table_name ORDER BY 1;
"""
src_pk = run_p(src_cfg, pk_sql)
tgt_pk = run_p(tgt_cfg, pk_sql)
print("=== PK DIFFERENCES ===")
print("Source only:", src_pk - tgt_pk)
print("Target only:", tgt_pk - src_pk)

# 2. FK Differences
fk_sql = """
SELECT tc.table_schema || '.' || tc.table_name || '.' || kcu.column_name || '->' || ccu.table_schema || '.' || ccu.table_name || '.' || ccu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema IN ('public', 'auth') ORDER BY 1;
"""
src_fk = run_p(src_cfg, fk_sql)
tgt_fk = run_p(tgt_cfg, fk_sql)
print("\n=== FK DIFFERENCES ===")
print("Source only:", src_fk - tgt_fk)
print("Target only:", tgt_fk - src_fk)

# 3. Check Constraints
chk_sql = """
SELECT tc.table_schema || '.' || tc.table_name || '.' || tc.constraint_name || '::' || cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name AND tc.constraint_schema = cc.constraint_schema
WHERE tc.constraint_type = 'CHECK' AND tc.table_schema IN ('public', 'auth') AND cc.check_clause NOT LIKE '%IS NOT NULL' ORDER BY 1;
"""
src_chk = run_p(src_cfg, chk_sql)
tgt_chk = run_p(tgt_cfg, chk_sql)
print("\n=== CHECK DIFFERENCES ===")
print("Source only:", src_chk - tgt_chk)
print("Target only:", tgt_chk - src_chk)
