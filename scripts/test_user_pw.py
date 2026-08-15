import bcrypt
import subprocess
import os

env = os.environ.copy()
env['PGPASSWORD'] = '29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f'

out = subprocess.check_output([
    'psql', '-h', '127.0.0.1', '-U', 'altrix_app', '-d', 'altrix', '-t', '-A', '-F', '|',
    '-c', 'SELECT email, encrypted_password FROM auth.users;'
], env=env).decode()

prefixes = ['Owner', 'Admin', 'Student', 'Teacher', 'Parent', 'Beacon', 'American', 'Lgs', 'Altrix', 'Eduverse', 'Nauman', 'Cheema', 'Password', 'Secret', 'Super']
suffixes = ['888', '123', '1234', '12345', '123456', '12345678', '!', '@123', '123!', '@888', '888!', '2026', '2026!', '2025', '2024', '', '1', '12', '123456789']
common = ['password', 'admin', 'administrator', 'root', 'testing', 'test123', 'test1234', '12345678', '123456789', '123456', 'qwerty', 'pakistan', 'pakistan123', 'karachi123', 'lahore123', 'beacon', 'beaconhouse', 'school123']

all_pw = set(common)
for p in prefixes:
    for s in suffixes:
        all_pw.add(p + s)
        all_pw.add(p.lower() + s)
        all_pw.add(p.upper() + s)

print(f"Testing {len(all_pw)} passwords against {len(out.strip().splitlines())} users...")

for line in out.strip().splitlines():
    if not line or '|' not in line:
        continue
    email, enc_pw = line.split('|', 1)
    hb = enc_pw.encode('utf-8')
    if hb.startswith(b"$2a$"):
        hb = b"$2b$" + hb[4:]
    for p in all_pw:
        try:
            if bcrypt.checkpw(p.encode('utf-8'), hb):
                print(f"MATCH FOUND: {email} -> {p}")
                break
        except Exception:
            pass
