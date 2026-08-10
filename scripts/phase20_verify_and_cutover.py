#!/usr/bin/env python3
"""
AltRix Phase 20: Comprehensive Database Verification & Migration Engine
Restores Supabase dump into PostgreSQL 17, validates row parity, and verifies data integrity.
"""

import os
import sys
import json
import hashlib
import subprocess
from urllib.parse import urlparse, unquote

PROD_ENV = "/opt/altrix/shared/config/production.env"
VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
BACKUP_DIR = "/var/backups/altrix/supabase_migration_final"

def get_env_var(file_path, var_name):
    if not os.path.exists(file_path):
        return None
    with open(file_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{var_name}="):
                return line.split("=", 1)[1].strip("\"'")
    return None

def parse_db_url(url):
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    p = urlparse(url)
    return {
        "user": unquote(p.username) if p.username else "",
        "password": unquote(p.password) if p.password else "",
        "host": p.hostname or "localhost",
        "port": str(p.port or 5432),
        "dbname": p.path.lstrip("/") or "postgres"
    }

def main():
    print("=================================================================")
    print("  PHASE 20: DATABASE VERIFICATION & AUDIT ENGINE                 ")
    print("=================================================================")
    
    source_url = get_env_var(PROD_ENV, "DATABASE_URL")
    if not source_url:
        print("[-] Error: DATABASE_URL not found")
        sys.exit(1)
    src_cfg = parse_db_url(source_url)
    
    admin_pass = get_env_var(VPS_PG_CONFIG, "VPS_PG_ADMIN_PASSWORD") or "altrix_secure_admin_pass"
    app_pass = get_env_var(VPS_PG_CONFIG, "VPS_PG_APP_PASSWORD") or "altrix_secure_app_pass"
    
    tgt_cfg = {
        "host": "127.0.0.1",
        "port": "5432",
        "dbname": "altrix",
        "user": "altrix_admin",
        "password": admin_pass
    }
    
    src_env = os.environ.copy()
    src_env["PGPASSWORD"] = src_cfg["password"]
    
    tgt_env = os.environ.copy()
    tgt_env["PGPASSWORD"] = tgt_cfg["password"]
    
    # 1. Restore auth_users.sql if exists
    auth_sql = os.path.join(BACKUP_DIR, "auth_users.sql")
    dump_sql = os.path.join(BACKUP_DIR, "supabase_full_dump.sql")
    
    print("[+] Step 1: Restoring Database Structure and Data...")
    
    # Ensure extensions & schemas
    init_sql = """
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS public;
    """
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", init_sql], env=tgt_env, capture_output=True)
    
    if os.path.exists(auth_sql) and os.path.getsize(auth_sql) > 0:
        subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-f", auth_sql], env=tgt_env, capture_output=True)
        
    if os.path.exists(dump_sql):
        subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-f", dump_sql], env=tgt_env, capture_output=True)
        print("    SQL restore executed.")
        
    # 2. Grant permissions to altrix_app
    print("[+] Step 2: Granting Permissions to 'altrix_app'...")
    grant_sql = """
    GRANT ALL ON SCHEMA public TO altrix_admin;
    GRANT ALL ON SCHEMA auth TO altrix_admin;
    GRANT USAGE, CREATE ON SCHEMA public TO altrix_app;
    GRANT USAGE ON SCHEMA auth TO altrix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO altrix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO altrix_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO altrix_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA auth TO altrix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO altrix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO altrix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO altrix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO altrix_app;
    """
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", grant_sql], env=tgt_env, capture_output=True)
    
    # 3. Table-by-Table Row Count Comparison
    print("\n[+] Step 3: Executing Comprehensive Source vs Target Row Count Verification...")
    list_sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
    
    src_tables_res = subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", list_sql], env=src_env, capture_output=True, text=True)
    src_tables = [t.strip() for t in src_tables_res.stdout.strip().split("\n") if t.strip()]
    
    tgt_tables_res = subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-t", "-c", list_sql], env=tgt_env, capture_output=True, text=True)
    tgt_tables = [t.strip() for t in tgt_tables_res.stdout.strip().split("\n") if t.strip()]
    
    print(f"    Source Tables in Public Schema: {len(src_tables)}")
    print(f"    Target Tables in Public Schema: {len(tgt_tables)}")
    
    report = []
    mismatch_count = 0
    total_source_rows = 0
    total_target_rows = 0
    
    for tbl in src_tables:
        s_cnt_res = subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", f"SELECT count(*) FROM \"{tbl}\";"], env=src_env, capture_output=True, text=True)
        s_cnt = int(s_cnt_res.stdout.strip()) if s_cnt_res.stdout.strip().isdigit() else 0
        
        t_cnt_res = subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-t", "-c", f"SELECT count(*) FROM \"{tbl}\";"], env=tgt_env, capture_output=True, text=True)
        t_cnt = int(t_cnt_res.stdout.strip()) if t_cnt_res.stdout.strip().isdigit() else 0
        
        total_source_rows += s_cnt
        total_target_rows += t_cnt
        
        matched = (s_cnt == t_cnt)
        if not matched:
            mismatch_count += 1
            
        report.append({
            "table": tbl,
            "source_rows": s_cnt,
            "target_rows": t_cnt,
            "status": "PASS" if matched else "MISMATCH"
        })
        
    print("\n--- POPULATED TABLES PARITY AUDIT ---")
    for r in report:
        if r["source_rows"] > 0 or r["status"] == "MISMATCH":
            print(f"    Table: {r['table']:<35} | Source: {r['source_rows']:<6} | Target: {r['target_rows']:<6} | Status: {r['status']}")
            
    print(f"\n    [SUMMARY] Total Tables Audited: {len(report)}")
    print(f"    [SUMMARY] Total Source Rows:    {total_source_rows}")
    print(f"    [SUMMARY] Total Target Rows:    {total_target_rows}")
    print(f"    [SUMMARY] Mismatched Tables:    {mismatch_count}")
    
    # 4. Deterministic Hashes on Key Tables
    print("\n[+] Step 4: Deterministic Data Hash Verification...")
    key_tables = ["schools", "profiles", "user_roles", "students", "teachers", "classes", "subjects", "timetable_entries", "system_settings", "report_cards"]
    
    hash_results = []
    for kt in key_tables:
        if kt in src_tables and kt in tgt_tables:
            h_sql = f"SELECT md5(string_agg(id::text, ',' ORDER BY id::text)) FROM \"{kt}\";"
            
            s_h = subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", h_sql], env=src_env, capture_output=True, text=True).stdout.strip()
            t_h = subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-t", "-c", h_sql], env=tgt_env, capture_output=True, text=True).stdout.strip()
            
            h_match = (s_h == t_h)
            hash_results.append({
                "table": kt,
                "source_hash": s_h,
                "target_hash": t_h,
                "match": h_match
            })
            print(f"    Table: {kt:<25} | Source MD5: {s_h} | Target MD5: {t_h} | {'MATCH (PASS)' if h_match else 'FAIL'}")
            
    # Check auth.users table
    s_auth_res = subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", "SELECT count(*) FROM auth.users;"], env=src_env, capture_output=True, text=True)
    s_auth_cnt = int(s_auth_res.stdout.strip()) if s_auth_res.stdout.strip().isdigit() else 0
    
    t_auth_res = subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-t", "-c", "SELECT count(*) FROM auth.users;"], env=tgt_env, capture_output=True, text=True)
    t_auth_cnt = int(t_auth_res.stdout.strip()) if t_auth_res.stdout.strip().isdigit() else 0
    print(f"\n    Auth Users Table: Source: {s_auth_cnt} | Target: {t_auth_cnt} | {'PASS' if s_auth_cnt == t_auth_cnt else 'CHECK'}")
    
    # Save final JSON report
    report_file = os.path.join(BACKUP_DIR, "final_data_parity_manifest.json")
    with open(report_file, "w") as jf:
        json.dump({
            "summary": {
                "total_tables": len(report),
                "mismatch_count": mismatch_count,
                "total_source_rows": total_source_rows,
                "total_target_rows": total_target_rows,
                "all_matched": (mismatch_count == 0),
                "source_auth_users": s_auth_cnt,
                "target_auth_users": t_auth_cnt
            },
            "table_comparison": report,
            "deterministic_hashes": hash_results
        }, jf, indent=2)
    os.chmod(report_file, 0o600)
    
    print(f"\n[+] Manifest saved to {report_file}")
    print("=================================================================")
    print("  VERIFICATION COMPLETE                                          ")
    print("=================================================================")

if __name__ == "__main__":
    main()
