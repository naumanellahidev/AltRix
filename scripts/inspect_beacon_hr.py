import os
import psycopg2
import psycopg2.extras

db_url = os.environ.get("DATABASE_URL") or "postgresql://altrix_app:altrix_secure_pass_2026@172.20.0.1:5432/altrix"
if "postgresql+asyncpg://" in db_url:
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

conn = psycopg2.connect(db_url)
cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

print("=== STAFF CAMPUS ASSIGNMENTS ===")
cur.execute("SELECT * FROM staff_campus_assignments;")
rows = cur.fetchall()
print(f"Total staff_campus_assignments: {len(rows)}")
for row in rows:
    print(dict(row))

print("\n=== USER ROLES (BEACON) ===")
cur.execute("SELECT id, user_id, role, school_id, campus_id FROM user_roles WHERE school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8';")
rows = cur.fetchall()
print(f"Total user_roles: {len(rows)}")
for row in rows:
    print(dict(row))

print("\n=== TEACHER PROFILES (BEACON) ===")
cur.execute("SELECT id, full_name, school_id, campus_id, user_id FROM teacher_profiles WHERE school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8';")
rows = cur.fetchall()
print(f"Total teacher_profiles: {len(rows)}")
for row in rows:
    print(dict(row))

print("\n=== HR SALARY RECORDS (BEACON) ===")
cur.execute("SELECT id, user_id, school_id, campus_id, base_salary, status FROM hr_salary_records WHERE school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8';")
rows = cur.fetchall()
print(f"Total hr_salary_records: {len(rows)}")
for row in rows:
    print(dict(row))

print("\n=== HR CONTRACTS (BEACON) ===")
cur.execute("SELECT id, user_id, school_id, campus_id, contract_type, status FROM hr_contracts WHERE school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8';")
rows = cur.fetchall()
print(f"Total hr_contracts: {len(rows)}")
for row in rows:
    print(dict(row))

print("\n=== SCHOOL MEMBERSHIPS (BEACON) ===")
cur.execute("SELECT id, user_id, school_id, campus_id, role FROM school_memberships WHERE school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8';")
rows = cur.fetchall()
print(f"Total school_memberships: {len(rows)}")
for row in rows:
    print(dict(row))

print("\n=== HR LEAVE REQUESTS (BEACON) ===")
cur.execute("SELECT id, user_id, school_id, campus_id, leave_type, status FROM hr_leave_requests WHERE school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8';")
rows = cur.fetchall()
print(f"Total hr_leave_requests: {len(rows)}")
for row in rows:
    print(dict(row))

conn.close()
