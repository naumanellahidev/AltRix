import asyncio
from app.database import engine
from sqlalchemy import text

async def check():
    async with engine.connect() as conn:
        res = await conn.execute(text("""
            SELECT 
                (SELECT COUNT(*) FROM students) as total_students,
                (SELECT status FROM students LIMIT 5) as statuses,
                (SELECT COUNT(*) FROM fee_payments) as total_payments,
                (SELECT COALESCE(SUM(amount), 0) FROM fee_payments) as sum_payments,
                (SELECT COUNT(*) FROM fee_invoices) as total_invoices,
                (SELECT COUNT(*) FROM crm_leads) as total_leads,
                (SELECT COUNT(*) FROM school_memberships) as total_staff
        """))
        row = res.fetchone()
        print("DB SUMMARY ROW:", row)

        st_res = await conn.execute(text("SELECT status, count(*) FROM students GROUP BY status"))
        print("STUDENT STATUSES:", st_res.fetchall())

        sch_res = await conn.execute(text("SELECT id, slug, name FROM schools"))
        print("SCHOOLS:", sch_res.fetchall())

if __name__ == "__main__":
    asyncio.run(check())
