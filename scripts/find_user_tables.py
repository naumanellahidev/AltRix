import asyncio
from sqlalchemy import text
from app.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE '%user%' OR table_name LIKE '%profile%' OR table_name LIKE '%staff%';"))
        for r in res.fetchall():
            print(f"Table: {r[0]}.{r[1]}")

asyncio.run(main())
