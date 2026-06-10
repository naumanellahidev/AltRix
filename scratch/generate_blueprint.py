import os
import re
import json
import glob

WORKSPACE = "d:/Altrix Duplicate"
MIGRATIONS_DIR = os.path.join(WORKSPACE, "supabase/migrations")
TYPES_FILE = os.path.join(WORKSPACE, "src/integrations/supabase/types.ts")
SRC_DIR = os.path.join(WORKSPACE, "src")
OUTPUT_FILE = os.path.join(WORKSPACE, "scratch/analysis_output.json")

def parse_types_ts():
    if not os.path.exists(TYPES_FILE):
        return {"tables": {}, "views": {}, "enums": {}}

    with open(TYPES_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    # We will use brace matching to extract the content of Tables, Views, and Enums under public
    public_match = re.search(r"public:\s*\{", content)
    if not public_match:
        return {"tables": {}, "views": {}, "enums": {}}

    # Find the outer braces for public
    start_idx = public_match.end()
    
    # We want to find the top-level blocks inside public: Tables, Views, Enums
    # Let's search for "Tables: {" inside public
    tables = {}
    views = {}
    enums = {}

    tables_match = re.search(r"Tables:\s*\{", content[start_idx:])
    if tables_match:
        t_start = start_idx + tables_match.end()
        # Parse tables
        t_content, _ = extract_braces_content(content, t_start)
        tables = parse_tables_block(t_content)

    views_match = re.search(r"Views:\s*\{", content[start_idx:])
    if views_match:
        v_start = start_idx + views_match.end()
        v_content, _ = extract_braces_content(content, v_start)
        views = parse_views_block(v_content)

    enums_match = re.search(r"Enums:\s*\{", content[start_idx:])
    if enums_match:
        e_start = start_idx + enums_match.end()
        e_content, _ = extract_braces_content(content, e_start)
        enums = parse_enums_block(e_content)

    return {"tables": tables, "views": views, "enums": enums}

def extract_braces_content(text, start_idx):
    depth = 1
    idx = start_idx
    while idx < len(text) and depth > 0:
        char = text[idx]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        idx += 1
    return text[start_idx:idx-1], idx

def parse_tables_block(block_text):
    tables = {}
    depth = 0
    idx = 0
    while idx < len(block_text):
        char = block_text[idx]
        if char == "{":
            if depth == 0:
                key_text = block_text[max(0, idx-100):idx]
                match = re.search(r"([a-zA-Z_0-9]+):\s*$", key_text)
                if match:
                    tname = match.group(1)
                    tbl_block, next_idx = extract_braces_content(block_text, idx + 1)
                    tables[tname] = parse_single_table(tbl_block, tname)
                    idx = next_idx
                    continue
            depth += 1
        elif char == "}":
            depth -= 1
        idx += 1
    return tables

def parse_single_table(tbl_block, tname):
    # Find Row block
    row_match = re.search(r"Row:\s*\{", tbl_block)
    columns = {}
    if row_match:
        r_start = row_match.end()
        row_content, _ = extract_braces_content(tbl_block, r_start)
        # Parse columns line by line
        for line in row_content.splitlines():
            line = line.strip()
            if not line or line.startswith("//"):
                continue
            col_match = re.match(r"([a-zA-Z_0-9]+):\s*(.*)$", line)
            if col_match:
                cname = col_match.group(1)
                ctype = col_match.group(2).strip()
                # Determine nullable status: check if type contains "| null" or is optional
                nullable = "| null" in ctype or ctype.endswith("null")
                clean_type = ctype.replace("| null", "").strip()
                columns[cname] = {
                    "name": cname,
                    "type": clean_type,
                    "nullable": nullable,
                    "default": None # Filled from migrations
                }

    # Find Relationships block
    rel_match = re.search(r"Relationships:\s*\[", tbl_block)
    relationships = []
    if rel_match:
        # Relationships is an array of objects
        r_start = rel_match.end()
        # Extract bracket content
        depth = 1
        idx = r_start
        while idx < len(tbl_block) and depth > 0:
            char = tbl_block[idx]
            if char == "[":
                depth += 1
            elif char == "]":
                depth -= 1
            idx += 1
        rel_content = tbl_block[r_start:idx-1]
        
        # Parse individual relationship objects: { foreignKeyName: ... }
        obj_matches = re.finditer(r"\{\s*foreignKeyName:\s*\"([^\"]+)\"\s*columns:\s*\[([^\]]+)\]\s*isOneToOne:\s*([a-z]+)\s*referencedRelation:\s*\"([^\"]+)\"\s*referencedColumns:\s*\[([^\]]+)\]\s*\}", rel_content)
        for om in obj_matches:
            fk_name = om.group(1)
            cols = [c.strip().strip('"') for c in om.group(2).split(",")]
            one_to_one = om.group(3) == "true"
            ref_rel = om.group(4)
            ref_cols = [c.strip().strip('"') for c in om.group(5).split(",")]
            relationships.append({
                "foreignKeyName": fk_name,
                "columns": cols,
                "isOneToOne": one_to_one,
                "referencedRelation": ref_rel,
                "referencedColumns": ref_cols
            })

    return {
        "name": tname,
        "columns": columns,
        "relationships": relationships,
        "primary_key": [],
        "unique_constraints": [],
        "rls_enabled": False,
        "policies": [],
        "purpose": get_table_purpose(tname)
    }

def parse_views_block(block_text):
    views = {}
    depth = 0
    idx = 0
    while idx < len(block_text):
        char = block_text[idx]
        if char == "{":
            if depth == 0:
                key_text = block_text[max(0, idx-100):idx]
                match = re.search(r"([a-zA-Z_0-9]+):\s*$", key_text)
                if match:
                    vname = match.group(1)
                    view_block, next_idx = extract_braces_content(block_text, idx + 1)
                    # Parse columns of the view from the Row block
                    row_match = re.search(r"Row:\s*\{", view_block)
                    columns = []
                    if row_match:
                        r_start = row_match.end()
                        row_content, _ = extract_braces_content(view_block, r_start)
                        for line in row_content.splitlines():
                            line = line.strip()
                            if not line or line.startswith("//"):
                                continue
                            col_match = re.match(r"([a-zA-Z_0-9]+):\s*(.*)$", line)
                            if col_match:
                                columns.append(col_match.group(1))
                    views[vname] = {
                        "name": vname,
                        "columns": columns
                    }
                    idx = next_idx
                    continue
            depth += 1
        elif char == "}":
            depth -= 1
        idx += 1
    return views

def parse_enums_block(block_text):
    enums = {}
    for line in block_text.splitlines():
        line = line.strip()
        if not line or line.startswith("//"):
            continue
        # Format is name: "val1" | "val2" | ...
        match = re.match(r"([a-zA-Z_0-9]+):\s*(.*)$", line)
        if match:
            ename = match.group(1)
            vals_str = match.group(2).strip().rstrip(",")
            vals = [v.strip().strip('"\'') for v in vals_str.split("|")]
            enums[ename] = vals
    return enums

def get_table_purpose(tname):
    purposes = {
        "schools": "Core school settings and multi-tenant scoping.",
        "profiles": "Global user profiles mapped to auth.users.",
        "school_memberships": "Resolves user mapping to specific school instances.",
        "user_roles": "Assigns RBAC roles to users within a specific school scope.",
        "school_branding": "White-labeling visual customization options per school tenant.",
        "audit_logs": "Tracks user actions, touched entities, and metadata for audit trails.",
        "campuses": "Defines physical campus sites under a school tenant.",
        "academic_classes": "Stores educational class entities (e.g., Grade 1, Class A).",
        "class_sections": "Stores subdivisions/sections of academic classes.",
        "subjects": "Stores course curriculum details mapped to classes.",
        "teachers": "Profiles and schedules for faculty members.",
        "students": "Detailed profile tracking for enrolled students.",
        "parents": "Detailed profile tracking for students' parents/guardians.",
        "parent_student_mappings": "Many-to-many lookup linking student profiles to parent profiles.",
        "student_admissions": "Detailed admissions history, documents, and status.",
        "staff_attendance": "Daily presence/absence tracking and check-in times for staff.",
        "student_attendance": "Daily presence/absence tracking for students.",
        "exams": "Stores examinations scheduling, syllabus, and metadata.",
        "exam_results": "Stores grade-book records and exam results for students.",
        "diary_notes": "Teacher-student-parent interaction logs and student diary notes.",
        "notices": "Digital notice board announcements and circulars.",
        "holidays": "Calendar event details for school holidays and closures.",
        "messaging_channels": "Chat rooms / channels for communication between roles.",
        "messaging_messages": "Chat channel posts and message logs.",
        "messaging_participants": "Participants within a chat room channel.",
        "notifications": "In-app system notifications and alerts.",
        "timetable_entries": "Weekly schedules and periods for subjects and classes.",
        "ai_academic_predictions": "AI analysis of student progress and failure warnings.",
        "ai_career_suggestions": "AI suggestions of career paths based on student grades.",
        "ai_counseling_queue": "AI identification of students needing mental health or academic support.",
        "ai_early_warnings": "Early warning indicators based on low attendance or poor grades.",
        "platform_billing_plans": "Platform-wide subscription plan levels.",
        "platform_subscriptions": "Subscription records of school tenants on billing plans.",
        "platform_super_admins": "Master platform administrators who bypass RLS.",
        "fee_structures": "Predefined cost outlines for grades/classes.",
        "fee_allocations": "Fee structure instance values assigned to specific students.",
        "fee_payments": "Payment logs and invoices for student allocations.",
        "budget_scenarios": "Financial modeling tools for admins.",
        "pt_collaboration_hub": "Parent-Teacher collaboration hub items.",
    }
    for k, v in purposes.items():
        if k in tname:
            return v
    return "Stores data related to " + tname.replace("_", " ") + " module."

def parse_migrations_for_details(tables):
    migration_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
    
    # We want to search for:
    # 1. Defaults for columns (e.g., "DEFAULT ...")
    # 2. Indexes
    # 3. Triggers
    # 4. Functions
    # 5. RLS policies
    # 6. Primary keys / uniques
    
    indexes = []
    triggers = []
    functions = []
    policies = []
    migrations_summary = []

    # Non-greedy/simple regex patterns
    index_re = re.compile(r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_0-9]+)\s+ON\s+(?:public\.)?([a-zA-Z_0-9]+)\s*\((.*?)\)", re.IGNORECASE)
    policy_re = re.compile(r"CREATE\s+POLICY\s+\"([^\"]+)\"\s+ON\s+(?:public\.)?([a-zA-Z_0-9]+)(.*?)(?:USING|WITH\s+CHECK)", re.IGNORECASE)
    rls_enable_re = re.compile(r"ALTER\s+TABLE\s+(?:public\.)?([a-zA-Z_0-9]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY", re.IGNORECASE)
    trigger_re = re.compile(r"CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([a-zA-Z_0-9]+)\s+(?:BEFORE|AFTER)\s+([a-zA-Z_0-9\s]+)\s+ON\s+(?:public\.)?([a-zA-Z_0-9]+)\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?([a-zA-Z_0-9]+)", re.IGNORECASE)
    func_re = re.compile(r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_0-9]+)\s*\((.*?)\)\s+RETURNS\s+(.*?)\s+LANGUAGE\s+([a-zA-Z_]+)", re.IGNORECASE)
    
    for fpath in migration_files:
        fname = os.path.basename(fpath)
        # Extract date from name
        date_match = re.search(r"(\d{4})(\d{2})(\d{2})", fname)
        m_date = f"{date_match.group(1)}-{date_match.group(2)}-{date_match.group(3)}" if date_match else "2026-01-01"
        
        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        affected_tables = set()
        added_cols = []
        added_idx = []
        added_pol = []

        # Find RLS enable
        for m in rls_enable_re.finditer(content):
            tname = m.group(1)
            affected_tables.add(tname)
            if tname in tables:
                tables[tname]["rls_enabled"] = True

        # Find indexes
        for m in index_re.finditer(content):
            iname = m.group(1)
            tname = m.group(2)
            icols = m.group(3)
            affected_tables.add(tname)
            idx_entry = {
                "name": iname,
                "table": tname,
                "columns": [c.strip().strip('"') for c in icols.split(",")],
                "unique": "unique" in m.group(0).lower()
            }
            indexes.append(idx_entry)
            added_idx.append(iname)

        # Find triggers
        for m in trigger_re.finditer(content):
            trg_name = m.group(1)
            trg_event = m.group(2)
            tname = m.group(3)
            trg_func = m.group(4)
            affected_tables.add(tname)
            triggers.append({
                "name": trg_name,
                "table": tname,
                "event": trg_event.strip(),
                "function": trg_func
            })

        # Find functions
        for m in func_re.finditer(content):
            fname_val = m.group(1)
            fargs = m.group(2)
            fret = m.group(3)
            flang = m.group(4)
            functions.append({
                "name": fname_val,
                "arguments": fargs.strip(),
                "returns": fret.strip(),
                "language": flang.strip()
            })

        # Find column defaults and check constraints in SQL
        # We can look for alter table statements or inline column defaults
        # Simple scan
        for tname in tables:
            # Inline column default: e.g. column_name data_type DEFAULT default_val
            # Let's search for column defaults for this specific table
            table_pat = re.compile(rf"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?{tname}\s*\((.*?)\);", re.IGNORECASE | re.DOTALL)
            m_tbl = table_pat.search(content)
            if m_tbl:
                body = m_tbl.group(1)
                affected_tables.add(tname)
                # Primary key inline
                pk_match = re.search(r"PRIMARY\s+KEY\s*\((.*?)\)", body, re.IGNORECASE)
                if pk_match:
                    tables[tname]["primary_key"] = [c.strip().strip('"') for c in pk_match.group(1).split(",")]
                
                # Check columns defaults
                for col_name in tables[tname]["columns"]:
                    # Look for: col_name type DEFAULT val
                    col_pat = re.compile(rf"\b{col_name}\b[^,)]*?DEFAULT\s+((?:[a-zA-Z_0-9]+(?:\(.*?\))?)|(?:'[^']*')|(?:[0-9.]+)|(?:\{{.*?\}}))", re.IGNORECASE)
                    m_col = col_pat.search(body)
                    if m_col:
                        tables[tname]["columns"][col_name]["default"] = m_col.group(1).strip()
                    
                    # Check inline primary key
                    if re.search(rf"\b{col_name}\b[^,)]*?PRIMARY\s+KEY", body, re.IGNORECASE):
                        if col_name not in tables[tname]["primary_key"]:
                            tables[tname]["primary_key"].append(col_name)

                    # Check inline unique
                    if re.search(rf"\b{col_name}\b[^,)]*?UNIQUE", body, re.IGNORECASE):
                        if [col_name] not in tables[tname]["unique_constraints"]:
                            tables[tname]["unique_constraints"].append([col_name])

            # Alter table defaults
            alter_pat = re.compile(rf"ALTER\s+TABLE\s+(?:public\.)?{tname}\s+ALTER\s+(?:COLUMN\s+)?([a-zA-Z_0-9]+)\s+SET\s+DEFAULT\s+(.*?)(?:;|$)", re.IGNORECASE)
            for m_alt in alter_pat.finditer(content):
                cname = m_alt.group(1)
                def_val = m_alt.group(2).strip()
                affected_tables.add(tname)
                if cname in tables[tname]["columns"]:
                    tables[tname]["columns"][cname]["default"] = def_val

        # Scan for policies (we need to be careful with policy body, let's scan statement by statement)
        statements = content.split(";")
        for stmt in statements:
            stmt = stmt.strip()
            if not stmt:
                continue
            pol_stmt = re.match(r"CREATE\s+POLICY\s+\"([^\"]+)\"\s+ON\s+(?:public\.)?([a-zA-Z_0-9]+)\s+(.*?)$", stmt, re.IGNORECASE | re.DOTALL)
            if pol_stmt:
                pname = pol_stmt.group(1)
                tname = pol_stmt.group(2)
                rest = pol_stmt.group(3)
                
                paction = "ALL"
                if "for select" in rest.lower():
                    paction = "SELECT"
                elif "for insert" in rest.lower():
                    paction = "INSERT"
                elif "for update" in rest.lower():
                    paction = "UPDATE"
                elif "for delete" in rest.lower():
                    paction = "DELETE"
                
                proles = "public"
                to_match = re.search(r"\bTO\s+([a-zA-Z_0-9, ]+)\b", rest, re.IGNORECASE)
                if to_match:
                    proles = to_match.group(1).strip()
                
                pusing = None
                pcheck = None
                using_match = re.search(r"USING\s*\((.*?)\)(?:\s+WITH\s+CHECK|$)", rest, re.IGNORECASE | re.DOTALL)
                if using_match:
                    pusing = using_match.group(1).strip()
                check_match = re.search(r"WITH\s+CHECK\s*\((.*?)\)$", rest, re.IGNORECASE | re.DOTALL)
                if check_match:
                    pcheck = check_match.group(1).strip()

                pol_entry = {
                    "name": pname,
                    "table": tname,
                    "action": paction,
                    "roles": [r.strip() for r in proles.split(",")],
                    "using": pusing,
                    "check": pcheck
                }
                policies.append(pol_entry)
                added_pol.append(pname)
                affected_tables.add(tname)
                if tname in tables:
                    # Avoid duplicates
                    if not any(p["name"] == pname for p in tables[tname]["policies"]):
                        tables[tname]["policies"].append(pol_entry)

        if affected_tables:
            migrations_summary.append({
                "name": fname,
                "date": m_date,
                "affected_tables": list(affected_tables),
                "added_columns": added_cols,
                "added_indexes": added_idx,
                "added_policies": added_pol
            })

    return indexes, triggers, functions, policies, migrations_summary

