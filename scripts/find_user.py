import asyncio
from jose import jwt
from sqlalchemy import text
from app.config import settings
from app.database import AsyncSessionLocal

async def main():
    print("SUPABASE_JWT_SECRET:", settings.supabase_jwt_secret[:10] + "...")
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT u.id, u.email, ur.school_id, ur.role FROM public.users u JOIN public.user_roles ur ON u.id = ur.user_id LIMIT 10;"))
        rows = res.fetchall()
        for r in rows:
            print(f"User: id={r[0]}, email={r[1]}, school_id={r[2]}, role={r[3]}")
            token = jwt.encode({"sub": str(r[0]), "email": r[1], "role": "authenticated"}, settings.supabase_jwt_secret, algorithm="HS256")
            print("  Generated Token:", token)
            break

asyncio.run(main())
