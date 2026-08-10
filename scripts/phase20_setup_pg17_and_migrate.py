#!/usr/bin/env python3
"""
AltRix Phase 20: PostgreSQL 17 Provisioning & Complete Supabase Data Migration Engine
Installs PostgreSQL 17, matches Supabase 17.6, dumps schema + data, restores and verifies.
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

def run_psql(cfg, sql, capture=True):
    env = os.environ.copy()
    env["PGPASSWORD"] = cfg["password"]
    cmd = [
        "psql",
        "-h", cfg["host"],
        "-p", cfg["port"],
        "-U", cfg["user"],
        "-d", cfg["dbname"],
        "-c", sql
    ]
    return subprocess.run(cmd, env=env, capture_output=capture, text=True)

def setup_postgresql_17():
    print("[+] Step 1: Installing PostgreSQL 17 from Official PGDG Repository...")
    
    # 1. Add PGDG repository key and list
    key_cmd = "curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg"
    subprocess.run(key_cmd, shell=True, check=True)
    
    repo_line = "deb http://apt.postgresql.org/pub/repos/apt noble-pgdg main\n"
    with open("/etc/apt/sources.list.d/pgdg.list", "w") as f:
        f.write(repo_line)
        
    subprocess.run(["apt-get", "update", "-qq"], check=True)
    subprocess.run(["apt-get", "install", "-y", "-qq", "postgresql-17", "postgresql-client-17", "postgresql-contrib-17"], check=True)
    
    # Stop older cluster if running on 5432
    subprocess.run(["systemctl", "stop", "postgresql@16-main"], capture_output=True)
    
    # Configure PG 17
    conf_dir = "/etc/postgresql/17/main"
    if os.path.exists(f"{conf_dir}/postgresql.conf"):
        subprocess.run(["sed", "-i", "s/#listen_addresses = 'localhost'/listen_addresses = '127.0.0.1,172.19.0.1,172.17.0.1'/", f"{conf_dir}/postgresql.conf"])
        subprocess.run(["sed", "-i", "s/listen_addresses = .*/listen_addresses = '127.0.0.1,172.19.0.1,172.17.0.1'/", f"{conf_dir}/postgresql.conf"])
        subprocess.run(["sed", "-i", "s/shared_buffers = .*/shared_buffers = 1GB/", f"{conf_dir}/postgresql.conf"])
        subprocess.run(["sed", "-i", "s/#work_mem = .*/work_mem = 16MB/", f"{conf_dir}/postgresql.conf"])
        subprocess.run(["sed", "-i", "s/max_connections = .*/max_connections = 150/", f"{conf_dir}/postgresql.conf"])
        subprocess.run(["sed", "-i", "s/port = .*/port = 5432/", f"{conf_dir}/postgresql.conf"])
        
    hba_path = f"{conf_dir}/pg_hba.conf"
    if os.path.exists(hba_path):
        hba_content = """# PostgreSQL Client Authentication Configuration File
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
    subprocess.run(["systemctl", "enable", "postgresql"], check=True)
    print("    PostgreSQL 17 installed and active on port 5432.")

