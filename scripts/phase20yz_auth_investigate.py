#!/usr/bin/env python3
"""Investigate auth.users for Step 7 auth flow test"""
import subprocess, os

VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
admin_pass = ""
if os.path.exists(VPS_PG_CONFIG):
    with open(VPS_PG_CONFIG) as f:
        for line in f:
            if line.startswith("VPS_PG_ADMIN_PASSWORD="):
                admin_pass = line.split("=", 1)[1].strip().strip("\"'")

env = dict(os.environ, PGPASSWORD=admin_pass)

queries = [
    ("auth.users count", "SELECT count(*) FROM auth.users;"),
    ("auth.users columns", "SELECT column_name FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' ORDER BY ordinal_position;"),
    ("auth.users sample (id, email)", "SELECT id, email FROM auth.users LIMIT 3;"),
    ("profiles count", "SELECT count(*) FROM public.profiles;"),
    ("user_roles count", "SELECT count(*) FROM public.user_roles;"),
    ("auth+profile JOIN", "SELECT u.id, u.email, COALESCE(p.full_name, 'N/A') FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id LIMIT 3;"),
    ("auth+profile+role JOIN", "SELECT u.id, u.email, COALESCE(p.full_name, 'N/A'), COALESCE(r.role, 'N/A') FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id LEFT JOIN public.user_roles r ON r.user_id = u.id LIMIT 5;"),
    ("RLS on auth.users?", "SELECT relname, relrowsecurity FROM pg_class WHERE relname='users' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='auth');"),
    ("user_roles.user_id type", "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='user_roles' AND column_name='user_id';"),
    ("profiles.id type", "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='id';"),
    ("auth.users.id type", "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='id';"),
]

for label, sql in queries:
    r = subprocess.run(
        ["psql", "-h", "127.0.0.1", "-p", "5432", "-U", "altrix_admin", "-d", "altrix", "-c", sql],
        env=env, capture_output=True, text=True
    )
    print(f"\n=== {label} ===")
    print(r.stdout.strip())
    if r.stderr.strip():
        print(f"  ERROR: {r.stderr.strip()}")
