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
        print("=== ALL USER_ROLES ROWS ===")
        res = await db.execute(text("SELECT id, user_id, school_id, role FROM user_roles;"))
        for row in res.fetchall():
            print(f"id={row[0]} ({type(row[0])}), uid={row[1]} ({type(row[1])}), sid={row[2]} ({type(row[2])}), role={row[3]}")

        print("\n=== USER_ROLES CAST QUERIES ===")
        res2 = await db.execute(text("SELECT role FROM user_roles WHERE user_id::text = '6e3e1047-c839-4e86-9be6-3131ca8ad474'"))
        print("Match text uid:", res2.fetchall())

asyncio.run(test())
