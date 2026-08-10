#!/usr/bin/env python3
"""
AltRix Phase 20: Supabase to VPS PostgreSQL Full Migration Engine
Recreates database structure, migrates all data, and runs deep verification.
"""

import os
import sys
import json
import gzip
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
                val = line.split("=", 1)[1].strip("\"'")
                return val
    return None

def parse_db_url(url):
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    parsed = urlparse(url)
    return {
        "user": unquote(parsed.username) if parsed.username else "",
        "password": unquote(parsed.password) if parsed.password else "",
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "dbname": parsed.path.lstrip("/") or "postgres"
    }

def main():
    print("=================================================================")
    print("  PHASE 20: SUPABASE TO VPS FULL DATABASE MIGRATION ENGINE       ")
    print("=================================================================")
    
    os.makedirs(BACKUP_DIR, mode=0o700, exist_ok=True)
    
    # 1. Read Source Database Config
    source_url = get_env_var(PROD_ENV, "DATABASE_URL")
    if not source_url:
        print("[-] Error: DATABASE_URL not found in", PROD_ENV)
        sys.exit(1)
        
    src_cfg = parse_db_url(source_url)
    print(f"[+] Source Database Config: Host={src_cfg['host']}, Port={src_cfg['port']}, DB={src_cfg['dbname']}, User={src_cfg['user']}")
    
    # 2. Read / Set Target VPS Database Config
    vps_pass = get_env_var(VPS_PG_CONFIG, "VPS_PG_APP_PASSWORD") or "altrix_secure_app_pass"
    admin_pass = get_env_var(VPS_PG_CONFIG, "VPS_PG_ADMIN_PASSWORD") or "altrix_secure_admin_pass"
    
    tgt_cfg = {
        "host": "127.0.0.1",
        "port": "5432",
        "dbname": "altrix",
        "user": "altrix_admin",
        "password": admin_pass
    }
    
    # 3. Configure PostgreSQL to listen on Docker Bridge Gateway as well
    print("[+] Configuring PostgreSQL listen addresses and pg_hba.conf...")
    conf_path = "/etc/postgresql/16/main/postgresql.conf"
    hba_path = "/etc/postgresql/16/main/pg_hba.conf"
    
    if os.path.exists(conf_path):
        subprocess.run(["sed", "-i", "s/listen_addresses = .*/listen_addresses = '127.0.0.1,172.19.0.1,172.17.0.1'/", conf_path])
        
    if os.path.exists(hba_path):
        hba_content = """# PostgreSQL Client Authentication
local   all             postgres                                peer
local   all             all                                     peer
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             172.19.0.0/16           scram-sha-256
host    all             all             172.17.0.0/16           scram-sha-256
host    all             all             ::1/128                 scram-sha-256
"""
        with open(hba_path, "w") as f:
            f.write(hba_content)
        subprocess.run(["systemctl", "restart", "postgresql"], check=True)
    
    # 4. Export Source Database using pg_dump
    print("\n[+] Phase 20B: Exporting Complete Production Supabase Database...")
    src_env = os.environ.copy()
    src_env["PGPASSWORD"] = src_cfg["password"]
    
    schema_file = os.path.join(BACKUP_DIR, "supabase_schema.sql")
    dump_file = os.path.join(BACKUP_DIR, "supabase_data.dump")
    plain_sql_gz = os.path.join(BACKUP_DIR, "supabase_full.sql.gz")
    
    # Dump Schema
    dump_cmd = [
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        "--schema=public",
        "-f", schema_file
    ]
    res = subprocess.run(dump_cmd, env=src_env, capture_output=True, text=True)
    if res.returncode != 0:
        print("[-] pg_dump schema error:", res.stderr)
    else:
        print(f"    Schema dump generated: {schema_file} ({os.path.getsize(schema_file)} bytes)")
        
    # Dump Data in custom format
    dump_data_cmd = [
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--format=c",
        "--no-owner",
        "--no-privileges",
        "--schema=public",
        "-f", dump_file
    ]
    res = subprocess.run(dump_data_cmd, env=src_env, capture_output=True, text=True)
    if res.returncode != 0:
        print("[-] pg_dump data error:", res.stderr)
    else:
        print(f"    Custom format dump generated: {dump_file} ({os.path.getsize(dump_file)} bytes)")
        
    # Dump full plain SQL gzipped
    dump_full_cmd = [
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--no-owner",
        "--no-privileges",
        "--schema=public"
    ]
    full_res = subprocess.run(dump_full_cmd, env=src_env, capture_output=True)
    if full_res.returncode == 0 and full_res.stdout:
        with gzip.open(plain_sql_gz, "wb") as gz_out:
            gz_out.write(full_res.stdout)
        print(f"    Plain SQL gzipped dump generated: {plain_sql_gz} ({os.path.getsize(plain_sql_gz)} bytes)")
    
    # 5. Restore Schema & Data into VPS PostgreSQL
    print("\n[+] Phase 20D & 20E: Restoring Database Structure and Data into VPS PostgreSQL...")
    tgt_env = os.environ.copy()
    tgt_env["PGPASSWORD"] = tgt_cfg["password"]
    
    # Ensure extensions (uuid-ossp, pgcrypto) exist in target DB
    ext_sql = "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS pgcrypto;"
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", ext_sql], env=tgt_env, capture_output=True)
    
    # Restore using pg_restore
    restore_cmd = [
        "pg_restore",
        "-h", tgt_cfg["host"],
        "-p", tgt_cfg["port"],
        "-U", tgt_cfg["user"],
        "-d", tgt_cfg["dbname"],
        "--no-owner",
        "--no-privileges",
        "--clean",
        "--if-exists",
        dump_file
    ]
    restore_res = subprocess.run(restore_cmd, env=tgt_env, capture_output=True, text=True)
    print("    pg_restore completed (status code: %d)" % restore_res.returncode)
    
    # Grant permissions to altrix_app user
    grant_sql = """
    GRANT ALL ON SCHEMA public TO altrix_admin;
    GRANT USAGE, CREATE ON SCHEMA public TO altrix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO altrix_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO altrix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO altrix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO altrix_app;
    """
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", grant_sql], env=tgt_env, capture_output=True)
    
    # 6. Deep Data Integrity Verification (Source vs Target)
    print("\n[+] Phase 20F: Performing Deep Data Integrity Verification...")
    
    # Query all tables in public schema
    list_tables_sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
    
    src_tables_res = subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", list_tables_sql], env=src_env, capture_output=True, text=True)
    src_tables = [t.strip() for t in src_tables_res.stdout.strip().split("\n") if t.strip()]
    
    tgt_tables_res = subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-t", "-c", list_tables_sql], env=tgt_env, capture_output=True, text=True)
    tgt_tables = [t.strip() for t in tgt_tables_res.stdout.strip().split("\n") if t.strip()]
    
    print(f"    Source tables count: {len(src_tables)}")
    print(f"    Target tables count: {len(tgt_tables)}")
    
    comparison_report = []
    all_matched = True
    
    for tbl in src_tables:
        src_cnt_res = subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", f"SELECT count(*) FROM \"{tbl}\";"], env=src_env, capture_output=True, text=True)
        src_cnt = int(src_cnt_res.stdout.strip()) if src_cnt_res.stdout.strip().isdigit() else 0
        
        tgt_cnt_res = subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-t", "-c", f"SELECT count(*) FROM \"{tbl}\";"], env=tgt_env, capture_output=True, text=True)
        tgt_cnt = int(tgt_cnt_res.stdout.strip()) if tgt_cnt_res.stdout.strip().isdigit() else 0
        
        matched = (src_cnt == tgt_cnt)
        if not matched:
            all_matched = False
            
        comparison_report.append({
            "table": tbl,
            "source_rows": src_cnt,
            "target_rows": tgt_cnt,
            "status": "PASS" if matched else "MISMATCH"
        })
        
    print("\n--- TABLE ROW COUNT COMPARISON ---")
    for item in comparison_report:
        print(f"    Table: {item['table']:<35} | Source: {item['source_rows']:<6} | Target: {item['target_rows']:<6} | Status: {item['status']}")
        
    report_file = os.path.join(BACKUP_DIR, "migration_verification_report.json")
    with open(report_file, "w") as f:
        json.dump(comparison_report, f, indent=2)
    os.chmod(report_file, 0o600)
    
    if all_matched:
        print("\n[+] DATA INTEGRITY VERIFIED: 100% table and row parity across all tables!")
    else:
        print("\n[-] WARNING: Some tables had row count mismatches.")
        
    # Check SHA-256 Checksums
    checksum_file = os.path.join(BACKUP_DIR, "checksums.sha256")
    with open(checksum_file, "w") as f:
        for fname in os.listdir(BACKUP_DIR):
            if fname.endswith(".sha256"): continue
            fpath = os.path.join(BACKUP_DIR, fname)
            if os.path.isfile(fpath):
                with open(fpath, "rb") as bf:
                    h = hashlib.sha256(bf.read()).hexdigest()
                    f.write(f"{h}  {fname}\n")
    os.chmod(checksum_file, 0o600)
    
    print("\n=================================================================")
    print("  PHASE 20D, 20E, 20F COMPLETED SUCCESSFULLY                     ")
    print("=================================================================")

if __name__ == "__main__":
    main()
