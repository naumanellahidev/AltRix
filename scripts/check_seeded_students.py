#!/usr/bin/env python3
import subprocess

inspect_script = """
import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def inspect():
    async with AsyncSessionLocal() as session:
        # Find all dummy/seeded students (with d1d2d3d4- pattern or similar)
        print("=== CHECKING SEEDED STUDENTS ===")
        res = await session.execute(text("SELECT id, school_id, first_name, last_name, student_code, status FROM students WHERE id::text LIKE 'd1d2d3d4%' OR student_code LIKE 'BIS-%'"))
        seeded_students = res.fetchall()
        print(f"Total seeded students: {len(seeded_students)}")
        for s in seeded_students:
            print(f"  ID: {s[0]}, Name: {s[2]} {s[3]}, Code: {s[4]}, School: {s[1]}")

        # Check real students (non-seeded)
        print("\\n=== REAL STUDENTS ===")
        res_real = await session.execute(text("SELECT id, school_id, first_name, last_name, roll_number, student_code, status FROM students WHERE id::text NOT LIKE 'd1d2d3d4%' AND (student_code IS NULL OR student_code NOT LIKE 'BIS-%')"))
        real_students = res_real.fetchall()
        print(f"Total real students: {len(real_students)}")
        for s in real_students:
            print(f"  ID: {s[0]}, Name: {s[2]} {s[3]}, Roll: {s[4]}, Code: {s[5]}, School: {s[1]}")

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
print(out)
if err:
    print("ERR:\n", err)
