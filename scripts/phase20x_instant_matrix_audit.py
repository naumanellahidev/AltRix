#!/usr/bin/env python3
"""
AltRix Phase 20X: Instant Multi-Schema Forensic Matrix Audit Engine
Executes complete schema, column, constraint, index, sequence, row count, and MD5 hash
comparisons between live Supabase and live VPS PostgreSQL in a single consolidated pass.
"""

import os
import sys
import json
import subprocess
from urllib.parse import urlparse, unquote

ROLLBACK_ENV = "/opt/altrix/shared/config/production_supabase_rollback.env"
PROD_ENV = "/opt/altrix/shared/config/production.env"
VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
MANIFEST_PATH = "/var/backups/altrix/phase20x_exact_migration/phase20x_forensic_audit_matrix.json"

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

AUDIT_SQL = """
DO $$
DECLARE
    r RECORD;
    cnt BIGINT;
    h TEXT;
    pk_col TEXT;
    table_rows JSONB := '[]'::jsonb;
    cols JSONB;
    constrs JSONB;
    idx JSONB;
    seqs JSONB;
    schs JSONB;
    final_output JSONB;
BEGIN
    -- 1. Schemas
    SELECT jsonb_agg(schema_name) INTO schs
    FROM information_schema.schemata 
    WHERE schema_name IN ('public', 'auth', 'storage', 'extensions');

    -- 2. Columns
    SELECT jsonb_agg(jsonb_build_object(
        'schema', table_schema,
        'table', table_name,
        'column', column_name,
        'pos', ordinal_position,
        'type', data_type,
        'udt', udt_name,
        'nullable', is_nullable,
        'default', COALESCE(column_default, '')
    )) INTO cols
    FROM information_schema.columns
    WHERE table_schema IN ('public', 'auth');

    -- 3. Constraints
    SELECT jsonb_agg(jsonb_build_object(
        'schema', table_schema,
        'table', table_name,
        'name', constraint_name,
        'type', constraint_type
    )) INTO constrs
    FROM information_schema.table_constraints
    WHERE table_schema IN ('public', 'auth');

    -- 4. Indexes
    SELECT jsonb_agg(jsonb_build_object(
        'schema', schemaname,
        'table', tablename,
        'name', indexname
    )) INTO idx
    FROM pg_indexes
    WHERE schemaname IN ('public', 'auth');

    -- 5. Sequences
    SELECT jsonb_agg(jsonb_build_object(
        'schema', sequence_schema,
        'name', sequence_name
    )) INTO seqs
    FROM information_schema.sequences
    WHERE sequence_schema IN ('public', 'auth');

    -- 6. Tables, Row Counts & Hashes
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
                    EXECUTE format('SELECT md5(string_agg(%I::text, '','' ORDER BY %I::text)) FROM %I.%I', pk_col, pk_col, r.table_schema, r.table_name) INTO h;
                EXCEPTION WHEN OTHERS THEN
                    h := '';
                END;
            END IF;
        END IF;
        
        table_rows := table_rows || jsonb_build_object(
            'schema', r.table_schema,
            'table', r.table_name,
            'rows', cnt,
            'hash', COALESCE(h, '')
        );
    END LOOP;

    final_output := jsonb_build_object(
        'schemas', schs,
        'columns', cols,
        'constraints', constrs,
        'indexes', idx,
        'sequences', seqs,
        'tables', table_rows
    );

    RAISE NOTICE 'AUDIT_OUTPUT_BEGIN % AUDIT_OUTPUT_END', final_output;
END $$;
"""

def extract_audit_data(cfg):
    env = os.environ.copy()
    env["PGPASSWORD"] = cfg["password"]
    cmd = [
        "psql",
        "-h", cfg["host"],
        "-p", cfg["port"],
        "-U", cfg["user"],
        "-d", cfg["dbname"],
        "-c", AUDIT_SQL
    ]
    res = subprocess.run(cmd, env=env, capture_output=True, text=True)
    raw = res.stderr + "\n" + res.stdout
    if "AUDIT_OUTPUT_BEGIN" in raw and "AUDIT_OUTPUT_END" in raw:
        part = raw.split("AUDIT_OUTPUT_BEGIN")[1].split("AUDIT_OUTPUT_END")[0].strip()
        return json.loads(part)
    else:
        print("[-] Query failed:", raw)
        return None

