import os, asyncio
from app.database import engine
from sqlalchemy import text

async def test():
    try:
        async with engine.connect() as conn:
            res = await conn.execute(text("SELECT current_user, current_database(), inet_server_addr(), inet_server_port();"))
            print("SUCCESS:", res.fetchall())
    except Exception as e:
        print("FAILED:", type(e), e)

asyncio.run(test())
