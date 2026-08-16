import psycopg2
from psycopg2.extras import RealDictCursor
import json

conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
cur = conn.cursor(cursor_factory=RealDictCursor)

print("=== 1. SCHOOLS & CAMPUSES ===")
cur.execute("""
    SELECT s.id as school_id, s.slug as school_slug, s.name as school_name,
           c.id as campus_id, c.slug as campus_slug, c.name as campus_name
    FROM public.schools s
    LEFT JOIN public.campuses c ON c.school_id = s.id
    ORDER BY s.slug, c.name
""")
rows = cur.fetchall()
for r in rows:
    print(f"School: {r['school_name']} ({r['school_slug']}) | Campus: {r['campus_name']} ({r['campus_slug']}) [CID: {r['campus_id']}]")

print("\n=== 2. TABLES WITH campus_id COLUMN ===")
cur.execute("""
    SELECT table_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND column_name = 'campus_id'
    ORDER BY table_name;
""")
campus_tables = [r['table_name'] for r in cur.fetchall()]
print(f"Found {len(campus_tables)} tables with campus_id: {campus_tables}")

print("\n=== 3. DATA DISTRIBUTION ACROSS CAMPUSES & SCHOOLS ===")
for t in campus_tables:
    try:
        cur.execute(f"""
            SELECT s.slug as school, COALESCE(c.name, 'No Campus / NULL') as campus, count(*) as count
            FROM public.{t} tbl
            LEFT JOIN public.schools s ON s.id = tbl.school_id
            LEFT JOIN public.campuses c ON c.id = tbl.campus_id
            GROUP BY s.slug, c.name
            ORDER BY s.slug, c.name
        """)
        dist = cur.fetchall()
        print(f"\nTable '{t}':")
        for d in dist:
            print(f"  - School [{d['school']}]: Campus [{d['campus']}] -> {d['count']} rows")
    except Exception as e:
        print(f"Table '{t}': Query failed - {e}")
        conn.rollback()

cur.close()
conn.close()
