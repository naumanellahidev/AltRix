import psycopg2

conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
conn.autocommit = True
cur = conn.cursor()

beacon_sid = "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"
beacon_main_cid = "249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8"
beacon_lahore_cid = "a847833c-90a7-4f25-b793-8a813eee2215"

# 1. Fetch all tables with campus_id
cur.execute("""
    SELECT t.table_name 
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name;
""")
all_tables = [r[0] for r in cur.fetchall()]

for t in all_tables:
    cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '{t}'")
    cols = [r[0] for r in cur.fetchall()]
    if 'school_id' in cols and 'campus_id' in cols and t != 'campuses':
        # Re-assign any Beacon record to Beacon Main
        cur.execute(f"UPDATE \"{t}\" SET campus_id = %s WHERE school_id = %s;", (beacon_main_cid, beacon_sid))

print("All Beacon records successfully re-assigned to Beacon Main.")

# Verification
sample_tables = ["students", "library_books", "book_issues", "timetable_entries", "exams", "fee_invoices", "fee_payments", "attendance_entries"]
for st in sample_tables:
    cur.execute(f"SELECT COUNT(*) FROM \"{st}\" WHERE campus_id = %s", (beacon_main_cid,))
    main_cnt = cur.fetchone()[0]
    cur.execute(f"SELECT COUNT(*) FROM \"{st}\" WHERE campus_id = %s", (beacon_lahore_cid,))
    lahore_cnt = cur.fetchone()[0]
    print(f"  Table '{st:20}': Beacon Main={main_cnt:2}, Beacon Lahore={lahore_cnt:2}")

cur.close()
conn.close()
