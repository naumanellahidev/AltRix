#!/usr/bin/env python3
"""Check profiles columns and re-run auth flow test with correct column names"""
import subprocess, os

VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
admin_pass = ""
with open(VPS_PG_CONFIG) as f:
    for line in f:
        if line.startswith("VPS_PG_ADMIN_PASSWORD="):
            admin_pass = line.split("=", 1)[1].strip().strip("\"'")

env = dict(os.environ, PGPASSWORD=admin_pass)

def psql(sql):
    r = subprocess.run(["psql", "-h", "127.0.0.1", "-p", "5432", "-U", "altrix_admin", "-d", "altrix", "-c", sql],
                       env=env, capture_output=True, text=True)
    return r.stdout.strip(), r.stderr.strip()

# 1. Get profiles columns
print("=== PROFILES TABLE COLUMNS ===")
out, err = psql("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position;")
print(out)

# 2. Try with first_name/last_name
print("\n=== AUTH FLOW TEST (first_name + last_name) ===")
out, err = psql("""
    SELECT u.id, u.email, 
           COALESCE(p.first_name || ' ' || p.last_name, 'N/A') as name,
           COALESCE(r.role, 'N/A') as role
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.user_roles r ON r.user_id = u.id
    LIMIT 5;
""")
if err:
    print(f"  ERROR: {err}")
    # Try with just 'name' column
    print("\n=== AUTH FLOW TEST (name) ===")
    out, err = psql("""
        SELECT u.id, u.email, 
               COALESCE(p.name, 'N/A') as name,
               COALESCE(r.role, 'N/A') as role
        FROM auth.users u
        LEFT JOIN public.profiles p ON p.id = u.id
        LEFT JOIN public.user_roles r ON r.user_id = u.id
        LIMIT 5;
    """)
    if err:
        print(f"  ERROR: {err}")
        # Just try the join without profiles name column
        print("\n=== AUTH FLOW TEST (minimal - no name) ===")
        out, err = psql("""
            SELECT u.id, u.email, r.role
            FROM auth.users u
            LEFT JOIN public.user_roles r ON r.user_id = u.id
            LIMIT 5;
        """)
print(out)
if err:
    print(f"  ERROR: {err}")

# 3. Count auth users that have profiles
print("\n=== AUTH-PROFILE MATCH COUNT ===")
out, _ = psql("SELECT count(*) FROM auth.users u INNER JOIN public.profiles p ON p.id = u.id;")
print(out)

# 4. Count auth users that have roles
print("\n=== AUTH-ROLE MATCH COUNT ===")
out, _ = psql("SELECT count(*) FROM auth.users u INNER JOIN public.user_roles r ON r.user_id = u.id;")
print(out)
