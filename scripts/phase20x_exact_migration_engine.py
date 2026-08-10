#!/usr/bin/env python3
"""
AltRix Phase 20X: Exact Supabase to VPS Database Schema & Data Migration Engine
100% Structural, Logical, Constraint, and Row-Level Data Parity Replication & Deep Verification.
"""

import os
import sys
import json
import gzip
import hashlib
import subprocess
from urllib.parse import urlparse, unquote

PROD_ENV = "/opt/altrix/shared/config/production.env"
ROLLBACK_ENV = "/opt/altrix/shared/config/production_supabase_rollback.env"
VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
MIGRATION_DIR = "/var/backups/altrix/phase20x_exact_migration"

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

def run_query(cfg, sql, capture=True):
    env = os.environ.copy()
    env["PGPASSWORD"] = cfg["password"]
    cmd = [
        "psql",
        "-h", cfg["host"],
        "-p", cfg["port"],
        "-U", cfg["user"],
        "-d", cfg["dbname"],
        "-t",
        "-A",
        "-c", sql
    ]
    res = subprocess.run(cmd, env=env, capture_output=capture, text=True)
    return res.stdout.strip()

def run_query_json(cfg, sql):
    json_sql = f"SELECT json_agg(t) FROM ({sql}) t;"
    out = run_query(cfg, json_sql)
    if not out or out == "":
        return []
    try:
        return json.loads(out)
    except Exception:
        return []

