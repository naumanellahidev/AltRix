import asyncio, urllib.request, json
from jose import jwt
from sqlalchemy import text
from app.config import settings
from app.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT user_id::text, school_id::text, role FROM public.user_roles WHERE school_id::text = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8' LIMIT 1;"))
        row = res.fetchone()
        if not row:
            print("No role found for school 70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8")
            return
        
        u_id, s_id, role = str(row[0]), str(row[1]), row[2]
        print(f"UserRole: user_id={u_id}, school_id={s_id}, role={role}")
        
        # Generate valid token
        payload = {
            "sub": u_id,
            "email": "owner@beacon.com",
            "role": "authenticated",
            "aud": "authenticated"
        }
        token = jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")

        # Test A: Authorized access to valid file
        url = f"http://127.0.0.1:8000/api/storage/files/student-photos/{s_id}/d47a671d-695b-40df-aa4c-9596cb6c413c_1781261710107.png"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "X-School-Id": s_id})
        try:
            with urllib.request.urlopen(req) as resp:
                print("AUTHORIZED TEST: ✅ SUCCESS! HTTP Status:", resp.status)
                print("Read Bytes:", len(resp.read()))
        except Exception as e:
            print("AUTHORIZED TEST ERROR:", e)

asyncio.run(main())
