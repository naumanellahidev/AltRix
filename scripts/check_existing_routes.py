#!/usr/bin/env python3
import subprocess

test_script = """
import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as session:
        res = await session.execute(text("SELECT id, route_code, route_name, start_point, end_point FROM bus_routes;"))
        for r in res.fetchall():
            print("Route:", r[0], r[1], r[2], r[3], "->", r[4])

asyncio.run(check())
"""

p = subprocess.Popen(
    ["ssh", "altrixadmin@169.58.111.159", "sudo docker exec -i altrix_backend python"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)
out, err = p.communicate(input=test_script)
print(out)
if err:
    print("ERR:\n", err)
