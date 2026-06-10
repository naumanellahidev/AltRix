import asyncio
from sqlalchemy import text
from app.database import get_db_context

async def main():
    async with get_db_context() as db:
        # Check column names of public.profiles
        res = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND table_schema = 'public'"))
        columns = [r[0] for r in res.fetchall()]
        print("profiles table columns:", columns)

        # Check column names of auth.users
        try:
            res = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'auth'"))
            auth_columns = [r[0] for r in res.fetchall()]
            print("auth.users columns:", auth_columns)
        except Exception as e:
            print("Could not query auth.users schema:", e)

if __name__ == "__main__":
    asyncio.run(main())
