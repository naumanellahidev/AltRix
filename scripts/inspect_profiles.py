#!/usr/bin/env python3
import subprocess

inspect_script = """
import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def inspect():
    async with AsyncSessionLocal() as session:
        # Find beacon school
        res = await session.execute(text("SELECT id, name FROM schools WHERE slug = 'beacon'"))
        school = res.fetchone()
        sid = school[0]
        print(f"Beacon School ID: {sid}")

        # Check profiles table
        print("\\n=== PROFILES FOR BEACON SCHOOL ===")
        p_res = await session.execute(text("SELECT id, display_name, email, role, school_id, campus_id FROM profiles WHERE school_id = :sid"), {"sid": sid})
        rows = p_res.fetchall()
        print(f"Total profiles for Beacon: {len(rows)}")
        for r in rows:
            print(f"  ID: {r[0]}, Name: {r[1]}, Email: {r[2]}, Role: {r[3]}, Campus: {r[5]}")

        # Check ALL profiles in DB
        print("\\n=== ALL PROFILES IN DATABASE ===")
        all_p = await session.execute(text("SELECT id, display_name, email, role, school_id FROM profiles"))
        for r in all_p.fetchall():
            print(f"  ID: {r[0]}, Name: {r[1]}, Email: {r[2]}, Role: {r[3]}, SchoolID: {r[4]}")

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
print("=== PROFILES INSPECTION ===")
print(out)
if err:
    print("ERR:\n", err)
