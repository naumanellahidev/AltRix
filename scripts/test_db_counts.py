#!/usr/bin/env python3
import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

db_url = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://")
engine = create_async_engine(db_url)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def test():
    async with AsyncSessionLocal() as db:
        res1 = await db.execute(text("SELECT count(*) FROM public.user_roles;"))
        res2 = await db.execute(text("SELECT count(*) FROM auth.users;"))
        res3 = await db.execute(text("SELECT current_database(), current_schema(), current_user;"))
        print("user_roles count:", res1.scalar())
        print("auth.users count:", res2.scalar())
        print("DB info:", res3.fetchone())

        res4 = await db.execute(text("SELECT user_id, school_id, role FROM public.user_roles LIMIT 5;"))
        print("user_roles sample:", res4.fetchall())

asyncio.run(test())
