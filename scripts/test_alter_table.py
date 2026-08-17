import psycopg2

conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
conn.autocommit = True
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE library_books ADD COLUMN campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE;")
    print("SUCCESS adding to library_books")
except Exception as e:
    print(f"FAILED: {e}")

cur.close()
conn.close()
