import bcrypt
import subprocess
import os

env = os.environ.copy()
env['PGPASSWORD'] = '29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f'

out = subprocess.check_output([
    "psql", "-h", "127.0.0.1", "-U", "altrix_app", "-d", "altrix", "-t", "-A", "-F", "|",
    "-c", "SELECT email, encrypted_password FROM auth.users ORDER BY email;"
], env=env).decode().strip()

user_hashes = {}
for line in out.splitlines():
    if not line or "|" not in line:
        continue
    email, enc_pw = line.split("|")
    hb = enc_pw.encode("utf-8")
    if hb.startswith(b"$2a$"):
        hb = b"$2b$" + hb[4:]
    user_hashes[email] = hb

# Try a comprehensive set of targeted candidates
candidates = [
    "Hr888", "HR888", "HrManager888", "BeaconHr888", "Beacon888", "Hr123!", "Hr8888", "hr888",
    "Academic888", "Coordinator888", "AcademicCoordinator888", "BeaconAcademic888", "academic888",
    "Counselor888", "Counselor123", "BeaconCounselor888", "counselor888",
    "American888", "Lgs888", "LGS888", "Teacher1888", "Teacher2888", "Teacher3888", "LgsTeacher888",
    "Student1888", "Student2888", "AliAkbar888", "AkbarAli888", "SchoolAdmin888", "schooladmin888",
    "Nauman888", "Cheema888", "Dev888", "SuperAdmin888", "MasterSuperAdmin888", "Master888", "Super888",
    "Owner888", "Admin888", "Principal888", "Teacher888", "Student888", "Parent888", "Accountant888",
    "admin", "admin123", "password", "password123", "123456", "12345678", "123456789", "Altrix123!",
    "Altrix888", "Eduverse123!", "Eduverse888", "Beacon123!"
]

for email, hb in user_hashes.items():
    matched = None
    for cand in candidates:
        try:
            if bcrypt.checkpw(cand.encode("utf-8"), hb):
                matched = cand
                break
        except Exception:
            pass
    print(f"{email:<30} -> {matched or 'NO MATCH'}", flush=True)
