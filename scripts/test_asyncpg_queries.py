#!/usr/bin/env python3
import asyncio, os, uuid
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

db_url = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://")
engine = create_async_engine(db_url)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def test():
    async with AsyncSessionLocal() as db:
        uid_str = "6e3e1047-c839-4e86-9be6-3131ca8ad474"
        sid_str = "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"
        
        uid_obj = uuid.UUID(uid_str)
        sid_obj = uuid.UUID(sid_str)
        
        print("--- QUERY 1: Super admin check ---")
        try:
            res = await db.execute(
                text("SELECT user_id FROM platform_super_admins WHERE user_id = :uid LIMIT 1"),
                {"uid": uid_obj}
            )
            print("Super admin:", res.fetchone())
        except Exception as e:
            print("Super admin error:", e)
            
        print("\n--- QUERY 2: Fallback school_id ---")
        try:
            res = await db.execute(
                text("SELECT school_id FROM user_roles WHERE user_id = :uid LIMIT 1"),
                {"uid": uid_obj}
            )
            print("Fallback school:", res.fetchone())
        except Exception as e:
            print("Fallback error:", e)
            
        print("\n--- QUERY 3: Roles for school ---")
        try:
            res = await db.execute(
                text("SELECT role FROM user_roles WHERE user_id = :uid AND school_id = :sid"),
                {"uid": uid_obj, "sid": sid_obj}
            )
            rows = res.fetchall()
            print("Roles:", [r[0] for r in rows])
        except Exception as e:
            print("Roles error:", e)

asyncio.run(test())