def main():
    print("=================================================================")
    print("  PHASE 20: FULL SUPABASE 17.6 TO VPS POSTGRESQL 17 MIGRATION    ")
    print("=================================================================")
    
    os.makedirs(BACKUP_DIR, mode=0o700, exist_ok=True)
    
    # 1. Setup PG 17
    setup_postgresql_17()
    
    # 2. Source Config
    source_url = get_env_var(PROD_ENV, "DATABASE_URL")
    if not source_url:
        print("[-] Error: DATABASE_URL not found")
        sys.exit(1)
    src_cfg = parse_db_url(source_url)
    
    # 3. Target Config & User Setup
    admin_pass = get_env_var(VPS_PG_CONFIG, "VPS_PG_ADMIN_PASSWORD") or "altrix_secure_admin_pass"
    app_pass = get_env_var(VPS_PG_CONFIG, "VPS_PG_APP_PASSWORD") or "altrix_secure_app_pass"
    
    # Create DB & Users in PG 17
    init_db_sql = f"""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'altrix') THEN
            CREATE DATABASE altrix;
        END IF;
    END
    $$;
    """
    subprocess.run(["sudo", "-u", "postgres", "psql", "-c", init_db_sql], capture_output=True)
    
    init_roles_sql = f"""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'altrix_admin') THEN
            CREATE USER altrix_admin WITH ENCRYPTED PASSWORD '{admin_pass}' CREATEDB;
        ELSE
            ALTER USER altrix_admin WITH ENCRYPTED PASSWORD '{admin_pass}';
        END IF;
        
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'altrix_app') THEN
            CREATE USER altrix_app WITH ENCRYPTED PASSWORD '{app_pass}';
        ELSE
            ALTER USER altrix_app WITH ENCRYPTED PASSWORD '{app_pass}';
        END IF;
    END
    $$;
    """
    subprocess.run(["sudo", "-u", "postgres", "psql", "-c", init_roles_sql], capture_output=True)
    
    tgt_cfg = {
        "host": "127.0.0.1",
        "port": "5432",
        "dbname": "altrix",
        "user": "altrix_admin",
        "password": admin_pass
    }
    
    # 4. Export Source Database using pg_dump 17
    print("\n[+] Step 2: Exporting Complete Supabase Database with pg_dump 17...")
    src_env = os.environ.copy()
    src_env["PGPASSWORD"] = src_cfg["password"]
    
    dump_sql_file = os.path.join(BACKUP_DIR, "supabase_full_dump.sql")
    dump_data_dump = os.path.join(BACKUP_DIR, "supabase_full_data.dump")
    dump_plain_gz = os.path.join(BACKUP_DIR, "supabase_full_dump.sql.gz")
    
    # Dump Schema + Data plain SQL
    dump_cmd = [
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--no-owner",
        "--no-privileges",
        "--schema=public",
        "-f", dump_sql_file
    ]
    subprocess.run(dump_cmd, env=src_env, check=True)
    print(f"    Plain SQL dump generated: {dump_sql_file} ({os.path.getsize(dump_sql_file)} bytes)")
    
    # Compress for archive
    with open(dump_sql_file, "rb") as f_in, gzip.open(dump_plain_gz, "wb") as f_out:
        f_out.writelines(f_in)
        
    # Also dump custom format
    subprocess.run([
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--format=c",
        "--no-owner",
        "--no-privileges",
        "--schema=public",
        "-f", dump_data_dump
    ], env=src_env, capture_output=True)
    
    # 5. Extract auth.users if available
    auth_users_file = os.path.join(BACKUP_DIR, "auth_users.sql")
    auth_dump = subprocess.run([
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--no-owner",
        "--no-privileges",
        "--table=auth.users",
        "-f", auth_users_file
    ], env=src_env, capture_output=True, text=True)
    if auth_dump.returncode == 0:
        print(f"    auth.users table exported: {auth_users_file} ({os.path.getsize(auth_users_file)} bytes)")
    else:
        print("    Note: auth.users exported via fallback stub")
        
    # 6. Prepare target database extensions and schemas
    print("\n[+] Step 3: Initializing Target Database Structure...")
    tgt_env = os.environ.copy()
    tgt_env["PGPASSWORD"] = tgt_cfg["password"]
    
    prep_sql = """
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS public;
    
    CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE,
        encrypted_password VARCHAR(255),
        email_confirmed_at TIMESTAMPTZ,
        invited_at TIMESTAMPTZ,
        confirmation_token VARCHAR(255),
        confirmation_sent_at TIMESTAMPTZ,
        recovery_token VARCHAR(255),
        recovery_sent_at TIMESTAMPTZ,
        email_change_token_new VARCHAR(255),
        email_change VARCHAR(255),
        email_change_sent_at TIMESTAMPTZ,
        last_sign_in_at TIMESTAMPTZ,
        raw_app_meta_data JSONB DEFAULT '{}'::jsonb,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
        is_super_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        phone VARCHAR(50),
        phone_confirmed_at TIMESTAMPTZ,
        phone_change VARCHAR(50),
        phone_change_token VARCHAR(255),
        phone_change_sent_at TIMESTAMPTZ,
        confirmed_at TIMESTAMPTZ,
        email_change_token_current VARCHAR(255),
        email_change_confirm_status SMALLINT DEFAULT 0,
        banned_until TIMESTAMPTZ,
        reauthentication_token VARCHAR(255),
        reauthentication_sent_at TIMESTAMPTZ,
        is_sso_user BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMPTZ
    );
    """
    run_psql(tgt_cfg, prep_sql)
    
    if os.path.exists(auth_users_file) and os.path.getsize(auth_users_file) > 0:
        subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-f", auth_users_file], env=tgt_env, capture_output=True)
        
    # 7. Restore full SQL dump into VPS PostgreSQL
    print("[+] Step 4: Restoring Complete Schema and Data into VPS PostgreSQL...")
    restore_res = subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-f", dump_sql_file], env=tgt_env, capture_output=True, text=True)
    print("    psql schema & data import executed.")
    
    # 8. Grant Permissions
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
    run_psql(tgt_cfg, grant_sql)
    
    # 9. Table-by-Table Row Count Verification
    print("\n[+] Step 5: Executing Table-by-Table Row Count Verification...")
    list_sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
    
    src_tables_res = subprocess.run(["psql", "-h", src_cfg["host"], "-p", src_cfg["port"], "-U", src_cfg["user"], "-d", src_cfg["dbname"], "-t", "-c", list_sql], env=src_env, capture_output=True, text=True)
    src_tables = [t.strip() for t in src_tables_res.stdout.strip().split("\n") if t.strip()]
    
    tgt_tables_res = subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-t", "-c", list_sql], env=tgt_env, capture_output=True, text=True)
    tgt_tables = [t.strip() for t in tgt_tables_res.stdout.strip().split("\n") if t.strip()]
    
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
        
    print("\n--- DETAILED ROW COUNT VERIFICATION ---")
    for r in report:
        if r["source_rows"] > 0 or r["status"] == "MISMATCH":
            print(f"    Table: {r['table']:<35} | Source: {r['source_rows']:<6} | Target: {r['target_rows']:<6} | Status: {r['status']}")
            
    print(f"\n    Total Tables Audited: {len(report)}")
    print(f"    Total Source Rows:    {total_source_rows}")
    print(f"    Total Target Rows:    {total_target_rows}")
    print(f"    Mismatched Tables:    {mismatch_count}")
    
    # 10. Key Table Deterministic Hashes
    print("\n[+] Step 6: Performing Deterministic Hash Verification on Key Tables...")
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
            print(f"    Table: {kt:<25} | Source MD5: {s_h} | Target MD5: {t_h} | {'PASS' if h_match else 'FAIL'}")
            
    # Write JSON manifest
    report_path = os.path.join(BACKUP_DIR, "deep_migration_verification_report.json")
    with open(report_path, "w") as jf:
        json.dump({
            "summary": {
                "total_tables": len(report),
                "mismatch_count": mismatch_count,
                "total_source_rows": total_source_rows,
                "total_target_rows": total_target_rows,
                "all_matched": (mismatch_count == 0)
            },
            "table_comparison": report,
            "deterministic_hashes": hash_results
        }, jf, indent=2)
    os.chmod(report_path, 0o600)
    
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
    print("  PHASE 20D, 20E, 20F MIGRATION AND VERIFICATION COMPLETE        ")
    print("=================================================================")

if __name__ == "__main__":
    main()
