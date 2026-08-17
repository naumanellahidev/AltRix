import psycopg2

conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
cur = conn.cursor()

# Get all tables in public schema
cur.execute("""
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
""")
tables = [r[0] for r in cur.fetchall()]

print("=== TABLES WITH/WITHOUT campus_id ===")
with_campus = []
without_campus = []

for t in tables:
    cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{t}'")
    cols = [r[0] for r in cur.fetchall()]
    if 'school_id' in cols:
        if 'campus_id' in cols:
            with_campus.append(t)
        else:
            without_campus.append(t)

print(f"\nTables WITH campus_id ({len(with_campus)}):")
for t in with_campus:
    print(f"  + {t}")

print(f"\nTables with school_id but WITHOUT campus_id ({len(without_campus)}):")
for t in without_campus:
    print(f"  - {t}")

cur.close()
conn.close()
