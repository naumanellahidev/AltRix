#!/usr/bin/env python3
import subprocess, os

VPS_PG_CONFIG = "/opt/altrix/shared/config/vps_postgresql.env"
admin_pass = ""
with open(VPS_PG_CONFIG) as f:
    for line in f:
        if line.startswith("VPS_PG_ADMIN_PASSWORD="):
            admin_pass = line.split("=", 1)[1].strip().strip("\"'")

env = dict(os.environ, PGPASSWORD=admin_pass)

def psql(sql):
    r = subprocess.run(["psql","-h","127.0.0.1","-p","5432","-U","altrix_admin","-d","altrix","-c",sql],
                       env=env, capture_output=True, text=True)
    return r.stdout.strip()

print("=== USER & ROLES FOR beaconryk@gmail.com ===")
print(psql("SELECT u.id, u.email, ur.school_id, ur.role FROM auth.users u LEFT JOIN user_roles ur ON u.id = ur.user_id WHERE u.email LIKE '%beaconryk%';"))

print("\n=== SCHOOL ID MATCH ===")
print(psql("SELECT id, name, slug FROM public.schools WHERE id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8';"))

print("\n=== SCHOOL MEMBERSHIPS ===")
print(psql("SELECT sm.user_id, sm.school_id, sm.role FROM school_memberships sm JOIN auth.users u ON u.id = sm.user_id WHERE u.email LIKE '%beaconryk%';"))
