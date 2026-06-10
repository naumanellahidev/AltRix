import asyncio
import traceback
import sys
from sqlalchemy import text
from app.database import get_db_context

async def main():
    print("Testing database connection...")
    try:
        async with get_db_context() as db:
            print("Acquired db context, executing query...")
            res = await db.execute(text("SELECT 1"))
            row = res.fetchone()
            print("DB Query Succeeded. Row:", row)
    except Exception as e:
        print("DB connection/query failed!")
        print("Exception class:", e.__class__.__name__)
        print("Exception string:", str(e))
        print("Traceback:")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
