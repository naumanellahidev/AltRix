#!/usr/bin/env python3
import subprocess

test_script = """
import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as session:
        res = await session.execute(text(\"\"\"
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name IN ('vehicles', 'bus_routes', 'bus_stops', 'student_transport_assignments', 'driver_profiles', 'transport_event_logs');
        \"\"\"))
        tables = [r[0] for r in res.fetchall()]
        print("Existing Transport Tables:", tables)
        
        # Check bus_routes count
        r_count = await session.execute(text("SELECT count(*) FROM bus_routes;"))
        print("bus_routes count:", r_count.scalar())
        
        # Check bus_stops count
        s_count = await session.execute(text("SELECT count(*) FROM bus_stops;"))
        print("bus_stops count:", s_count.scalar())
        
        # Check vehicles count
        v_count = await session.execute(text("SELECT count(*) FROM vehicles;"))
        print("vehicles count:", v_count.scalar())

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
