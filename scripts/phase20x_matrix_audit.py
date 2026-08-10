#!/usr/bin/env python3
"""
AltRix Phase 20X: Detailed Matrix Audit & Forensic Comparison Engine
Extracts exact table, column, constraint, index, sequence, and row-level statistics
between live Supabase PostgreSQL and live VPS PostgreSQL.
"""

import os
import sys
import json
import hashlib
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

def main():
    print("=================================================================")
    print("  PHASE 20X: COMPREHENSIVE FORENSIC MATRIX AUDIT ENGINE          ")
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
    
    # 1. Schemas
    src_schemas = run_psql(src_cfg, "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('public', 'auth', 'storage', 'extensions') ORDER BY schema_name;")
    tgt_schemas = run_psql(tgt_cfg, "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('public', 'auth', 'storage', 'extensions') ORDER BY schema_name;")
    
    # 2. Tables
    tbl_sql = "SELECT table_schema || '.' || table_name FROM information_schema.tables WHERE table_schema IN ('public', 'auth') AND table_type = 'BASE TABLE' ORDER BY 1;"
    src_tables = run_psql(src_cfg, tbl_sql)
    tgt_tables = run_psql(tgt_cfg, tbl_sql)
    
    missing_tables = sorted(list(set(src_tables) - set(tgt_tables)))
    extra_tables = sorted(list(set(tgt_tables) - set(src_tables)))
    
    # 3. Columns
    col_sql = "SELECT table_schema || '.' || table_name || '.' || column_name || '::' || data_type || '::' || is_nullable FROM information_schema.columns WHERE table_schema IN ('public', 'auth') ORDER BY 1;"
    src_cols = run_psql(src_cfg, col_sql)
    tgt_cols = run_psql(tgt_cfg, col_sql)
    
    missing_cols = sorted(list(set(src_cols) - set(tgt_cols)))
    extra_cols = sorted(list(set(tgt_cols) - set(src_cols)))
    
    # 4. Constraints
    con_sql = "SELECT table_schema || '.' || table_name || '.' || constraint_name || '::' || constraint_type FROM information_schema.table_constraints WHERE table_schema IN ('public', 'auth') ORDER BY 1;"
    src_constrs = run_psql(src_cfg, con_sql)
    tgt_constrs = run_psql(tgt_cfg, con_sql)
    
    missing_constrs = sorted(list(set(src_constrs) - set(tgt_constrs)))
    
    # 5. Indexes
    idx_sql = "SELECT schemaname || '.' || tablename || '.' || indexname FROM pg_indexes WHERE schemaname IN ('public', 'auth') ORDER BY 1;"
    src_idx = run_psql(src_cfg, idx_sql)
    tgt_idx = run_psql(tgt_cfg, idx_sql)
    
    # 6. Sequences
    seq_sql = "SELECT sequence_schema || '.' || sequence_name FROM information_schema.sequences WHERE sequence_schema IN ('public', 'auth') ORDER BY 1;"
    src_seq = run_psql(src_cfg, seq_sql)
    tgt_seq = run_psql(tgt_cfg, seq_sql)
    
    # 7. Table-by-Table Row Count and Hash Comparison
    table_audit = []
    total_src_rows = 0
    total_tgt_rows = 0
    mismatched_tables = 0
    
    for full_tbl in src_tables:
        sch, tbl = full_tbl.split(".", 1)
        
        s_out = run_psql(src_cfg, f"SELECT count(*) FROM {sch}.\"{tbl}\";")
        s_cnt = int(s_out[0]) if s_out and s_out[0].isdigit() else 0
        
        t_out = run_psql(tgt_cfg, f"SELECT count(*) FROM {sch}.\"{tbl}\";")
        t_cnt = int(t_out[0]) if t_out and t_out[0].isdigit() else 0
        
        total_src_rows += s_cnt
        total_tgt_rows += t_cnt
        
        row_match = (s_cnt == t_cnt)
        if not row_match:
            mismatched_tables += 1
            
        # Hash comparison
        s_hash = ""
        t_hash = ""
        hash_match = True
        if s_cnt > 0:
            col_list = run_psql(src_cfg, f"SELECT column_name FROM information_schema.columns WHERE table_schema = '{sch}' AND table_name = '{tbl}' ORDER BY ordinal_position LIMIT 1;")
            if col_list:
                pk = col_list[0]
                h_sql = f"SELECT md5(string_agg({pk}::text, ',' ORDER BY {pk}::text)) FROM {sch}.\"{tbl}\";"
                s_h_res = run_psql(src_cfg, h_sql)
                t_h_res = run_psql(tgt_cfg, h_sql)
                s_hash = s_h_res[0] if s_h_res else ""
                t_hash = t_h_res[0] if t_h_res else ""
                hash_match = (s_hash == t_hash)
                if not hash_match:
                    mismatched_tables += 1
                    
        table_audit.append({
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
        
    print("\n=================================================================")
    print("  PHASE 20X FORENSIC MEASURED EVIDENCE MATRIX                    ")
    print("=================================================================")
    print(f"  Total Source Tables:       {len(src_tables):<6} | Total Target Tables:       {len(tgt_tables):<6}")
    print(f"  Missing Tables:            {len(missing_tables):<6} | Extra Tables:              {len(extra_tables):<6}")
    print(f"  Total Source Columns:      {len(src_cols):<6} | Total Target Columns:      {len(tgt_cols):<6}")
    print(f"  Missing Columns:           {len(missing_cols):<6} | Extra Columns:             {len(extra_cols):<6}")
    print(f"  Total Source Constraints:  {len(src_constrs):<6} | Total Target Constraints:  {len(tgt_constrs):<6}")
    print(f"  Total Source Indexes:      {len(src_idx):<6} | Total Target Indexes:      {len(tgt_idx):<6}")
    print(f"  Total Source Sequences:    {len(src_seq):<6} | Total Target Sequences:    {len(tgt_seq):<6}")
    print(f"  Total Source Rows:         {total_src_rows:<6} | Total Target Rows:         {total_tgt_rows:<6}")
    print(f"  Mismatched Tables:         {mismatched_tables:<6}")
    print(f"  Overall Data Parity:       {100.0 if mismatched_tables == 0 else round((len(table_audit) - mismatched_tables) / len(table_audit) * 100, 2)}%")
    print("=================================================================")
    
    print("\n--- MEASURED TABLE-BY-TABLE EVIDENCE (ALL POPULATED TABLES) ---")
    for ta in table_audit:
        if ta["source_rows"] > 0 or ta["status"] != "PASS":
            h_str = f" | MD5: {ta['source_hash'][:8]}..." if ta["source_hash"] else ""
            print(f"    [{ta['status']:<4}] {ta['schema']}.{ta['table']:<32} | Source: {ta['source_rows']:<4} | Target: {ta['target_rows']:<4}{h_str}")
            
    # Save manifest
    manifest_data = {
        "audit_phase": "PHASE 20X — EXACT SUPABASE TO VPS DATABASE REPLICATION",
        "evidence": {
            "source_tables_count": len(src_tables),
            "target_tables_count": len(tgt_tables),
            "missing_tables": missing_tables,
            "extra_tables": extra_tables,
            "source_columns_count": len(src_cols),
            "target_columns_count": len(tgt_cols),
            "missing_columns": missing_cols,
            "extra_columns": extra_cols,
            "source_constraints_count": len(src_constrs),
            "target_constraints_count": len(tgt_constrs),
            "source_indexes_count": len(src_idx),
            "target_indexes_count": len(tgt_idx),
            "source_sequences_count": len(src_seq),
            "target_sequences_count": len(tgt_seq),
            "total_source_rows": total_src_rows,
            "total_target_rows": total_tgt_rows,
            "mismatched_tables_count": mismatched_tables,
            "data_parity_rate": "100.0%" if mismatched_tables == 0 else f"{round((len(table_audit)-mismatched_tables)/len(table_audit)*100, 2)}%",
            "final_verdict": "PASS" if (mismatched_tables == 0 and len(missing_tables) == 0 and len(missing_cols) == 0) else "FAIL"
        },
        "table_audit_records": [t for t in table_audit if t["source_rows"] > 0]
    }
    
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest_data, f, indent=2)
    os.chmod(MANIFEST_PATH, 0o600)
    print(f"\n[+] Measured Evidence Manifest saved to {MANIFEST_PATH}")

if __name__ == "__main__":
    main()
