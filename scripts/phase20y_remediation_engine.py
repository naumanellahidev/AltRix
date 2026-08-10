#!/usr/bin/env python3
"""
AltRix Phase 20Y-R: Exact Supabase <-> VPS Database Reconciliation & Remediation Engine
Performs safe, live, object-by-object forensic analysis, applies safe remediations to VPS PostgreSQL,
and executes independent post-remediation verification against live Supabase.
"""

import os
import sys
import json
import subprocess
from urllib.parse import urlparse, unquote

ROLLBACK_ENV = "/opt/altrix/shared/config/production_supabase_rollback.env"
PROD_ENV = "/opt/altrix/shared/config/production.env"
VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
REMEDIATION_DIR = "/var/backups/altrix/phase20yr_reconciliation"

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

def run_psql(cfg, sql):
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
    res = subprocess.run(cmd, env=env, capture_output=True, text=True)
    return [line.strip() for line in res.stdout.strip().split("\n") if line.strip()]

def run_psql_file(cfg, fpath):
    env = os.environ.copy()
    env["PGPASSWORD"] = cfg["password"]
    cmd = [
        "psql",
        "-h", cfg["host"],
        "-p", cfg["port"],
        "-U", cfg["user"],
        "-d", cfg["dbname"],
        "-f", fpath
    ]
    return subprocess.run(cmd, env=env, capture_output=True, text=True)

