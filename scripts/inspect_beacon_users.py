#!/usr/bin/env python3
import subprocess

inspect_script = """
import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def inspect():
    async with AsyncSessionLocal() as session:
        # Find beacon school
        res = await session.execute(text("SELECT id, name, slug FROM schools WHERE slug = 'beacon'"))
        school = res.fetchone()
        sid = school[0]
        print(f"School ID: {sid}, Name: {school[1]}")

        # List all tables in public schema
        print("\\n=== TABLES IN PUBLIC SCHEMA ===")
        t_res = await session.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"))
        tables = [r[0] for r in t_res.fetchall()]
        print(", ".join(tables))

        # Check user_roles for Beacon
        print("\\n=== USER_ROLES FOR BEACON ===")
        ur_res = await session.execute(text("SELECT id, user_id, role, school_id, campus_id FROM user_roles WHERE school_id = :sid"), {"sid": sid})
        for r in ur_res.fetchall():
            print(f"  Role: {r[2]}, UserID: {r[1]}, RoleID: {r[0]}")

        # Check staff_directory if exists
        if "staff_directory" in tables:
            print("\\n=== STAFF_DIRECTORY FOR BEACON ===")
            sd_res = await session.execute(text("SELECT id, full_name, designation, role, email, phone, is_active FROM staff_directory WHERE school_id = :sid"), {"sid": sid})
            for r in sd_res.fetchall():
                print(f"  Name: {r[1]}, Role: {r[3]}, Desig: {r[2]}, Email: {r[4]}, Active: {r[6]}")

        # Check students for Beacon
        if "students" in tables:
            print("\\n=== STUDENTS FOR BEACON ===")
            st_res = await session.execute(text("SELECT id, full_name, roll_number, grade_level, status FROM students WHERE school_id = :sid"), {"sid": sid})
            for r in st_res.fetchall():
                print(f"  Name: {r[1]}, Roll: {r[2]}, Class: {r[3]}, Status: {r[4]}")

        # Check profiles for Beacon
        if "profiles" in tables:
            print("\\n=== PROFILES FOR BEACON ===")
            p_res = await session.execute(text("SELECT id, full_name, email, role FROM profiles WHERE school_id = :sid"), {"sid": sid})
            for r in p_res.fetchall():
                print(f"  Name: {r[1]}, Email: {r[2]}, Role: {r[3]}")

        # Check auth.users
        print("\\n=== AUTH.USERS ===")
        u_res = await session.execute(text("SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'role' FROM auth.users"))
        for r in u_res.fetchall():
            print(f"  ID: {r[0]}, Email: {r[1]}, Name: {r[2]}, MetaRole: {r[3]}")

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
print("=== DATABASE INSPECTION ===")
print(out)
if err:
    print("ERR:\n", err)
