#!/usr/bin/env python3
import subprocess

test_script = """
import asyncio
from app.database import AsyncSessionLocal
from app.routers.transport import list_routes, list_fleet, get_transport_summary
from uuid import UUID

class FakeUser:
    def __init__(self):
        self.user_id = UUID('6e3e1047-c839-4e86-9be6-3131ca8ad474')
        self.id = self.user_id
        self.school_id = UUID('70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8')
        self.campus_id = None
        self.role = 'principal'

async def check():
    async with AsyncSessionLocal() as session:
        u = FakeUser()
        routes = await list_routes(current_user=u, db=session)
        print("=== LIVE /transport/routes ===")
        for r in routes:
            print(f"  Route: {r['route_code']} - {r['route_name']} | Stops: {r['total_stops']} | Fare: PKR {r['monthly_fare']}")
            for s in r['stops']:
                print(f"    - Stop #{s['stop_order']}: {s['stop_name']} ({s['estimated_morning_time']}) Landmark: {s['landmark']}")
        
        fleet = await list_fleet(current_user=u, db=session)
        print("\\n=== LIVE /transport/fleet ===")
        for v in fleet:
            print(f"  Bus: {v['bus_number']} | Plate: {v['registration_no']} | Driver: {v['driver_name']} | Cap: {v['seating_capacity']} | Route: {v['assigned_route_name']}")
        
        summary = await get_transport_summary(current_user=u, db=session)
        print("\\n=== LIVE /transport/summary ===")
        print(" ", summary)

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
