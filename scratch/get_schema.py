import sys
import os
from dotenv import load_dotenv

backend_path = r"d:\Altrix Duplicate\backend"
sys.path.append(backend_path)
load_dotenv(os.path.join(backend_path, ".env"))

import asyncio
from sqlalchemy import text
from app.database import engine

async def main():
    print("Connecting to DB...")
    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """))
        tables = [row[0] for row in result.fetchall()]
        print(f"Total tables: {len(tables)}")
        for t in tables:
            print("Table:", t)

if __name__ == "__main__":
    asyncio.run(main())
