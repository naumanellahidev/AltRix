import psycopg2

conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
cur = conn.cursor()

tables = [
    "students", "user_roles", "admission_applications", "fee_invoices",
    "fee_payments", "campuses", "academic_classes", "class_sections",
    "school_memberships", "crm_leads", "finance_expenses", "attendance_entries"
]

for t in tables:
    cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{t}'")
    cols = [r[0] for r in cur.fetchall()]
    print(f"Table '{t}' has campus_id: {'campus_id' in cols}")

cur.close()
conn.close()
