#!/usr/bin/env python3
import subprocess

test_script = """
import asyncio
import uuid
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def seed_stops():
    async with AsyncSessionLocal() as session:
        # Check if stops exist
        res = await session.execute(text("SELECT count(*) FROM bus_stops;"))
        cnt = res.scalar()
        if cnt == 0:
            print("Populating initial designated stops for existing routes...")
            # Route 1: Morning Campus Line A (d3ec3d7e-fc61-43b4-9b39-dba3217316f2)
            r1_stops = [
                ("City Center Terminal", 1, "07:15 AM", "02:30 PM", "Opposite Metro Station Gate 2", "Main Blvd"),
                ("Liberty Market Chowk", 2, "07:25 AM", "02:40 PM", "Near Shell Fuel Station", "Gulberg III"),
                ("Garden Town Roundabout", 3, "07:40 AM", "02:55 PM", "Barkat Market Crossing", "Garden Town"),
                ("Canal View Bridge", 4, "07:55 AM", "03:10 PM", "Under Canal Flyover", "Canal Road"),
                ("Main Campus Gate 1", 5, "08:10 AM", "03:25 PM", "School Campus Entrance", "Campus Drive")
            ]
            for name, order, m_time, e_time, lmark, addr in r1_stops:
                await session.execute(text(\"\"\"
                    INSERT INTO bus_stops (id, route_id, stop_name, stop_order, estimated_morning_time, estimated_evening_time, landmark, address)
                    VALUES (:id, :rid, :name, :order, :m_time, :e_time, :lmark, :addr);
                \"\"\"), {
                    "id": str(uuid.uuid4()), "rid": "d3ec3d7e-fc61-43b4-9b39-dba3217316f2",
                    "name": name, "order": order, "m_time": m_time, "e_time": e_time, "lmark": lmark, "addr": addr
                })

            # Route 2: North Line (0bef6444-bf31-41b1-aaa5-36087b1c6334)
            r2_stops = [
                ("Town Hall Square", 1, "07:20 AM", "02:35 PM", "Old Town Hall Park", "Mall Road"),
                ("Shadman Colony Gate", 2, "07:35 AM", "02:50 PM", "Near Post Office", "Jail Road"),
                ("FC College Junction", 3, "07:50 AM", "03:05 PM", "Zafar Ali Road Corner", "Gulberg V"),
                ("School Gate 2", 4, "08:15 AM", "03:30 PM", "Campus North Gate", "North Wing")
            ]
            for name, order, m_time, e_time, lmark, addr in r2_stops:
                await session.execute(text(\"\"\"
                    INSERT INTO bus_stops (id, route_id, stop_name, stop_order, estimated_morning_time, estimated_evening_time, landmark, address)
                    VALUES (:id, :rid, :name, :order, :m_time, :e_time, :lmark, :addr);
                \"\"\"), {
                    "id": str(uuid.uuid4()), "rid": "0bef6444-bf31-41b1-aaa5-36087b1c6334",
                    "name": name, "order": order, "m_time": m_time, "e_time": e_time, "lmark": lmark, "addr": addr
                })

            # Route 3: South Line (d3e4a214-cf1b-40d5-88ba-8e905f2514a6)
            r3_stops = [
                ("City Chowk Station", 1, "07:10 AM", "02:25 PM", "South Terminal Stand", "Multan Road"),
                ("Allama Iqbal Town", 2, "07:30 AM", "02:45 PM", "Moon Market Plaza", "College Block"),
                ("Muslim Town Mor", 3, "07:45 AM", "03:00 PM", "Near Hospital Gate", "Ferozepur Road"),
                ("Campus Gate 3", 4, "08:10 AM", "03:25 PM", "Campus South Gate", "South Wing")
            ]
            for name, order, m_time, e_time, lmark, addr in r3_stops:
                await session.execute(text(\"\"\"
                    INSERT INTO bus_stops (id, route_id, stop_name, stop_order, estimated_morning_time, estimated_evening_time, landmark, address)
                    VALUES (:id, :rid, :name, :order, :m_time, :e_time, :lmark, :addr);
                \"\"\"), {
                    "id": str(uuid.uuid4()), "rid": "d3e4a214-cf1b-40d5-88ba-8e905f2514a6",
                    "name": name, "order": order, "m_time": m_time, "e_time": e_time, "lmark": lmark, "addr": addr
                })

            # Also assign the vehicle to route 1 if not assigned
            veh_res = await session.execute(text("SELECT id FROM vehicles LIMIT 1;"))
            veh_id = veh_res.scalar()
            if veh_id:
                await session.execute(text("UPDATE bus_routes SET vehicle_id = :vid WHERE id = 'd3ec3d7e-fc61-43b4-9b39-dba3217316f2';"), {"vid": str(veh_id)})

            await session.commit()
            print("Stops successfully populated for existing routes!")
        else:
            print(f"Stops already populated: {cnt} stops.")

asyncio.run(seed_stops())
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
