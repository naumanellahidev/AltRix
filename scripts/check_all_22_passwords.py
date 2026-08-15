import bcrypt
import subprocess
import os

env = os.environ.copy()
env['PGPASSWORD'] = '29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f'

out = subprocess.check_output([
    "psql", "-h", "127.0.0.1", "-U", "altrix_app", "-d", "altrix", "-t", "-A", "-F", "|",
    "-c", "SELECT id, email, encrypted_password FROM auth.users ORDER BY email;"
], env=env).decode().strip()

test_passwords = [
    "Owner888", "Admin888", "Principal888", "Teacher888", "Student888",
    "Parent888", "Accountant888", "Counselor888", "Coordinator888", "Academic888",
    "Super888", "Master888", "Altrix888", "Altrix123!", "Password123!", "password",
    "password123", "beacon123", "admin", "admin123", "12345678", "123456",
    "Secret123!", "Eduverse123!"
]

users = []
for line in out.splitlines():
    if not line or "|" not in line:
        continue
    uid, email, enc_pw = line.split("|")
    hb = enc_pw.encode("utf-8")
    if hb.startswith(b"$2a$"):
        hb = b"$2b$" + hb[4:]
    
    matched = None
    for p in test_passwords:
        try:
            if bcrypt.checkpw(p.encode("utf-8"), hb):
                matched = p
                break
        except Exception:
            pass
    users.append((email, matched, enc_pw))

for email, matched, _ in users:
    print(f"{email:<30} -> {matched or 'NO MATCH'}")
