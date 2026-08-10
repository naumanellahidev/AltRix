#!/usr/bin/env python3
"""
AltRix Phase 20: Auth Users & Complete 100% Data Synchronization Engine
Dumps auth.users and all tables from Supabase, restores into PostgreSQL 17, and achieves 100% row match.
"""

import os
import sys
import json
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
    source_url = get_env_var(PROD_ENV, "DATABASE_URL")
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
    
    print("=================================================================")
    print("  PHASE 20: AUTH USERS & 100% DATA SYNC ENGINE                   ")
    print("=================================================================")
    
    # 1. Dump auth.users from Supabase
    print("[+] Step 1: Exporting auth.users from Supabase...")
    auth_dump_file = "/tmp/auth_users_export.sql"
    subprocess.run([
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--no-owner",
        "--no-privileges",
        "--table=auth.users",
        "--data-only",
        "-f", auth_dump_file
    ], env=src_env, check=True)
    
    # Restore auth.users into target
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-f", auth_dump_file], env=tgt_env, capture_output=True)
    if os.path.exists(auth_dump_file):
        os.remove(auth_dump_file)
        
    # 2. Dump remaining specific tables
    print("[+] Step 2: Exporting remaining tables...")
    for tbl in ["fee_voucher_batches", "fee_voucher_deliveries", "finance_expenses"]:
        t_file = f"/tmp/{tbl}_data.sql"
        subprocess.run([
            "pg_dump",
            "-h", src_cfg["host"],
            "-p", src_cfg["port"],
            "-U", src_cfg["user"],
            "-d", src_cfg["dbname"],
            "--no-owner",
            "--no-privileges",
            "--table=public." + tbl,
            "--data-only",
            "-f", t_file
        ], env=src_env, check=True)
        
        subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-f", t_file], env=tgt_env, capture_output=True)
        if os.path.exists(t_file):
            os.remove(t_file)
            
    # 3. Grant Permissions
    grant_sql = """
    GRANT ALL ON SCHEMA public TO altrix_admin;
    GRANT ALL ON SCHEMA auth TO altrix_admin;
    GRANT USAGE, CREATE ON SCHEMA public TO altrix_app;
    GRANT USAGE ON SCHEMA auth TO altrix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO altrix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO altrix_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO altrix_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA auth TO altrix_app;
    """
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", grant_sql], env=tgt_env, capture_output=True)
    
    # 4. Verify auth.users
    s_auth_cnt = int(subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", "SELECT count(*) FROM auth.users;"], env=src_env, capture_output=True, text=True).stdout.strip() or 0)
    t_auth_cnt = int(subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-t", "-c", "SELECT count(*) FROM auth.users;"], env=tgt_env, capture_output=True, text=True).stdout.strip() or 0)
    print(f"\n[+] Auth Users Table Parity: Source={s_auth_cnt} | Target={t_auth_cnt} | {'100% MATCH (PASS)' if s_auth_cnt == t_auth_cnt else 'CHECK'}")
    
    # 5. Full audit of populated tables
    list_sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
    src_tables_res = subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", list_sql], env=src_env, capture_output=True, text=True)
    src_tables = [t.strip() for t in src_tables_res.stdout.strip().split("\n") if t.strip()]
    
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
        
    print(f"\n[+] Total Public Tables Audited: {len(report)}")
    print(f"[+] Total Source Public Rows:  {total_source_rows}")
    print(f"[+] Total Target Public Rows:  {total_target_rows}")
    print(f"[+] Mismatched Tables:         {mismatch_count}")
    
    print("\n--- ALL POPULATED PRODUCTION TABLES ---")
    for r in report:
        if r["source_rows"] > 0 or r["status"] == "MISMATCH":
            print(f"    Table: {r['table']:<35} | Source: {r['source_rows']:<5} | Target: {r['target_rows']:<5} | Status: {r['status']}")
            
    # Deterministic MD5 Checksums on key tables
    print("\n[+] Deterministic Primary-Key Row Hashes:")
    key_tables = ["schools", "profiles", "user_roles", "students", "teachers", "classes", "subjects", "timetable_entries", "fee_invoices", "fee_voucher_batches", "finance_expenses", "report_cards"]
    hash_list = []
    for kt in key_tables:
        if kt in src_tables:
            h_sql = f"SELECT md5(string_agg(id::text, ',' ORDER BY id::text)) FROM \"{kt}\";"
            s_h = subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", h_sql], env=src_env, capture_output=True, text=True).stdout.strip()
            t_h = subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-t", "-c", h_sql], env=tgt_env, capture_output=True, text=True).stdout.strip()
            match = (s_h == t_h)
            hash_list.append({"table": kt, "source_hash": s_h, "target_hash": t_h, "match": match})
            print(f"    Table: {kt:<26} | MD5: {s_h} | {'100% MATCH (PASS)' if match else 'MISMATCH'}")
            
    # Save final manifest
    manifest_file = os.path.join(BACKUP_DIR, "final_data_parity_manifest.json")
    with open(manifest_file, "w") as f:
        json.dump({
            "summary": {
                "total_tables": len(report),
                "total_source_rows": total_source_rows,
                "total_target_rows": total_target_rows,
                "mismatch_count": mismatch_count,
                "parity_percentage": 100.0 if mismatch_count == 0 else round((len(report) - mismatch_count) / len(report) * 100, 2),
                "source_auth_users": s_auth_cnt,
                "target_auth_users": t_auth_cnt,
                "auth_users_match": (s_auth_cnt == t_auth_cnt)
            },
            "table_comparison": report,
            "deterministic_hashes": hash_list
        }, f, indent=2)
    os.chmod(manifest_file, 0o600)
    print(f"\n[+] Master Parity Manifest written to {manifest_file}")

if __name__ == "__main__":
    main()
