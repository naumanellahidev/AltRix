#!/usr/bin/env python3
import subprocess

inspect_script = """
import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def inspect():
    async with AsyncSessionLocal() as session:
        res = await session.execute(text("SELECT id, name FROM schools WHERE slug = 'beacon'"))
        school = res.fetchone()
        sid = school[0]
        print(f"Beacon School ID: {sid}\\n")

        print("=== HR_STAFF_DIRECTORY FOR BEACON ===")
        sd_res = await session.execute(text("SELECT id, full_name, email, position, department, is_active, linked_user_id FROM hr_staff_directory WHERE school_id = :sid"), {"sid": sid})
        staff = sd_res.fetchall()
        print(f"Total staff: {len(staff)}")
        for s in staff:
            print(f"  ID: {s[0]}, Name: {s[1]}, Email: {s[2]}, Position: {s[3]}, Dept: {s[4]}, Active: {s[5]}, LinkedUser: {s[6]}")

        print("\\n=== USER_ROLES (TEACHERS) FOR BEACON ===")
        ur_res = await session.execute(text("SELECT ur.id, ur.user_id, ur.role, p.display_name, p.email FROM user_roles ur LEFT JOIN profiles p ON p.id = ur.user_id WHERE ur.school_id = :sid AND ur.role = 'teacher'"), {"sid": sid})
        teachers = ur_res.fetchall()
        print(f"Total teacher roles: {len(teachers)}")
        for t in teachers:
            print(f"  RoleID: {t[0]}, UserID: {t[1]}, Name: {t[3]}, Email: {t[4]}")

        print("\\n=== STUDENTS FOR BEACON ===")
        st_res = await session.execute(text("SELECT id, first_name, last_name, roll_number, student_code, status FROM students WHERE school_id = :sid"), {"sid": sid})
        students = st_res.fetchall()
        print(f"Total students: {len(students)}")
        for st in students:
            print(f"  ID: {st[0]}, Name: {st[1]} {st[2]}, Roll: {st[3]}, Code: {st[4]}, Status: {st[5]}")

asyncio.run(inspect())
"""

p = subprocess.Popen(
    ["ssh", "altrixadmin@169.58.111.159", "sudo docker exec -i altrix_backend python"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)
out, err = p.communicate(input=inspect_script)
print("=== BEACON DATA INSPECTION ===")
print(out)
if err:
    print("ERR:\n", err)