def scan_src_queries():
    api_interactions = []
    # Recursively scan src for supabase calls
    for root, dirs, files in os.walk(SRC_DIR):
        for f in files:
            if not f.endswith((".ts", ".tsx", ".js", ".jsx")):
                continue
            
            fpath = os.path.join(root, f)
            relpath = os.path.relpath(fpath, WORKSPACE)
            
            # Skip build files or node_modules (though os.walk doesn't touch node_modules if not in path)
            if "node_modules" in fpath or "dist" in fpath:
                continue

            with open(fpath, "r", encoding="utf-8", errors="ignore") as file:
                lines = file.readlines()
            
            for idx, line in enumerate(lines):
                # Look for supabase.from('table')
                from_match = re.search(r"supabase\s*\.\s*from\s*\(\s*['\"]([a-zA-Z_0-9]+)['\"]", line)
                if from_match:
                    table = from_match.group(1)
                    action = "query"
                    surr = "".join(lines[max(0, idx-1):min(len(lines), idx+6)])
                    if "select" in surr:
                        action = "select"
                    elif "insert" in surr:
                        action = "insert"
                    elif "update" in surr:
                        action = "update"
                    elif "delete" in surr:
                        action = "delete"
                    elif "upsert" in surr:
                        action = "upsert"
                        
                    api_interactions.append({
                        "file": relpath,
                        "line": idx + 1,
                        "table": table,
                        "action": action,
                        "code": line.strip()
                    })
                
                # Look for supabase.rpc('function')
                rpc_match = re.search(r"supabase\s*\.\s*rpc\s*\(\s*['\"]([a-zA-Z_0-9]+)['\"]", line)
                if rpc_match:
                    func = rpc_match.group(1)
                    api_interactions.append({
                        "file": relpath,
                        "line": idx + 1,
                        "table": f"RPC: {func}",
                        "action": "rpc",
                        "code": line.strip()
                    })

    return api_interactions

def main():
    print("Parsing types.ts...")
    types_data = parse_types_ts()
    
    print("Parsing migrations for details...")
    indexes, triggers, functions, policies, migrations_summary = parse_migrations_for_details(types_data["tables"])
    
    print("Scanning src directory for API interactions...")
    api_interactions = scan_src_queries()
    
    output = {
        "tables": types_data["tables"],
        "views": types_data["views"],
        "enums": types_data["enums"],
        "indexes": indexes,
        "triggers": triggers,
        "functions": functions,
        "policies": policies,
        "migrations": migrations_summary,
        "api_interactions": api_interactions
    }
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
        
    print(f"Data analysis complete. Output size: {os.path.getsize(OUTPUT_FILE)} bytes.")

if __name__ == "__main__":
    main()
