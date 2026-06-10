import asyncio
from sqlalchemy import text
from app.database import get_db_context

async def main():
    async with get_db_context() as db:
        # Check tables in public schema
        print("--- Tables in public schema ---")
        res = await db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """))
        tables = [row[0] for row in res.fetchall()]
        print(tables)
        
        # If profiles table exists, show its columns
        if 'profiles' in tables:
            print("\n--- Columns in public.profiles ---")
            res = await db.execute(text("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'profiles' AND table_schema = 'public'
            """))
            for row in res.fetchall():
                print(f"Column: {row[0]}, Type: {row[1]}")
                
        # If schools table exists, show its columns
        if 'schools' in tables:
            print("\n--- Columns in public.schools ---")
            res = await db.execute(text("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'schools' AND table_schema = 'public'
            """))
            for row in res.fetchall():
                print(f"Column: {row[0]}, Type: {row[1]}")

if __name__ == "__main__":
    asyncio.run(main())
