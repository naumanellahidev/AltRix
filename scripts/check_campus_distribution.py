import psycopg2

conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
cur = conn.cursor()

cur.execute("SELECT id, school_id, name, slug, code FROM campuses")
campuses = cur.fetchall()
print("CAMPUSES:")
for c in campuses:
    print(" ", c)

cur.execute("SELECT school_id, campus_id, COUNT(*) FROM students GROUP BY school_id, campus_id")
print("\nSTUDENTS:")
for r in cur.fetchall():
    print(" ", r)

cur.execute("SELECT school_id, campus_id, COUNT(*), SUM(amount) FROM fee_payments GROUP BY school_id, campus_id")
print("\nFEE PAYMENTS:")
for r in cur.fetchall():
    print(" ", r)

cur.execute("SELECT school_id, campus_id, COUNT(*), SUM(total_amount) FROM fee_invoices GROUP BY school_id, campus_id")
print("\nFEE INVOICES:")
for r in cur.fetchall():
    print(" ", r)

cur.close()
conn.close()
