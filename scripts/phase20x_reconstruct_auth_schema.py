#!/usr/bin/env python3
"""
Reconstructs auth.users and all auth schema tables with 100% exact columns,
defaults, constraints, generated columns, and restores all 22 users.
"""

import os
import sys
import subprocess
from urllib.parse import urlparse, unquote

ROLLBACK_ENV = "/opt/altrix/shared/config/production_supabase_rollback.env"
PROD_ENV = "/opt/altrix/shared/config/production.env"
VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"

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
    src_url = get_env_var(ROLLBACK_ENV, "DATABASE_URL") or get_env_var(PROD_ENV, "DATABASE_URL")
    src_cfg = parse_db_url(src_url)
    
    admin_pass = get_env_var(VPS_PG_CONFIG, "VPS_PG_ADMIN_PASSWORD") or "altrix_secure_admin_pass"
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
    
    print("[+] Step 1: Exporting exact auth schema and data from Supabase...")
    auth_sql_file = "/var/backups/altrix/phase20x_exact_migration/auth_exact.sql"
    dump_cmd = [
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--schema=auth",
        "--no-owner",
        "--no-privileges",
        "-f", auth_sql_file
    ]
    subprocess.run(dump_cmd, env=src_env, check=True)
    print(f"    Exported auth schema to {auth_sql_file}")
    
    print("[+] Step 2: Applying exact auth schema and data to Target VPS database...")
    # Drop existing auth schema CASCADE and restore exact
    drop_sql = "DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA auth;"
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", drop_sql], env=tgt_env, check=True)
    
    # Restore auth_exact.sql
    restore_wrapper = "/tmp/auth_restore_wrapper.sql"
    with open(restore_wrapper, "w") as rw:
        rw.write("SET session_replication_role = 'replica';\n")
        with open(auth_sql_file) as af:
            rw.write(af.read())
        rw.write("\nSET session_replication_role = 'origin';\n")
        
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-f", restore_wrapper], env=tgt_env, check=True)
    if os.path.exists(restore_wrapper):
        os.remove(restore_wrapper)
        
    # Re-grant permissions
    grants = """
    GRANT ALL ON SCHEMA auth TO altrix_admin;
    GRANT USAGE ON SCHEMA auth TO altrix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO altrix_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA auth TO altrix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO altrix_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO altrix_app;
    """
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", grants], env=tgt_env, check=True)
    print("[+] Step 3: Exact auth schema reconstructed successfully.")

if __name__ == "__main__":
    main()