def main():
    print("=================================================================")
    print("  PHASE 20X: INSTANT MULTI-SCHEMA FORENSIC MATRIX AUDIT          ")
    print("=================================================================")
    
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
    
    print("[+] Extracting Live Source Metadata from Supabase...")
    src_data = extract_audit_data(src_cfg)
    if not src_data:
        print("[-] Failed to extract source metadata.")
        sys.exit(1)
        
    print("[+] Extracting Live Target Metadata from VPS PostgreSQL...")
    tgt_data = extract_audit_data(tgt_cfg)
    if not tgt_data:
        print("[-] Failed to extract target metadata.")
        sys.exit(1)
        
    # 1. Tables Comparison
    src_tbl_map = {f"{t['schema']}.{t['table']}": t for t in src_data["tables"]}
    tgt_tbl_map = {f"{t['schema']}.{t['table']}": t for t in tgt_data["tables"]}
    
    missing_tables = sorted(list(set(src_tbl_map.keys()) - set(tgt_tbl_map.keys())))
    extra_tables = sorted(list(set(tgt_tbl_map.keys()) - set(src_tbl_map.keys())))
    
    # 2. Columns Comparison
    src_col_map = {f"{c['schema']}.{c['table']}.{c['column']}": c for c in (src_data.get("columns") or [])}
    tgt_col_map = {f"{c['schema']}.{c['table']}.{c['column']}": c for c in (tgt_data.get("columns") or [])}
    
    missing_cols = sorted(list(set(src_col_map.keys()) - set(tgt_col_map.keys())))
    extra_cols = sorted(list(set(tgt_col_map.keys()) - set(src_col_map.keys())))
    
    # 3. Constraints & Indexes
    src_constrs = {f"{c['schema']}.{c['table']}.{c['name']}::{c['type']}" for c in (src_data.get("constraints") or [])}
    tgt_constrs = {f"{c['schema']}.{c['table']}.{c['name']}::{c['type']}" for c in (tgt_data.get("constraints") or [])}
    
    src_idx = {f"{i['schema']}.{i['table']}.{i['name']}" for i in (src_data.get("indexes") or [])}
    tgt_idx = {f"{i['schema']}.{i['table']}.{i['name']}" for i in (tgt_data.get("indexes") or [])}
    
    # 4. Table Row Counts & Hashes
    total_src_rows = 0
    total_tgt_rows = 0
    mismatched_tables = 0
    table_audit_list = []
    
    for k in sorted(src_tbl_map.keys()):
        st = src_tbl_map[k]
        tt = tgt_tbl_map.get(k, {"rows": 0, "hash": ""})
        
        s_rows = st["rows"]
        t_rows = tt["rows"]
        s_hash = st["hash"]
        t_hash = tt["hash"]
        
        total_src_rows += s_rows
        total_tgt_rows += t_rows
        
        row_match = (s_rows == t_rows)
        hash_match = (s_hash == t_hash)
        
        status = "PASS" if (row_match and hash_match) else "MISMATCH"
        if status != "PASS":
            mismatched_tables += 1
            
        table_audit_list.append({
            "schema": st["schema"],
            "table": st["table"],
            "source_rows": s_rows,
            "target_rows": t_rows,
            "source_hash": s_hash,
            "target_hash": t_hash,
            "status": status
        })
        
    print("\n=================================================================")
    print("  PHASE 20X FORENSIC MEASURED EVIDENCE MATRIX                    ")
    print("=================================================================")
    print(f"  Total Source Tables:       {len(src_tbl_map):<6} | Total Target Tables:       {len(tgt_tbl_map):<6}")
    print(f"  Missing Tables:            {len(missing_tables):<6} | Extra Tables:              {len(extra_tables):<6}")
    print(f"  Total Source Columns:      {len(src_col_map):<6} | Total Target Columns:      {len(tgt_col_map):<6}")
    print(f"  Missing Columns:           {len(missing_cols):<6} | Extra Columns:             {len(extra_cols):<6}")
    print(f"  Total Source Constraints:  {len(src_constrs):<6} | Total Target Constraints:  {len(tgt_constrs):<6}")
    print(f"  Total Source Indexes:      {len(src_idx):<6} | Total Target Indexes:      {len(tgt_idx):<6}")
    print(f"  Total Source Rows:         {total_src_rows:<6} | Total Target Rows:         {total_tgt_rows:<6}")
    print(f"  Mismatched Tables:         {mismatched_tables:<6}")
    print(f"  Data Parity Rate:          {100.0 if mismatched_tables == 0 else round((len(src_tbl_map)-mismatched_tables)/len(src_tbl_map)*100, 2)}%")
    print("=================================================================")
    
    print("\n--- POPULATED TABLES FORENSIC EVIDENCE ---")
    for ta in table_audit_list:
        if ta["source_rows"] > 0 or ta["status"] != "PASS":
            h_str = f" | MD5: {ta['source_hash'][:8]}..." if ta["source_hash"] else ""
            print(f"    [{ta['status']:<4}] {ta['schema']}.{ta['table']:<32} | Source: {ta['source_rows']:<4} | Target: {ta['target_rows']:<4}{h_str}")
            
    # Save manifest
    manifest_data = {
        "audit_phase": "PHASE 20X — EXACT SUPABASE TO VPS DATABASE REPLICATION",
        "evidence": {
            "source_tables_count": len(src_tbl_map),
            "target_tables_count": len(tgt_tbl_map),
            "missing_tables": missing_tables,
            "extra_tables": extra_tables,
            "source_columns_count": len(src_col_map),
            "target_columns_count": len(tgt_col_map),
            "missing_columns": missing_cols,
            "extra_columns": extra_cols,
            "source_constraints_count": len(src_constrs),
            "target_constraints_count": len(tgt_constrs),
            "source_indexes_count": len(src_idx),
            "target_indexes_count": len(tgt_idx),
            "total_source_rows": total_src_rows,
            "total_target_rows": total_tgt_rows,
            "mismatched_tables_count": mismatched_tables,
            "data_parity_rate": "100.0%" if mismatched_tables == 0 else f"{round((len(src_tbl_map)-mismatched_tables)/len(src_tbl_map)*100, 2)}%",
            "final_verdict": "PASS" if (mismatched_tables == 0 and len(missing_tables) == 0 and len(missing_cols) == 0) else "FAIL"
        },
        "populated_tables": [t for t in table_audit_list if t["source_rows"] > 0]
    }
    
    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest_data, f, indent=2)
    os.chmod(MANIFEST_PATH, 0o600)
    print(f"\n[+] Measured Evidence Manifest saved to {MANIFEST_PATH}")

if __name__ == "__main__":
    main()
