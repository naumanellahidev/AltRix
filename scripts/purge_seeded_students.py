#!/usr/bin/env python3
import subprocess

cleanup_script = """
import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def cleanup():
    async with AsyncSessionLocal() as session:
        # Find all seeded student IDs
        res = await session.execute(text("SELECT id FROM students WHERE id::text LIKE 'd1d2d3d4%' OR student_code LIKE 'BIS-%'"))
        sids = [str(r[0]) for r in res.fetchall()]
        print(f"Found {len(sids)} seeded fake students to remove.")
        
        if not sids:
            print("No seeded students found.")
            return

        sid_list_sql = ", ".join([f"'{i}'::uuid" for i in sids])
        sid_str_sql = ", ".join([f"'{i}'" for i in sids])

        # Find all referencing tables
        fk_res = await session.execute(text(\"\"\"
            SELECT tc.table_name, kcu.column_name 
            FROM information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name='students' AND tc.table_schema='public';
        \"\"\"))
        fks = fk_res.fetchall()
        
        for tbl, col in fks:
            try:
                del_fk = await session.execute(text(f"DELETE FROM public.{tbl} WHERE {col} IN ({sid_list_sql})"))
                if del_fk.rowcount > 0:
                    print(f"  Deleted {del_fk.rowcount} rows from {tbl}")
            except Exception as e:
                print(f"  Error deleting from {tbl}: {e}")

        # Also delete from tables that might reference student_id or borrower_id without FK
        for tbl, col in [("book_issues", "borrower_id"), ("book_reservations", "student_id")]:
            try:
                del_extra = await session.execute(text(f"DELETE FROM public.{tbl} WHERE {col} IN ({sid_list_sql})"))
                if del_extra.rowcount > 0:
                    print(f"  Deleted {del_extra.rowcount} rows from {tbl}")
            except Exception as e:
                pass

        # Now delete from students
        del_st = await session.execute(text(f"DELETE FROM public.students WHERE id IN ({sid_list_sql})"))
        print(f"SUCCESS: Deleted {del_st.rowcount} seeded fake students from students table.")
        await session.commit()

        # Check remaining students for Beacon
        count_res = await session.execute(text("SELECT count(*) FROM public.students WHERE school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8'"))
        print(f"Remaining active real students for Beacon: {count_res.scalar()}")

        # List all remaining students
        st_rem = await session.execute(text("SELECT id, first_name, last_name, roll_number, student_code FROM public.students WHERE school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8'"))
        print("\\n=== REMAINING REAL STUDENTS ===")
        for s in st_rem.fetchall():
            print(f"  ID: {s[0]}, Name: {s[1]} {s[2]}, Roll: {s[3]}, Code: {s[4]}")

asyncio.run(cleanup())
"""

p = subprocess.Popen(
    ["ssh", "altrixadmin@169.58.111.159", "sudo docker exec -i altrix_backend python"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)
out, err = p.communicate(input=cleanup_script)
print("=== CLEANUP OUTPUT ===")
print(out)
if err:
    print("ERR:\n", err)