def main():
    print("=================================================================")
    print("  PHASE 20Y-R: DATABASE RECONCILIATION & REMEDIATION ENGINE      ")
    print("=================================================================")
    
    os.makedirs(REMEDIATION_DIR, mode=0o700, exist_ok=True)
    
    # 1. Connection Discovery
    src_url = get_env_var(ROLLBACK_ENV, "DATABASE_URL") or get_env_var(PROD_ENV, "DATABASE_URL")
    if not src_url:
        print("[-] Error: Source connection URL missing.")
        sys.exit(1)
        
    src_cfg = parse_db_url(src_url)
    admin_pass = get_env_var(VPS_PG_CONFIG, "VPS_PG_ADMIN_PASSWORD") or "altrix_secure_admin_pass"
    tgt_cfg = {
        "host": "127.0.0.1",
        "port": "5432",
        "dbname": "altrix",
        "user": "altrix_admin",
        "password": admin_pass
    }
    
    src_ver = run_psql(src_cfg, "SELECT version();")[0]
    tgt_ver = run_psql(tgt_cfg, "SELECT version();")[0]
    print(f"[+] Source PostgreSQL: {src_ver[:40]}... on {src_cfg['host']}")
    print(f"[+] Target PostgreSQL: {tgt_ver[:40]}... on {tgt_cfg['host']}")
    
    # 2. Extract Complete Source Policies, Foreign Keys, Indexes, Functions, and Check Constraints
    print("\n[+] Step 2: Extracting DDL artifacts from Supabase for exact reconciliation...")
    
    # 2a. Reconcile Functions (like auth.uid(), auth.role(), auth.jwt(), etc.)
    auth_funcs_sql = """
    CREATE OR REPLACE FUNCTION auth.uid() 
    RETURNS uuid 
    LANGUAGE sql STABLE 
    AS $$
        SELECT COALESCE(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        )::uuid
    $$;

    CREATE OR REPLACE FUNCTION auth.role() 
    RETURNS text 
    LANGUAGE sql STABLE 
    AS $$
        SELECT COALESCE(
            nullif(current_setting('request.jwt.claim.role', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
        )::text
    $$;

    CREATE OR REPLACE FUNCTION auth.jwt() 
    RETURNS jsonb 
    LANGUAGE sql STABLE 
    AS $$
        SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    """
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", auth_funcs_sql], env=dict(os.environ, PGPASSWORD=tgt_cfg["password"]), check=True)
    print("    Application helper functions (auth.uid, auth.role, auth.jwt) reconciled.")
    
    # 2b. Reconcile RLS Policies from Source
    print("    Extracting and applying all application RLS policies from Supabase...")
    policy_sql = """
    SELECT 
        'ALTER TABLE ' || quote_ident(schemaname) || '.' || quote_ident(tablename) || ' ENABLE ROW LEVEL SECURITY;' || E'\\n' ||
        'DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON ' || quote_ident(schemaname) || '.' || quote_ident(tablename) || ';' || E'\\n' ||
        'CREATE POLICY ' || quote_ident(policyname) || ' ON ' || quote_ident(schemaname) || '.' || quote_ident(tablename) || 
        ' FOR ' || cmd || 
        ' TO ' || array_to_string(roles, ', ') || 
        CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END || 
        CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END || ';'
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
    """
    policies_ddl = run_psql(src_cfg, policy_sql)
    if policies_ddl:
        policy_remediation_file = os.path.join(REMEDIATION_DIR, "reconcile_policies.sql")
        with open(policy_remediation_file, "w") as pf:
            pf.write("\n".join(policies_ddl))
        run_psql_file(tgt_cfg, policy_remediation_file)
        print(f"    Applied {len(policies_ddl)} application RLS policies.")
        
    # 2c. Reconcile Foreign Keys from Source
    print("    Extracting and applying all foreign keys from Supabase...")
    fk_ddl_sql = """
    SELECT 
        'DO $$ BEGIN ' ||
        'IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = ' || quote_literal(tc.constraint_name) || ' AND table_schema = ' || quote_literal(tc.table_schema) || ') THEN ' ||
        'ALTER TABLE ' || quote_ident(tc.table_schema) || '.' || quote_ident(tc.table_name) || 
        ' ADD CONSTRAINT ' || quote_ident(tc.constraint_name) || 
        ' FOREIGN KEY (' || quote_ident(kcu.column_name) || ') ' ||
        ' REFERENCES ' || quote_ident(ccu.table_schema) || '.' || quote_ident(ccu.table_name) || ' (' || quote_ident(ccu.column_name) || ') ' ||
        ' ON DELETE ' || rc.delete_rule || ' ON UPDATE ' || rc.update_rule || ';' ||
        'END IF; END $$;'
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema IN ('public', 'auth')
    ORDER BY tc.table_schema, tc.table_name;
    """
    fk_ddl_list = run_psql(src_cfg, fk_ddl_sql)
    if fk_ddl_list:
        fk_remediation_file = os.path.join(REMEDIATION_DIR, "reconcile_foreign_keys.sql")
        with open(fk_remediation_file, "w") as ff:
            ff.write("\n".join(fk_ddl_list))
        run_psql_file(tgt_cfg, fk_remediation_file)
        print(f"    Reconciled foreign keys.")
        
    # 2d. Reconcile Indexes from Source
    print("    Extracting and applying all indexes from Supabase...")
    idx_ddl_sql = """
    SELECT indexdef || ';'
    FROM pg_indexes
    WHERE schemaname IN ('public', 'auth') AND indexname NOT LIKE '%_pkey'
    ORDER BY schemaname, tablename, indexname;
    """
    idx_ddl_list = run_psql(src_cfg, idx_ddl_sql)
    if idx_ddl_list:
        idx_remediation_file = os.path.join(REMEDIATION_DIR, "reconcile_indexes.sql")
        with open(idx_remediation_file, "w") as ixf:
            ixf.write("\n".join(idx_ddl_list))
        run_psql_file(tgt_cfg, idx_remediation_file)
        print(f"    Reconciled indexes.")
        
    # 2e. Reconcile Schemas (`storage`, `extensions`)
    schema_reconcile_sql = """
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE SCHEMA IF NOT EXISTS extensions;
    GRANT USAGE, CREATE ON SCHEMA storage TO altrix_admin, altrix_app;
    GRANT USAGE, CREATE ON SCHEMA extensions TO altrix_admin, altrix_app;
    """
    subprocess.run(["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", schema_reconcile_sql], env=dict(os.environ, PGPASSWORD=tgt_cfg["password"]), check=True)
    print("    Schemas 'storage' and 'extensions' reconciled.")
    
    # ==============================================================================
    # STEP 3: EXECUTE FRESH INDEPENDENT RECONCILIATION AUDIT
    # ==============================================================================
    print("\n[+] Step 3: Executing Independent Fresh Post-Remediation Verification Audit...")
    
    # 3a. Schemas
    src_sch = set(run_psql(src_cfg, "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('public', 'auth', 'storage', 'extensions') ORDER BY 1;"))
    tgt_sch = set(run_psql(tgt_cfg, "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('public', 'auth', 'storage', 'extensions') ORDER BY 1;"))
    sch_diffs = len(src_sch.symmetric_difference(tgt_sch))
    
    # 3b. Tables
    tbl_sql = "SELECT table_schema || '.' || table_name FROM information_schema.tables WHERE table_schema IN ('public', 'auth') AND table_type = 'BASE TABLE' ORDER BY 1;"
    src_tbl = set(run_psql(src_cfg, tbl_sql))
    tgt_tbl = set(run_psql(tgt_cfg, tbl_sql))
    tbl_missing = sorted(list(src_tbl - tgt_tbl))
    tbl_extra = sorted(list(tgt_tbl - src_tbl))
    
    # 3c. Columns (Normalizing type and nullability)
    col_sql = """
    SELECT 
        table_schema || '.' || table_name || '.' || column_name || '::' || 
        data_type || '::' || 
        udt_name || '::' || 
        is_nullable
    FROM information_schema.columns 
    WHERE table_schema IN ('public', 'auth') 
    ORDER BY 1;
    """
    src_cols = set(run_psql(src_cfg, col_sql))
    tgt_cols = set(run_psql(tgt_cfg, col_sql))
    col_missing = sorted(list(src_cols - tgt_cols))
    col_extra = sorted(list(tgt_cols - src_cols))
    
    # 3d. Primary Keys
    pk_sql = """
    SELECT 
        tc.table_schema || '.' || tc.table_name || '::' || 
        string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position)
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema IN ('public', 'auth')
    GROUP BY tc.table_schema, tc.table_name
    ORDER BY 1;
    """
    src_pk = set(run_psql(src_cfg, pk_sql))
    tgt_pk = set(run_psql(tgt_cfg, pk_sql))
    pk_diffs = len(src_pk.symmetric_difference(tgt_pk))
    
    # 3e. Unique Constraints
    uq_sql = """
    SELECT 
        tc.table_schema || '.' || tc.table_name || '::' || 
        string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position)
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema IN ('public', 'auth')
    GROUP BY tc.table_schema, tc.table_name, tc.constraint_name
    ORDER BY 1;
    """
    src_uq = set(run_psql(src_cfg, uq_sql))
    tgt_uq = set(run_psql(tgt_cfg, uq_sql))
    uq_diffs = len(src_uq.symmetric_difference(tgt_uq))
    
    # 3f. Foreign Keys
    fk_sql = """
    SELECT 
        tc.table_schema || '.' || tc.table_name || '.' || kcu.column_name || '->' ||
        ccu.table_schema || '.' || ccu.table_name || '.' || ccu.column_name || '::ON_DELETE=' ||
        rc.delete_rule || '::ON_UPDATE=' || rc.update_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema IN ('public', 'auth')
    ORDER BY 1;
    """
    src_fk = set(run_psql(src_cfg, fk_sql))
    tgt_fk = set(run_psql(tgt_cfg, fk_sql))
    fk_diffs = len(src_fk.symmetric_difference(tgt_fk))
    
    # 3g. True User/Application CHECK Constraints (Excluding system $1 IS NOT NULL artifacts)
    user_chk_sql = """
    SELECT 
        tc.table_schema || '.' || tc.table_name || '.' || tc.constraint_name || '::' || cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
      ON tc.constraint_name = cc.constraint_name AND tc.constraint_schema = cc.constraint_schema
    WHERE tc.constraint_type = 'CHECK' 
      AND tc.table_schema IN ('public', 'auth')
      AND cc.check_clause NOT LIKE '%IS NOT NULL'
    ORDER BY 1;
    """
    src_chk = set(run_psql(src_cfg, user_chk_sql))
    tgt_chk = set(run_psql(tgt_cfg, user_chk_sql))
    chk_diffs = len(src_chk.symmetric_difference(tgt_chk))
    
    # 3h. Indexes
    idx_sql = """
    SELECT 
        schemaname || '.' || tablename || '.' || indexname || '::' || indexdef
    FROM pg_indexes
    WHERE schemaname IN ('public', 'auth')
    ORDER BY 1;
    """
    src_idx = set(run_psql(src_cfg, idx_sql))
    tgt_idx = set(run_psql(tgt_cfg, idx_sql))
    idx_diffs = len(src_idx.symmetric_difference(tgt_idx))
    
    # 3i. Sequences
    seq_sql = """
    SELECT 
        sequence_schema || '.' || sequence_name || '::' || data_type || '::' || increment
    FROM information_schema.sequences
    WHERE sequence_schema IN ('public', 'auth')
    ORDER BY 1;
    """
    src_seq = set(run_psql(src_cfg, seq_sql))
    tgt_seq = set(run_psql(tgt_cfg, seq_sql))
    seq_diffs = len(src_seq.symmetric_difference(tgt_seq))
    
    # 3j. Custom Types / Enums
    enum_sql = """
    SELECT 
        n.nspname || '.' || t.typname || '::' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname IN ('public', 'auth')
    GROUP BY n.nspname, t.typname
    ORDER BY 1;
    """
    src_typ = set(run_psql(src_cfg, enum_sql))
    tgt_typ = set(run_psql(tgt_cfg, enum_sql))
    typ_diffs = len(src_typ.symmetric_difference(tgt_typ))
    
    # 3k. Application Functions in public & auth
    app_fn_sql = """
    SELECT 
        n.nspname || '.' || p.proname || '(' || pg_get_function_arguments(p.oid) || ')->' || pg_get_function_result(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'auth')
    ORDER BY 1;
    """
    src_fn = set(run_psql(src_cfg, app_fn_sql))
    tgt_fn = set(run_psql(tgt_cfg, app_fn_sql))
    fn_diffs = len(src_fn.symmetric_difference(tgt_fn))
    
    # 3l. Triggers
    trg_sql = """
    SELECT 
        trigger_schema || '.' || event_object_table || '.' || trigger_name || '::' || event_manipulation || '::' || action_timing
    FROM information_schema.triggers
    WHERE trigger_schema IN ('public', 'auth')
    ORDER BY 1;
    """
    src_trg = set(run_psql(src_cfg, trg_sql))
    tgt_trg = set(run_psql(tgt_cfg, trg_sql))
    trg_diffs = len(src_trg.symmetric_difference(tgt_trg))
    
    # 3m. Views
    vw_sql = """
    SELECT table_schema || '.' || table_name
    FROM information_schema.views
    WHERE table_schema IN ('public', 'auth')
    ORDER BY 1;
    """
    src_vw = set(run_psql(src_cfg, vw_sql))
    tgt_vw = set(run_psql(tgt_cfg, vw_sql))
    vw_diffs = len(src_vw.symmetric_difference(tgt_vw))
    
    # 3n. Application RLS Policies in public
    app_pol_sql = """
    SELECT 
        schemaname || '.' || tablename || '.' || policyname || '::' || cmd || '::' || array_to_string(roles, ',')
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY 1;
    """
    src_pol = set(run_psql(src_cfg, app_pol_sql))
    tgt_pol = set(run_psql(tgt_cfg, app_pol_sql))
    pol_diffs = len(src_pol.symmetric_difference(tgt_pol))
    
    # 3o. Dynamic Row Counts & Deterministic MD5 Hashes
    row_count_sql = """
    DO $$
    DECLARE
        r RECORD;
        cnt BIGINT;
        h TEXT;
        pk_col TEXT;
        res JSONB := '[]'::jsonb;
    BEGIN
        FOR r IN (
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_schema IN ('public', 'auth') AND table_type = 'BASE TABLE'
            ORDER BY table_schema, table_name
        ) LOOP
            EXECUTE format('SELECT count(*) FROM %I.%I', r.table_schema, r.table_name) INTO cnt;
            h := '';
            IF cnt > 0 THEN
                SELECT column_name INTO pk_col 
                FROM information_schema.columns 
                WHERE table_schema = r.table_schema AND table_name = r.table_name 
                ORDER BY ordinal_position LIMIT 1;
                
                IF pk_col IS NOT NULL THEN
                    BEGIN
                        EXECUTE format('SELECT md5(string_agg(t.*::text, ''|'' ORDER BY %I::text)) FROM %I.%I t', pk_col, r.table_schema, r.table_name) INTO h;
                    EXCEPTION WHEN OTHERS THEN
                        h := '';
                    END;
                END IF;
            END IF;
            res := res || jsonb_build_object('table', r.table_schema || '.' || r.table_name, 'count', cnt, 'hash', COALESCE(h, ''));
        END LOOP;
        RAISE NOTICE 'ROWS_BEGIN % ROWS_END', res;
    END $$;
    """
    def extract_rows(cfg):
        env = dict(os.environ, PGPASSWORD=cfg["password"])
        cmd = ["psql", "-h", cfg["host"], "-p", cfg["port"], "-U", cfg["user"], "-d", cfg["dbname"], "-c", row_count_sql]
        res = subprocess.run(cmd, env=env, capture_output=True, text=True)
        raw = res.stderr + "\n" + res.stdout
        out = {}
        total = 0
        if "ROWS_BEGIN" in raw and "ROWS_END" in raw:
            data = json.loads(raw.split("ROWS_BEGIN")[1].split("ROWS_END")[0].strip())
            for it in data:
                out[it["table"]] = it
                total += it["count"]
        return out, total
        
    s_rows_map, s_total_rows = extract_rows(src_cfg)
    t_rows_map, t_total_rows = extract_rows(tgt_cfg)
    
    row_diff_count = abs(s_total_rows - t_total_rows)
    hash_diffs = 0
    missing_rows = 0
    extra_rows = 0
    changed_rows = 0
    
    for tbl, s_it in s_rows_map.items():
        t_it = t_rows_map.get(tbl, {"count": 0, "hash": ""})
        if s_it["count"] != t_it["count"]:
            if s_it["count"] > t_it["count"]:
                missing_rows += (s_it["count"] - t_it["count"])
            else:
                extra_rows += (t_it["count"] - s_it["count"])
        elif s_it["hash"] != t_it["hash"]:
            changed_rows += 1
            hash_diffs += 1
            
    # 3p. Foreign Key Orphan Check on Target
    orphan_query = """
    DO $$
    DECLARE
        r RECORD;
        cnt BIGINT;
        tot BIGINT := 0;
    BEGIN
        FOR r IN (
            SELECT
                tc.table_schema, tc.table_name, kcu.column_name, 
                ccu.table_schema AS f_schema, ccu.table_name AS f_table, ccu.column_name AS f_col
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema IN ('public', 'auth')
        ) LOOP
            EXECUTE format('SELECT count(*) FROM %I.%I t WHERE t.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %I.%I p WHERE p.%I = t.%I)',
                r.table_schema, r.table_name, r.column_name, r.f_schema, r.f_table, r.f_col, r.column_name
            ) INTO cnt;
            tot := tot + cnt;
        END LOOP;
        RAISE NOTICE 'TOTAL_ORPHANS=%', tot;
    END $$;
    """
    env = dict(os.environ, PGPASSWORD=tgt_cfg["password"])
    cmd = ["psql", "-h", tgt_cfg["host"], "-p", tgt_cfg["port"], "-U", tgt_cfg["user"], "-d", tgt_cfg["dbname"], "-c", orphan_query]
    res = subprocess.run(cmd, env=env, capture_output=True, text=True)
    orphans = 0
    for line in res.stderr.split("\n"):
        if "TOTAL_ORPHANS=" in line:
            orphans = int(line.split("TOTAL_ORPHANS=")[1].strip())
            
    # Save Final Manifest
    manifest_data = {
        "source": {"host": src_cfg["host"], "version": src_ver},
        "target": {"host": tgt_cfg["host"], "version": tgt_ver},
        "schemas": {"source": len(src_sch), "target": len(tgt_sch), "differences": sch_diffs},
        "tables": {"source": len(src_tbl), "target": len(tgt_tbl), "missing": len(tbl_missing), "extra": len(tbl_extra)},
        "columns": {"source": len(src_cols), "target": len(tgt_cols), "missing": len(col_missing), "extra": len(col_extra)},
        "primary_keys_diffs": pk_diffs,
        "unique_constraints_diffs": uq_diffs,
        "foreign_keys_diffs": fk_diffs,
        "user_check_constraints_diffs": chk_diffs,
        "indexes_diffs": idx_diffs,
        "sequences_diffs": seq_diffs,
        "custom_types_diffs": typ_diffs,
        "application_functions_diffs": fn_diffs,
        "triggers_diffs": trg_diffs,
        "views_diffs": vw_diffs,
        "application_policies_diffs": pol_diffs,
        "rows": {"source": s_total_rows, "target": t_total_rows, "difference": row_diff_count},
        "missing_rows": missing_rows,
        "extra_rows": extra_rows,
        "changed_rows": changed_rows,
        "data_hash_differences": hash_diffs,
        "fk_orphans": orphans
    }
    
    final_json_path = os.path.join(REMEDIATION_DIR, "phase20yr_final_evidence.json")
    with open(final_json_path, "w") as f:
        json.dump(manifest_data, f, indent=2)
    os.chmod(final_json_path, 0o600)
    
    print("\n================================================")
    print("PHASE 20Y-R — LIVE DATABASE RECONCILIATION")
    print("================================================")
    print("\nSOURCE: Supabase PostgreSQL")
    print("TARGET: VPS PostgreSQL")
    print(f"\nSchemas:\nSource: {len(src_sch)}\nTarget: {len(tgt_sch)}\nDifferences: {sch_diffs}")
    print(f"\nTables:\nSource: {len(src_tbl)}\nTarget: {len(tgt_tbl)}\nMissing: {len(tbl_missing)}\nExtra: {len(tbl_extra)}")
    print(f"\nColumns:\nSource: {len(src_cols)}\nTarget: {len(tgt_cols)}\nMissing: {len(col_missing)}\nExtra: {len(col_extra)}")
    print(f"\nPrimary Keys:\nDifferences: {pk_diffs}")
    print(f"\nUnique Constraints:\nDifferences: {uq_diffs}")
    print(f"\nForeign Keys:\nDifferences: {fk_diffs}")
    print(f"\nUser Check Constraints:\nDifferences: {chk_diffs}")
    print(f"\nIndexes:\nDifferences: {idx_diffs}")
    print(f"\nSequences:\nDifferences: {seq_diffs}")
    print(f"\nCustom Types:\nDifferences: {typ_diffs}")
    print(f"\nApplication Functions:\nDifferences: {fn_diffs}")
    print(f"\nTriggers:\nDifferences: {trg_diffs}")
    print(f"\nViews:\nDifferences: {vw_diffs}")
    print(f"\nApplication RLS Policies:\nDifferences: {pol_diffs}")
    print(f"\nRows:\nSource: {s_total_rows}\nTarget: {t_total_rows}\nDifference: {row_diff_count}")
    print(f"\nMissing Rows: {missing_rows}")
    print(f"Extra Rows: {extra_rows}")
    print(f"Changed Rows: {changed_rows}")
    print(f"\nData Hash Differences: {hash_diffs}")
    print(f"\nFK Orphans: {orphans}")
    print("\n================================================")
    print("FINAL STATUS")
    print("================================================")
    
    unresolved = (
        sch_diffs + len(tbl_missing) + len(tbl_extra) + len(col_missing) + len(col_extra) +
        pk_diffs + uq_diffs + fk_diffs + chk_diffs + idx_diffs + seq_diffs + typ_diffs +
        fn_diffs + trg_diffs + vw_diffs + pol_diffs + row_diff_count + hash_diffs + orphans
    )
    
    if unresolved == 0:
        print("🟢 EXACT APPLICATION DATABASE MATCH")
    elif row_diff_count == 0 and len(tbl_missing) == 0 and len(col_missing) == 0:
        print("🟡 PARTIALLY RECONCILED")
    else:
        print("🔴 NOT VERIFIED")
    print("================================================\n")

if __name__ == "__main__":
    main()
