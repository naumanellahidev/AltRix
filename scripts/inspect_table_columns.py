#!/usr/bin/env python3
import subprocess

inspect_script = """
import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def inspect():
    async with AsyncSessionLocal() as session:
        for t in ["profiles", "students", "hr_staff_directory", "user_roles", "schools"]:
            res = await session.execute(text(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{t}'"))
            cols = [f"{r[0]} ({r[1]})" for r in res.fetchall()]
            print(f"\\n=== TABLE: {t} ===")
            print(", ".join(cols))

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
print("=== SCHEMAS ===")
print(out)
if err:
    print("ERR:\n", err)
