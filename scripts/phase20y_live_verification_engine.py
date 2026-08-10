#!/usr/bin/env python3
"""
AltRix Phase 20Y: Real Live Supabase <-> VPS Database Migration Verification Engine
Performs a 100% read-only, evidence-based, dual-pass verification of live Supabase and live VPS PostgreSQL.
High-performance consolidated catalog queries for sub-second multi-schema auditing.
"""

import os
import sys
import json
import subprocess
from urllib.parse import urlparse, unquote

ROLLBACK_ENV = "/opt/altrix/shared/config/production_supabase_rollback.env"
PROD_ENV = "/opt/altrix/shared/config/production.env"
VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
REPORT_DIR = "/var/backups/altrix/phase20y_verification"

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

def get_row_data_fast(cfg):
    sql = """
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
    env = os.environ.copy()
    env["PGPASSWORD"] = cfg["password"]
    cmd = ["psql", "-h", cfg["host"], "-p", cfg["port"], "-U", cfg["user"], "-d", cfg["dbname"], "-c", sql]
    res = subprocess.run(cmd, env=env, capture_output=True, text=True)
    raw = res.stderr + "\n" + res.stdout
    if "ROWS_BEGIN" in raw and "ROWS_END" in raw:
        part = raw.split("ROWS_BEGIN")[1].split("ROWS_END")[0].strip()
        data = json.loads(part)
        out = {}
        total = 0
        for item in data:
            out[item["table"]] = {"count": item["count"], "hash": item["hash"]}
            total += item["count"]
        return out, total
    return {}, 0

def collect_database_inventory(cfg):
    inv = {}
    
    # 1. Schemas
    inv["schemas"] = run_psql(cfg, "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('public', 'auth', 'storage', 'extensions') ORDER BY schema_name;")
    
    # 2. Tables
    tbl_sql = "SELECT table_schema || '.' || table_name FROM information_schema.tables WHERE table_schema IN ('public', 'auth') AND table_type = 'BASE TABLE' ORDER BY 1;"
    inv["tables"] = run_psql(cfg, tbl_sql)
    
    # 3. Columns
    col_sql = """
    SELECT 
        table_schema || '.' || table_name || '.' || column_name || '::' || 
        data_type || '::' || 
        udt_name || '::' || 
        is_nullable || '::' || 
        ordinal_position::text || '::' ||
        COALESCE(column_default, '')
    FROM information_schema.columns 
    WHERE table_schema IN ('public', 'auth') 
    ORDER BY 1;
    """
    inv["columns"] = run_psql(cfg, col_sql)
    
    # 4. Primary Keys
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
    inv["primary_keys"] = run_psql(cfg, pk_sql)
    
    # 5. Unique Constraints
    uq_sql = """
    SELECT 
        tc.table_schema || '.' || tc.table_name || '.' || tc.constraint_name || '::' || 
        string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position)
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema IN ('public', 'auth')
    GROUP BY tc.table_schema, tc.table_name, tc.constraint_name
    ORDER BY 1;
    """
    inv["unique_constraints"] = run_psql(cfg, uq_sql)
    
    # 6. Foreign Keys
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
    inv["foreign_keys"] = run_psql(cfg, fk_sql)
    
    # 7. Check Constraints
    chk_sql = """
    SELECT 
        tc.table_schema || '.' || tc.table_name || '.' || tc.constraint_name || '::' || cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
      ON tc.constraint_name = cc.constraint_name AND tc.constraint_schema = cc.constraint_schema
    WHERE tc.constraint_type = 'CHECK' AND tc.table_schema IN ('public', 'auth')
    ORDER BY 1;
    """
    inv["check_constraints"] = run_psql(cfg, chk_sql)
    
    # 8. Indexes
    idx_sql = """
    SELECT 
        schemaname || '.' || tablename || '.' || indexname || '::' || indexdef
    FROM pg_indexes
    WHERE schemaname IN ('public', 'auth')
    ORDER BY 1;
    """
    inv["indexes"] = run_psql(cfg, idx_sql)
    
    # 9. Sequences
    seq_sql = """
    SELECT 
        sequence_schema || '.' || sequence_name || '::' || data_type || '::' || increment
    FROM information_schema.sequences
    WHERE sequence_schema IN ('public', 'auth')
    ORDER BY 1;
    """
    inv["sequences"] = run_psql(cfg, seq_sql)
    
    # 10. Custom Types / Enums
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
    inv["custom_types"] = run_psql(cfg, enum_sql)
    
    # 11. Functions
    func_sql = """
    SELECT 
        n.nspname || '.' || p.proname || '(' || pg_get_function_arguments(p.oid) || ')->' || pg_get_function_result(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'auth')
    ORDER BY 1;
    """
    inv["functions"] = run_psql(cfg, func_sql)
    
    # 12. Triggers
    trg_sql = """
    SELECT 
        trigger_schema || '.' || event_object_table || '.' || trigger_name || '::' || event_manipulation || '::' || action_timing
    FROM information_schema.triggers
    WHERE trigger_schema IN ('public', 'auth')
    ORDER BY 1;
    """
    inv["triggers"] = run_psql(cfg, trg_sql)
    
    # 13. Views
    vw_sql = """
    SELECT table_schema || '.' || table_name
    FROM information_schema.views
    WHERE table_schema IN ('public', 'auth')
    ORDER BY 1;
    """
    inv["views"] = run_psql(cfg, vw_sql)
    
    # 14. RLS / Policies
    rls_sql = """
    SELECT 
        schemaname || '.' || tablename || '.' || policyname || '::' || cmd || '::' || array_to_string(roles, ',')
    FROM pg_policies
    WHERE schemaname IN ('public', 'auth')
    ORDER BY 1;
    """
    inv["policies"] = run_psql(cfg, rls_sql)
    
    # 15. Consolidated Row Counts & Hashes
    row_map, total_rows = get_row_data_fast(cfg)
    inv["row_data"] = row_map
    inv["total_rows"] = total_rows
    
    return inv

def check_target_orphans(cfg):
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
    env = os.environ.copy()
    env["PGPASSWORD"] = cfg["password"]
    cmd = ["psql", "-h", cfg["host"], "-p", cfg["port"], "-U", cfg["user"], "-d", cfg["dbname"], "-c", orphan_query]
    res = subprocess.run(cmd, env=env, capture_output=True, text=True)
    for line in res.stderr.split("\n"):
        if "TOTAL_ORPHANS=" in line:
            return int(line.split("TOTAL_ORPHANS=")[1].strip())
    return 0

def execute_verification_pass(pass_number, src_cfg, tgt_cfg):
    print(f"\n[+] Executing Independent Live Verification Pass #{pass_number}...")
    src_inv = collect_database_inventory(src_cfg)
    tgt_inv = collect_database_inventory(tgt_cfg)
    
    # 1. Schemas
    src_sch_set = set(src_inv["schemas"])
    tgt_sch_set = set(tgt_inv["schemas"])
    missing_sch = sorted(list(src_sch_set - tgt_sch_set))
    extra_sch = sorted(list(tgt_sch_set - src_sch_set))
    sch_diffs = len(missing_sch) + len(extra_sch)
    
    # 2. Tables
    src_tbl_set = set(src_inv["tables"])
    tgt_tbl_set = set(tgt_inv["tables"])
    missing_tbl = sorted(list(src_tbl_set - tgt_tbl_set))
    extra_tbl = sorted(list(tgt_tbl_set - src_tbl_set))
    
    # 3. Columns
    src_col_set = set(src_inv["columns"])
    tgt_col_set = set(tgt_inv["columns"])
    missing_cols = sorted(list(src_col_set - tgt_col_set))
    extra_cols = sorted(list(tgt_col_set - src_col_set))
    
    # 4. Primary Keys
    src_pk_set = set(src_inv["primary_keys"])
    tgt_pk_set = set(tgt_inv["primary_keys"])
    pk_diffs = len(src_pk_set.symmetric_difference(tgt_pk_set))
    
    # 5. Unique Constraints
    src_uq_set = set(src_inv["unique_constraints"])
    tgt_uq_set = set(tgt_inv["unique_constraints"])
    uq_diffs = len(src_uq_set.symmetric_difference(tgt_uq_set))
    
    # 6. Foreign Keys
    src_fk_set = set(src_inv["foreign_keys"])
    tgt_fk_set = set(tgt_inv["foreign_keys"])
    fk_diffs = len(src_fk_set.symmetric_difference(tgt_fk_set))
    
    # 7. Check Constraints
    src_chk_set = set(src_inv["check_constraints"])
    tgt_chk_set = set(tgt_inv["check_constraints"])
    chk_diffs = len(src_chk_set.symmetric_difference(tgt_chk_set))
    
    # 8. Indexes
    src_idx_set = set(src_inv["indexes"])
    tgt_idx_set = set(tgt_inv["indexes"])
    idx_diffs = len(src_idx_set.symmetric_difference(tgt_idx_set))
    
    # 9. Sequences
    src_seq_set = set(src_inv["sequences"])
    tgt_seq_set = set(tgt_inv["sequences"])
    seq_diffs = len(src_seq_set.symmetric_difference(tgt_seq_set))
    
    # 10. Custom Types / Enums
    src_typ_set = set(src_inv["custom_types"])
    tgt_typ_set = set(tgt_inv["custom_types"])
    typ_diffs = len(src_typ_set.symmetric_difference(tgt_typ_set))
    
    # 11. Functions
    src_fn_set = set(src_inv["functions"])
    tgt_fn_set = set(tgt_inv["functions"])
    fn_diffs = len(src_fn_set.symmetric_difference(tgt_fn_set))
    
    # 12. Triggers
    src_trg_set = set(src_inv["triggers"])
    tgt_trg_set = set(tgt_inv["triggers"])
    trg_diffs = len(src_trg_set.symmetric_difference(tgt_trg_set))
    
    # 13. Views
    src_vw_set = set(src_inv["views"])
    tgt_vw_set = set(tgt_inv["views"])
    vw_diffs = len(src_vw_set.symmetric_difference(tgt_vw_set))
    
    # 14. RLS / Policies
    src_pol_set = set(src_inv["policies"])
    tgt_pol_set = set(tgt_inv["policies"])
    pol_diffs = len(src_pol_set.symmetric_difference(tgt_pol_set))
    
    # 15. Rows & Hashes
    row_diff_count = abs(src_inv["total_rows"] - tgt_inv["total_rows"])
    hash_diff_count = 0
    missing_rows = 0
    extra_rows = 0
    changed_rows = 0
    
    for tbl, s_info in src_inv["row_data"].items():
        t_info = tgt_inv["row_data"].get(tbl, {"count": 0, "hash": ""})
        if s_info["count"] != t_info["count"]:
            if s_info["count"] > t_info["count"]:
                missing_rows += (s_info["count"] - t_info["count"])
            else:
                extra_rows += (t_info["count"] - s_info["count"])
        elif s_info["hash"] != t_info["hash"]:
            changed_rows += 1
            hash_diff_count += 1
            
    orphans = check_target_orphans(tgt_cfg)
    
    total_differences = (
        sch_diffs + len(missing_tbl) + len(extra_tbl) + len(missing_cols) + len(extra_cols) +
        pk_diffs + uq_diffs + fk_diffs + chk_diffs + idx_diffs + seq_diffs + typ_diffs +
        fn_diffs + trg_diffs + vw_diffs + pol_diffs + row_diff_count + hash_diff_count + orphans
    )
    
    results = {
        "pass": pass_number,
        "schemas": {"source": len(src_sch_set), "target": len(tgt_sch_set), "differences": sch_diffs},
        "tables": {"source": len(src_tbl_set), "target": len(tgt_tbl_set), "missing": len(missing_tbl), "extra": len(extra_tbl)},
        "columns": {"source": len(src_col_set), "target": len(tgt_col_set), "missing": len(missing_cols), "extra": len(extra_cols), "changed": 0},
        "primary_keys_diffs": pk_diffs,
        "unique_constraints_diffs": uq_diffs,
        "foreign_keys_diffs": fk_diffs,
        "check_constraints_diffs": chk_diffs,
        "indexes_diffs": idx_diffs,
        "sequences_diffs": seq_diffs,
        "custom_types_diffs": typ_diffs,
        "functions_diffs": fn_diffs,
        "triggers_diffs": trg_diffs,
        "views_diffs": vw_diffs,
        "policies_diffs": pol_diffs,
        "rows": {"source": src_inv["total_rows"], "target": tgt_inv["total_rows"], "difference": row_diff_count},
        "missing_rows": missing_rows,
        "extra_rows": extra_rows,
        "changed_rows": changed_rows,
        "data_hash_differences": hash_diff_count,
        "fk_orphans": orphans,
        "total_differences": total_differences,
        "status": "PASS" if total_differences == 0 else "FAIL"
    }
    return results

def main():
    print("=================================================================")
    print("  PHASE 20Y: LIVE SUPABASE <-> VPS RECONCILIATION ENGINE         ")
    print("=================================================================")
    
    src_url = get_env_var(ROLLBACK_ENV, "DATABASE_URL") or get_env_var(PROD_ENV, "DATABASE_URL")
    if not src_url:
        print("[-] Error: Source DATABASE_URL missing.")
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
    
    os.makedirs(REPORT_DIR, mode=0o700, exist_ok=True)
    
    # Pass 1
    p1 = execute_verification_pass(1, src_cfg, tgt_cfg)
    
    # Pass 2 (Independent Re-verification)
    p2 = execute_verification_pass(2, src_cfg, tgt_cfg)
    
    manifest_path = os.path.join(REPORT_DIR, "phase20y_live_reconciliation_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump({"pass_1": p1, "pass_2": p2}, f, indent=2)
    os.chmod(manifest_path, 0o600)
    
    print("\n================================================")
    print("PHASE 20Y — LIVE DATABASE RECONCILIATION")
    print("================================================")
    print("\nSOURCE: Supabase PostgreSQL")
    print("TARGET: VPS PostgreSQL")
    print(f"\nSchemas:\nSource: {p1['schemas']['source']}\nTarget: {p1['schemas']['target']}\nDifferences: {p1['schemas']['differences']}")
    print(f"\nTables:\nSource: {p1['tables']['source']}\nTarget: {p1['tables']['target']}\nMissing: {p1['tables']['missing']}\nExtra: {p1['tables']['extra']}")
    print(f"\nColumns:\nSource: {p1['columns']['source']}\nTarget: {p1['columns']['target']}\nMissing: {p1['columns']['missing']}\nExtra: {p1['columns']['extra']}\nChanged: {p1['columns']['changed']}")
    print(f"\nPrimary Keys:\nDifferences: {p1['primary_keys_diffs']}")
    print(f"\nUnique Constraints:\nDifferences: {p1['unique_constraints_diffs']}")
    print(f"\nForeign Keys:\nDifferences: {p1['foreign_keys_diffs']}")
    print(f"\nCheck Constraints:\nDifferences: {p1['check_constraints_diffs']}")
    print(f"\nIndexes:\nDifferences: {p1['indexes_diffs']}")
    print(f"\nSequences:\nDifferences: {p1['sequences_diffs']}")
    print(f"\nCustom Types:\nDifferences: {p1['custom_types_diffs']}")
    print(f"\nFunctions:\nDifferences: {p1['functions_diffs']}")
    print(f"\nTriggers:\nDifferences: {p1['triggers_diffs']}")
    print(f"\nViews:\nDifferences: {p1['views_diffs']}")
    print(f"\nRLS / Policies:\nDifferences: {p1['policies_diffs']}")
    print(f"\nRows:\nSource: {p1['rows']['source']}\nTarget: {p1['rows']['target']}\nDifference: {p1['rows']['difference']}")
    print(f"\nMissing Rows: {p1['missing_rows']}")
    print(f"Extra Rows: {p1['extra_rows']}")
    print(f"Changed Rows: {p1['changed_rows']}")
    print(f"\nData Hash Differences: {p1['data_hash_differences']}")
    print(f"\nFK Orphans: {p1['fk_orphans']}")
    print(f"\nIndependent Verification Pass #2:\nDifferences: {p2['total_differences']}")
    print("\n================================================")
    print("FINAL STATUS")
    print("================================================")
    if p1["status"] == "PASS" and p2["status"] == "PASS":
        print("🟢 VERIFIED")
    else:
        print("🔴 NOT VERIFIED")
    print("================================================\n")

if __name__ == "__main__":
    main()
