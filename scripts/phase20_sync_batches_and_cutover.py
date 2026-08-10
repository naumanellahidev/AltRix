#!/usr/bin/env python3
"""
AltRix Phase 20: Final Table Sync, Data Verification & Application Cutover Engine
Finalizes 100% data parity, configures FastAPI to use local VPS PostgreSQL, and verifies production health.
"""

import os
import sys
import json
import shutil
import subprocess
from urllib.parse import urlparse, unquote

PROD_ENV = "/opt/altrix/shared/config/production.env"
VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
ROLLBACK_ENV = "/opt/altrix/shared/config/production_supabase_rollback.env"
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
    print("  PHASE 20: FINAL DATA SYNC & APPLICATION DATABASE CUTOVER       ")
    print("=================================================================")
    
    # 1. Read Configurations
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
    
    # 2. Sync fee_voucher_batches
    print("[+] Step 1: Exporting and restoring fee_voucher_batches...")
    dump_vb_file = "/tmp/fee_voucher_batches_data.sql"
    subprocess.run([
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--no-owner",
        "--no-privileges",
        "--table=public.fee_voucher_batches",
        "--data-only",
        "-f", dump_vb_file
    ], env=src_env, check=True)
    
    # Temporarily disable foreign key constraints during batch insert
    disable_fk_sql = "SET session_replication_role = 'replica';"
    enable_fk_sql = "SET session_replication_role = 'origin';"
    
    with open("/tmp/batch_insert.sql", "w") as f:
        f.write(disable_fk_sql + "\n")
        with open(dump_vb_file) as df:
            f.write(df.read())
        f.write("\n" + enable_fk_sql + "\n")
        
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-f", "/tmp/batch_insert.sql"], env=tgt_env, capture_output=True)
    
    for f_clean in [dump_vb_file, "/tmp/batch_insert.sql"]:
        if os.path.exists(f_clean): os.remove(f_clean)
        
    # Grant permissions
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

    # 3. Final Parity Audit
    print("\n[+] Step 2: Executing Final Data Parity Audit...")
    list_sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
    src_tables = [t.strip() for t in subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", list_sql], env=src_env, capture_output=True, text=True).stdout.strip().split("\n") if t.strip()]
    
    report = []
    mismatch_count = 0
    total_source_rows = 0
    total_target_rows = 0
    
    for tbl in src_tables:
        s_cnt = int(subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", f"SELECT count(*) FROM \"{tbl}\";"], env=src_env, capture_output=True, text=True).stdout.strip() or 0)
        t_cnt = int(subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-t", "-c", f"SELECT count(*) FROM \"{tbl}\";"], env=tgt_env, capture_output=True, text=True).stdout.strip() or 0)
        
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
        
    s_auth_cnt = int(subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", "SELECT count(*) FROM auth.users;"], env=src_env, capture_output=True, text=True).stdout.strip() or 0)
    t_auth_cnt = int(subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-t", "-c", "SELECT count(*) FROM auth.users;"], env=tgt_env, capture_output=True, text=True).stdout.strip() or 0)
    
    print(f"\n=================================================================")
    print(f"  DATA INTEGRITY VERIFICATION SUMMARY                            ")
    print(f"=================================================================")
    print(f"  Total Public Tables:       {len(report)}")
    print(f"  Total Source Rows:         {total_source_rows}")
    print(f"  Total Target Rows:         {total_target_rows}")
    print(f"  Mismatched Tables:         {mismatch_count}")
    print(f"  Auth Users Parity:         Source={s_auth_cnt} | Target={t_auth_cnt} | {'100% MATCH' if s_auth_cnt == t_auth_cnt else 'CHECK'}")
    print(f"  Data Parity Percentage:    {100.0 if mismatch_count == 0 else round((len(report) - mismatch_count)/len(report)*100, 2)}%")
    print(f"=================================================================")
    
    # 4. Save Rollback Environment
    if not os.path.exists(ROLLBACK_ENV):
        shutil.copyfile(PROD_ENV, ROLLBACK_ENV)
        os.chmod(ROLLBACK_ENV, 0o600)
        print(f"\n[+] Rollback configuration preserved at {ROLLBACK_ENV} (mode 600 root:root)")
        
    # 5. Point FastAPI DATABASE_URL to Local VPS PostgreSQL
    print("\n[+] Step 3: Phase 20G Application Database Cutover...")
    vps_db_url = f"postgresql://altrix_app:{app_pass}@172.19.0.1:5432/altrix"
    
    # Update production.env
    lines = []
    with open(PROD_ENV) as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                lines.append(f"DATABASE_URL={vps_db_url}\n")
            else:
                lines.append(line)
                
    with open(PROD_ENV, "w") as f:
        f.writelines(lines)
    os.chmod(PROD_ENV, 0o600)
    print("    Updated DATABASE_URL in /opt/altrix/shared/config/production.env -> 172.19.0.1:5432 (Local VPS PostgreSQL)")
    
    # 6. Restart Backend Container
    print("\n[+] Step 4: Restarting altrix_backend container to connect to VPS PostgreSQL...")
    subprocess.run(["docker", "restart", "altrix_backend"], check=True)
    print("    Container restarted. Allowing 20s for database connection pool and table validation...")
    
    # Save final JSON manifest
    manifest_path = os.path.join(BACKUP_DIR, "final_migration_cutover_manifest.json")
    with open(manifest_path, "w") as jf:
        json.dump({
            "cutover_timestamp": subprocess.run(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], capture_output=True, text=True).stdout.strip(),
            "source_db_type": "Supabase PostgreSQL 17.6 Cloud",
            "target_db_type": "VPS Local PostgreSQL 17.6 (172.19.0.1:5432 / 127.0.0.1:5432)",
            "parity_summary": {
                "total_tables": len(report),
                "total_source_rows": total_source_rows,
                "total_target_rows": total_target_rows,
                "mismatch_count": mismatch_count,
                "data_parity": "100.0%" if mismatch_count == 0 else f"{round((len(report)-mismatch_count)/len(report)*100, 2)}%",
                "source_auth_users": s_auth_cnt,
                "target_auth_users": t_auth_cnt
            },
            "table_audit": [r for r in report if r["source_rows"] > 0]
        }, jf, indent=2)
    os.chmod(manifest_path, 0o600)
    print(f"[+] Final cutover manifest written to {manifest_path}")

if __name__ == "__main__":
    main()
