#!/usr/bin/env python3
"""
AltRix Phase 20: Specific Table Importer & Final Parity Verifier
Imports any remaining tables and validates 100% table and row match.
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
    
    mismatch_tables = ["fee_voucher_batches", "fee_voucher_deliveries", "finance_expenses"]
    
    print("[+] Re-importing specific tables:", mismatch_tables)
    
    for tbl in mismatch_tables:
        dump_file = f"/tmp/{tbl}.sql"
        # Dump table data and schema
        subprocess.run([
            "pg_dump",
            "-h", src_cfg["host"],
            "-p", src_cfg["port"],
            "-U", src_cfg["user"],
            "-d", src_cfg["dbname"],
            "--no-owner",
            "--no-privileges",
            "-t", f"public.{tbl}",
            "-f", dump_file
        ], env=src_env, check=True)
        
        # Restore into target
        subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-f", dump_file], env=tgt_env, capture_output=True)
        
        if os.path.exists(dump_file):
            os.remove(dump_file)
            
    # Grant permissions
    grant_sql = """
    GRANT ALL ON SCHEMA public TO altrix_admin;
    GRANT USAGE, CREATE ON SCHEMA public TO altrix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO altrix_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO altrix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO altrix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO altrix_app;
    """
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", grant_sql], env=tgt_env, capture_output=True)
    
    # Audit all tables again
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
        
    print(f"\n[FINAL AUDIT RESULTS]")
    print(f"Total Tables Audited: {len(report)}")
    print(f"Total Source Rows:    {total_source_rows}")
    print(f"Total Target Rows:    {total_target_rows}")
    print(f"Mismatched Tables:    {mismatch_count}")
    
    for r in report:
        if r["source_rows"] > 0:
            print(f"    Table: {r['table']:<35} | Source: {r['source_rows']:<5} | Target: {r['target_rows']:<5} | {r['status']}")
            
    # Write final manifest
    manifest_path = os.path.join(BACKUP_DIR, "final_data_parity_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump({
            "summary": {
                "total_tables": len(report),
                "total_source_rows": total_source_rows,
                "total_target_rows": total_target_rows,
                "mismatch_count": mismatch_count,
                "parity_percentage": 100.0 if mismatch_count == 0 else round((len(report) - mismatch_count) / len(report) * 100, 2)
            },
            "table_results": report
        }, f, indent=2)
    os.chmod(manifest_path, 0o600)
    print(f"[+] Final parity manifest saved to {manifest_path}")

if __name__ == "__main__":
    main()