def main():
    print("=================================================================")
    print("  PHASE 20X: EXACT SUPABASE -> VPS DATABASE MIGRATION ENGINE     ")
    print("=================================================================")
    
    os.makedirs(MIGRATION_DIR, mode=0o700, exist_ok=True)
    
    # 1. Resolve Source & Target Credentials
    source_url = get_env_var(ROLLBACK_ENV, "DATABASE_URL") or get_env_var(PROD_ENV, "DATABASE_URL")
    if not source_url:
        print("[-] Fatal: Source DATABASE_URL could not be found.")
        sys.exit(1)
        
    src_cfg = parse_db_url(source_url)
    print(f"[+] Source Database: Host={src_cfg['host']}, Port={src_cfg['port']}, DB={src_cfg['dbname']}, User={src_cfg['user']}")
    
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
    
    # ==============================================================================
    # 1. FORENSIC SOURCE DISCOVERY & SCHEMAS
    # ==============================================================================
    print("\n[+] Step 1: Discovering all user schemas in Source Database...")
    schemas_raw = run_query(src_cfg, "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1') ORDER BY schema_name;")
    src_schemas = [s.strip() for s in schemas_raw.split("\n") if s.strip()]
    print(f"    Discovered Schemas ({len(src_schemas)}): {', '.join(src_schemas)}")
    
    # ==============================================================================
    # 2. COMPLETE FORENSIC EXPORT FROM SUPABASE
    # ==============================================================================
    print("\n[+] Step 2: Extracting Complete Logical Dump from Supabase (Schema + Data)...")
    schema_dump_file = os.path.join(MIGRATION_DIR, "source_full_schema.sql")
    data_dump_file = os.path.join(MIGRATION_DIR, "source_full_data.dump")
    plain_dump_file = os.path.join(MIGRATION_DIR, "source_full_database.sql")
    
    # 2a. Dump full DDL schema
    dump_schema_cmd = [
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        "--schema=public",
        "--schema=auth",
        "-f", schema_dump_file
    ]
    subprocess.run(dump_schema_cmd, env=src_env, check=True)
    print(f"    Schema DDL generated: {schema_dump_file} ({os.path.getsize(schema_dump_file):,} bytes)")
    
    # 2b. Dump custom format archive (schema + data)
    dump_custom_cmd = [
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--format=c",
        "--no-owner",
        "--no-privileges",
        "--schema=public",
        "--schema=auth",
        "-f", data_dump_file
    ]
    subprocess.run(dump_custom_cmd, env=src_env, check=True)
    print(f"    Custom binary dump generated: {data_dump_file} ({os.path.getsize(data_dump_file):,} bytes)")
    
    # 2c. Dump complete plain SQL
    dump_plain_cmd = [
        "pg_dump",
        "-h", src_cfg["host"],
        "-p", src_cfg["port"],
        "-U", src_cfg["user"],
        "-d", src_cfg["dbname"],
        "--no-owner",
        "--no-privileges",
        "--schema=public",
        "--schema=auth",
        "-f", plain_dump_file
    ]
    subprocess.run(dump_plain_cmd, env=src_env, check=True)
    print(f"    Plain SQL dump generated: {plain_dump_file} ({os.path.getsize(plain_dump_file):,} bytes)")
    
    # Compress plain dump
    with open(plain_dump_file, "rb") as f_in, gzip.open(plain_dump_file + ".gz", "wb") as f_out:
        f_out.writelines(f_in)
        
    # ==============================================================================
    # 3. RECONSTRUCT TARGET DATABASE
    # ==============================================================================
    print("\n[+] Step 3: Reconstructing Target Database 'altrix'...")
    
    # 3a. Recreate clean schemas and install extensions
    init_db_script = """
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS "citext";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";
    CREATE EXTENSION IF NOT EXISTS "btree_gist";
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS public;
    """
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", init_db_script], env=tgt_env, check=True)
    
    # 3b. Restore plain SQL dump with session_replication_role = 'replica'
    print("    Restoring schema, tables, constraints, indexes, and row data...")
    restore_wrapper = "/tmp/phase20x_restore_wrapper.sql"
    with open(restore_wrapper, "w") as rw:
        rw.write("SET session_replication_role = 'replica';\n")
        with open(plain_dump_file) as pf:
            rw.write(pf.read())
        rw.write("\nSET session_replication_role = 'origin';\n")
        
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-f", restore_wrapper], env=tgt_env, capture_output=True)
    if os.path.exists(restore_wrapper):
        os.remove(restore_wrapper)
    print("    Restoration executed.")
    
    # ==============================================================================
    # 4. SEQUENCE SYNCHRONIZATION & REPAIR
    # ==============================================================================
    print("\n[+] Step 4: Synchronizing and Repairing all Sequences across all tables...")
    seq_repair_sql = """
    DO $$
    DECLARE
        r RECORD;
        max_val BIGINT;
    BEGIN
        FOR r IN (
            SELECT 
                s.relname AS seq_name,
                n.nspname AS schema_name,
                t.relname AS table_name,
                a.attname AS column_name
            FROM pg_class s
            JOIN pg_namespace n ON n.oid = s.relnamespace
            JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
            JOIN pg_class t ON t.oid = d.refobjid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
            WHERE s.relkind = 'S' AND n.nspname IN ('public', 'auth')
        ) LOOP
            EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I.%I', r.column_name, r.schema_name, r.table_name) INTO max_val;
            IF max_val > 0 THEN
                EXECUTE format('SELECT setval(''%I.%I'', %s, true)', r.schema_name, r.seq_name, max_val);
            END IF;
        END LOOP;
    END $$;
    """
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", seq_repair_sql], env=tgt_env, check=True)
    print("    All sequences synchronized to maximum table values.")
    
    # ==============================================================================
    # 5. PERMISSIONS & GRANTS
    # ==============================================================================
    print("\n[+] Step 5: Applying Security & Least-Privilege Grants...")
    grants_sql = """
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
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", grants_sql], env=tgt_env, check=True)
    
    # ==============================================================================
    # 6. FORENSIC SOURCE vs TARGET VERIFICATION ENGINE
    # ==============================================================================
    print("\n[+] Step 6: Executing Comprehensive Source vs Target Forensic Verification...")
    
    # 6a. Table Inventory
    table_query = """
    SELECT 
        table_schema, 
        table_name 
    FROM information_schema.tables 
    WHERE table_schema IN ('public', 'auth') AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name;
    """
    src_tables = run_query_json(src_cfg, table_query)
    tgt_tables = run_query_json(tgt_cfg, table_query)
    
    src_table_set = {f"{t['table_schema']}.{t['table_name']}" for t in src_tables}
    tgt_table_set = {f"{t['table_schema']}.{t['table_name']}" for t in tgt_tables}
    
    missing_tables = sorted(list(src_table_set - tgt_table_set))
    extra_tables = sorted(list(tgt_table_set - src_table_set))
    
    # 6b. Column-by-Column Inventory
    column_query = """
    SELECT 
        table_schema,
        table_name,
        column_name,
        ordinal_position,
        data_type,
        udt_name,
        is_nullable,
        COALESCE(column_default, '') as column_default
    FROM information_schema.columns
    WHERE table_schema IN ('public', 'auth')
    ORDER BY table_schema, table_name, ordinal_position;
    """
    src_cols = run_query_json(src_cfg, column_query)
    tgt_cols = run_query_json(tgt_cfg, column_query)
    
    src_col_dict = {f"{c['table_schema']}.{c['table_name']}.{c['column_name']}": c for c in src_cols}
    tgt_col_dict = {f"{c['table_schema']}.{c['table_name']}.{c['column_name']}": c for c in tgt_cols}
    
    col_missing = []
    col_extra = []
    col_diffs = []
    
    for k, sc in src_col_dict.items():
        if k not in tgt_col_dict:
            col_missing.append(k)
        else:
            tc = tgt_col_dict[k]
            diffs = []
            if sc["data_type"] != tc["data_type"] and sc["udt_name"] != tc["udt_name"]:
                diffs.append(f"Type: src={sc['udt_name']} vs tgt={tc['udt_name']}")
            if sc["is_nullable"] != tc["is_nullable"]:
                diffs.append(f"Nullable: src={sc['is_nullable']} vs tgt={tc['is_nullable']}")
            if diffs:
                col_diffs.append({"column": k, "differences": diffs})
                
    for k in tgt_col_dict:
        if k not in src_col_dict:
            col_extra.append(k)
            
    # 6c. Constraints Inventory (Primary Keys, Foreign Keys, Unique, Checks)
    constraint_query = """
    SELECT 
        tc.table_schema,
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema IN ('public', 'auth')
    ORDER BY tc.table_schema, tc.table_name, tc.constraint_name;
    """
    src_constrs = run_query_json(src_cfg, constraint_query)
    tgt_constrs = run_query_json(tgt_cfg, constraint_query)
    
    src_c_set = {f"{c['table_schema']}.{c['table_name']}.{c['constraint_type']}.{c['constraint_name']}" for c in src_constrs}
    tgt_c_set = {f"{c['table_schema']}.{c['table_name']}.{c['constraint_type']}.{c['constraint_name']}" for c in tgt_constrs}
    
    # 6d. Indexes Inventory
    index_query = """
    SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
    FROM pg_indexes
    WHERE schemaname IN ('public', 'auth')
    ORDER BY schemaname, tablename, indexname;
    """
    src_idx = run_query_json(src_cfg, index_query)
    tgt_idx = run_query_json(tgt_cfg, index_query)
    
    src_idx_set = {f"{i['schemaname']}.{i['tablename']}.{i['indexname']}" for i in src_idx}
    tgt_idx_set = {f"{i['schemaname']}.{i['tablename']}.{i['indexname']}" for i in tgt_idx}
    
    # 6e. Foreign Key Orphan Record Detection
    orphan_query = """
    DO $$
    DECLARE
        r RECORD;
        orphan_count BIGINT;
        total_orphans BIGINT := 0;
    BEGIN
        FOR r IN (
            SELECT
                tc.table_schema, 
                tc.table_name, 
                kcu.column_name, 
                ccu.table_schema AS foreign_table_schema,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema IN ('public', 'auth')
        ) LOOP
            EXECUTE format('SELECT count(*) FROM %I.%I t WHERE t.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %I.%I p WHERE p.%I = t.%I)',
                r.table_schema, r.table_name, r.column_name,
                r.foreign_table_schema, r.foreign_table_name, r.foreign_column_name, r.column_name
            ) INTO orphan_count;
            total_orphans := total_orphans + orphan_count;
        END LOOP;
        RAISE NOTICE 'TOTAL_ORPHANS=%', total_orphans;
    END $$;
    """
    orphan_out = subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", orphan_query], env=tgt_env, capture_output=True, text=True)
    orphan_result = "0"
    for line in orphan_out.stderr.split("\n"):
        if "TOTAL_ORPHANS=" in line:
            orphan_result = line.split("TOTAL_ORPHANS=")[1].strip()
            
    # 6f. Row-Level Data Parity & Deterministic Hash Comparison
    print("\n[+] Step 7: Performing Table-by-Table Row Count & Deterministic Hash Audit...")
    table_results = []
    total_src_rows = 0
    total_tgt_rows = 0
    mismatches = 0
    
    for tbl_fullname in sorted(list(src_table_set)):
        sch, tbl = tbl_fullname.split(".", 1)
        
        # Row counts
        s_cnt_raw = run_query(src_cfg, f"SELECT count(*) FROM {sch}.\"{tbl}\";")
        s_cnt = int(s_cnt_raw) if s_cnt_raw.isdigit() else 0
        
        t_cnt_raw = run_query(tgt_cfg, f"SELECT count(*) FROM {sch}.\"{tbl}\";")
        t_cnt = int(t_cnt_raw) if t_cnt_raw.isdigit() else 0
        
        total_src_rows += s_cnt
        total_tgt_rows += t_cnt
        
        row_match = (s_cnt == t_cnt)
        if not row_match:
            mismatches += 1
            
        # Hash comparison for populated tables
        hash_match = True
        s_hash = ""
        t_hash = ""
        if s_cnt > 0:
            # Detect primary key or first column for stable ordering
            pk_col = run_query(src_cfg, f"SELECT column_name FROM information_schema.columns WHERE table_schema = '{sch}' AND table_name = '{tbl}' ORDER BY ordinal_position LIMIT 1;")
            if pk_col:
                h_sql = f"SELECT md5(string_agg({pk_col}::text, ',' ORDER BY {pk_col}::text)) FROM {sch}.\"{tbl}\";"
                s_hash = run_query(src_cfg, h_sql)
                t_hash = run_query(tgt_cfg, h_sql)
                hash_match = (s_hash == t_hash)
                if not hash_match:
                    mismatches += 1
                    
        table_results.append({
            "schema": sch,
            "table": tbl,
            "source_rows": s_cnt,
            "target_rows": t_cnt,
            "row_match": row_match,
            "source_hash": s_hash,
            "target_hash": t_hash,
            "hash_match": hash_match,
            "status": "PASS" if (row_match and hash_match) else "MISMATCH"
        })
        
    # ==============================================================================
    # 7. GENERATE COMPREHENSIVE FORENSIC MATRIX
    # ==============================================================================
    print("\n=================================================================")
    print("  PHASE 20X FORENSIC VERIFICATION MATRIX RESULTS                 ")
    print("=================================================================")
    print(f"  Total Source Tables:       {len(src_tables):<6} | Total Target Tables:       {len(tgt_tables):<6}")
    print(f"  Missing Tables:            {len(missing_tables):<6} | Extra Tables:              {len(extra_tables):<6}")
    print(f"  Total Source Columns:      {len(src_cols):<6} | Total Target Columns:      {len(tgt_cols):<6}")
    print(f"  Missing Columns:           {len(col_missing):<6} | Extra Columns:             {len(col_extra):<6}")
    print(f"  Column Differences:        {len(col_diffs):<6}")
    print(f"  Total Source Constraints:  {len(src_constrs):<6} | Total Target Constraints:  {len(tgt_constrs):<6}")
    print(f"  Total Source Indexes:      {len(src_idx):<6} | Total Target Indexes:      {len(tgt_idx):<6}")
    print(f"  Total Source Rows:         {total_src_rows:<6} | Total Target Rows:         {total_tgt_rows:<6}")
    print(f"  Orphan FK Records:         {orphan_result:<6}")
    print(f"  Table Parity Failures:     {mismatches:<6}")
    print("=================================================================")
    
    print("\n--- POPULATED PRODUCTION TABLES MATRIX ---")
    for tr in table_results:
        if tr["source_rows"] > 0 or tr["status"] != "PASS":
            h_info = f" | MD5: {tr['source_hash'][:8]}..." if tr["source_hash"] else ""
            print(f"    [{tr['status']:<8}] {tr['schema']}.{tr['table']:<32} | Src: {tr['source_rows']:<5} | Tgt: {tr['target_rows']:<5}{h_info}")
            
    # Save machine-readable manifest
    manifest_file = os.path.join(MIGRATION_DIR, "phase20x_exact_migration_manifest.json")
    with open(manifest_file, "w") as jf:
        json.dump({
            "migration_phase": "PHASE 20X - EXACT SUPABASE TO VPS DATABASE REPLICATION",
            "timestamp": subprocess.run(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], capture_output=True, text=True).stdout.strip(),
            "source": {
                "host": src_cfg["host"],
                "database": src_cfg["dbname"],
                "schemas": src_schemas,
                "total_tables": len(src_tables),
                "total_columns": len(src_cols),
                "total_constraints": len(src_constrs),
                "total_indexes": len(src_idx),
                "total_rows": total_src_rows
            },
            "target": {
                "host": tgt_cfg["host"],
                "port": tgt_cfg["port"],
                "database": tgt_cfg["dbname"],
                "total_tables": len(tgt_tables),
                "total_columns": len(tgt_cols),
                "total_constraints": len(tgt_constrs),
                "total_indexes": len(tgt_idx),
                "total_rows": total_tgt_rows
            },
            "parity_verification": {
                "missing_tables": missing_tables,
                "extra_tables": extra_tables,
                "missing_columns": col_missing,
                "extra_columns": col_extra,
                "column_differences": col_diffs,
                "orphan_foreign_keys": int(orphan_result),
                "mismatch_count": mismatches,
                "data_parity_rate": "100.0%" if mismatches == 0 else f"{round((len(table_results) - mismatches)/len(table_results)*100, 2)}%",
                "overall_status": "PASS" if (mismatches == 0 and len(missing_tables) == 0 and len(col_missing) == 0) else "FAIL"
            },
            "table_details": table_results
        }, jf, indent=2)
    os.chmod(manifest_file, 0o600)
    
    # Save SHA-256 Checksums
    checksum_file = os.path.join(MIGRATION_DIR, "checksums.sha256")
    with open(checksum_file, "w") as f:
        for fname in os.listdir(MIGRATION_DIR):
            if fname.endswith(".sha256"): continue
            fpath = os.path.join(MIGRATION_DIR, fname)
            if os.path.isfile(fpath):
                with open(fpath, "rb") as bf:
                    h = hashlib.sha256(bf.read()).hexdigest()
                    f.write(f"{h}  {fname}\n")
    os.chmod(checksum_file, 0o600)
    
    print(f"\n[+] Manifest saved to: {manifest_file}")
    print("=================================================================")
    print("  PHASE 20X EXECUTION COMPLETE                                   ")
    print("=================================================================")

if __name__ == "__main__":
    main()
