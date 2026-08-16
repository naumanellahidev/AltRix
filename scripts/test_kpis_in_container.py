import asyncio
from app.database import AsyncSessionLocal
from app.routers.misc import dashboard_kpis
from unittest.mock import MagicMock
import uuid

async def test():
    async with AsyncSessionLocal() as db:
        user = MagicMock()
        user.school_id = uuid.UUID("70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8")
        user.roles = ["school_owner"]
        user.id = uuid.UUID("3f8865d8-4f24-4f40-a35a-93e18a8b1390")

        req = MagicMock()
        req.url.path = "/api/reports/dashboard"
        req.query_params = {}

        print("=== 1. No campus_id ===")
        res1 = await dashboard_kpis(user, db, req)
        print("All campuses total_students:", res1.get("total_students"))

        print("\n=== 2. Main Campus ===")
        main_cid = uuid.UUID("249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8")
        res2 = await dashboard_kpis(user, db, req, campus_id=main_cid)
        print("Main campus total_students:", res2.get("total_students"))

        print("\n=== 3. Lahore Campus ===")
        lahore_cid = uuid.UUID("a847833c-90a7-4f25-b793-8a813eee2215")
        res3 = await dashboard_kpis(user, db, req, campus_id=lahore_cid)
        print("Lahore campus total_students:", res3.get("total_students"))

asyncio.run(test())
