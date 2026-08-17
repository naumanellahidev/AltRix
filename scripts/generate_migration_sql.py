import psycopg2

conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
cur = conn.cursor()

cur.execute("""
    SELECT t.table_name 
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' 
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name;
""")
all_tables = [r[0] for r in cur.fetchall()]

tables_with_school = []
for t in all_tables:
    cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '{t}'")
    cols = [r[0] for r in cur.fetchall()]
    if 'school_id' in cols and t != 'campuses':
        tables_with_school.append(t)

print(f"Generating SQL for {len(tables_with_school)} tables...")

sql_statements = []
sql_statements.append("-- ================================================================")
sql_statements.append("-- EXHAUSTIVE MULTI-CAMPUS DATABASE ISOLATION MIGRATION")
sql_statements.append("-- ================================================================\n")

# 1. Add campus_id to all tables
for t in tables_with_school:
    sql_statements.append(f'ALTER TABLE "{t}" ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE;')
    sql_statements.append(f'CREATE INDEX IF NOT EXISTS "idx_{t[:45]}_campus" ON "{t}"(campus_id);')

# 2. Universal Backfill to Primary Campuses
sql_statements.append("\n-- Backfill all tables to primary campus per school")
sql_statements.append("""
DO $$
DECLARE
    r RECORD;
    t_name TEXT;
    all_tbls TEXT[] := ARRAY[
""" + ",\n".join([f"        '{t}'" for t in tables_with_school]) + """
    ];
BEGIN
    FOR r IN (
        SELECT s.id as school_id, 
               (SELECT c.id FROM public.campuses c WHERE c.school_id = s.id ORDER BY (c.slug = s.slug) DESC, c.created_at ASC LIMIT 1) as primary_campus_id
        FROM public.schools s
    ) LOOP
        IF r.primary_campus_id IS NOT NULL THEN
            FOREACH t_name IN ARRAY all_tbls LOOP
                EXECUTE format('UPDATE %I SET campus_id = %L WHERE school_id = %L AND campus_id IS NULL', t_name, r.primary_campus_id, r.school_id);
            END LOOP;
        END IF;
    END LOOP;
END $$;
""")

# 3. Auto-Campus Trigger
sql_statements.append("\n-- Universal Auto-Campus Trigger")
sql_statements.append("""
CREATE OR REPLACE FUNCTION public.fn_auto_assign_campus_id()
RETURNS TRIGGER AS $$
DECLARE
    v_primary_campus_id UUID;
BEGIN
    IF NEW.campus_id IS NULL AND NEW.school_id IS NOT NULL THEN
        SELECT id INTO v_primary_campus_id
        FROM public.campuses
        WHERE school_id = NEW.school_id
        ORDER BY created_at ASC
        LIMIT 1;
        
        IF v_primary_campus_id IS NOT NULL THEN
            NEW.campus_id := v_primary_campus_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
""")

# Attach triggers
for t in tables_with_school:
    trg_name = f"trg_auto_campus_{t[:40]}"
    sql_statements.append(f'DROP TRIGGER IF EXISTS "{trg_name}" ON "{t}";')
    sql_statements.append(f'CREATE TRIGGER "{trg_name}" BEFORE INSERT ON "{t}" FOR EACH ROW EXECUTE FUNCTION public.fn_auto_assign_campus_id();')

cur.close()
conn.close()

with open("/tmp/migrate_all_tables.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(sql_statements))

print("Generated /tmp/migrate_all_tables.sql successfully!")
