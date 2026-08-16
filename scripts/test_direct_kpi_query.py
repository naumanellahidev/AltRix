import psycopg2

conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
cur = conn.cursor()

sid = "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"
main_cid = "249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8"
lahore_cid = "a847833c-90a7-4f25-b793-8a813eee2215"

query = """
SELECT
    (SELECT COUNT(*) FROM students WHERE school_id = %s AND (%s::uuid IS NULL OR campus_id = %s::uuid) AND (status IS NULL OR status NOT IN ('inactive', 'withdrawn', 'graduated', 'deleted'))) as total_students,
    (SELECT COUNT(*) FROM fee_invoices WHERE school_id = %s AND (%s::uuid IS NULL OR campus_id = %s::uuid) AND status NOT IN ('paid', 'cancelled')) as pending_payments
"""

print("--- ALL CAMPUSES (cid=None) ---")
cur.execute(query, (sid, None, None, sid, None, None))
print(cur.fetchone())

print("--- MAIN CAMPUS ---")
cur.execute(query, (sid, main_cid, main_cid, sid, main_cid, main_cid))
print(cur.fetchone())

print("--- LAHORE CAMPUS ---")
cur.execute(query, (sid, lahore_cid, lahore_cid, sid, lahore_cid, lahore_cid))
print(cur.fetchone())

cur.close()
conn.close()
