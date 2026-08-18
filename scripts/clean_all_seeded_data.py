#!/usr/bin/env python3
import subprocess

sql_clean = """
DO $$
DECLARE
    r RECORD;
    cnt INT;
BEGIN
    FOR r IN (
        SELECT tc.table_name, kcu.column_name 
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND ccu.table_name = 'students' 
          AND tc.table_schema = 'public'
    ) LOOP
        EXECUTE format('DELETE FROM public.%I WHERE %I::text LIKE ''d1d2d3d4%%'' OR %I IN (SELECT id FROM public.students WHERE student_code LIKE ''BIS-%%'')', r.table_name, r.column_name, r.column_name);
        GET DIAGNOSTICS cnt = ROW_COUNT;
        IF cnt > 0 THEN
            RAISE NOTICE 'Deleted % rows from % (column %)', cnt, r.table_name, r.column_name;
        END IF;
    END LOOP;

    -- Delete from non-FK tables
    DELETE FROM public.book_issues WHERE borrower_id::text LIKE 'd1d2d3d4%' OR borrower_id IN (SELECT id FROM public.students WHERE student_code LIKE 'BIS-%');
    DELETE FROM public.book_reservations WHERE student_id::text LIKE 'd1d2d3d4%' OR student_id IN (SELECT id FROM public.students WHERE student_code LIKE 'BIS-%');

    -- Finally delete from students
    DELETE FROM public.students WHERE id::text LIKE 'd1d2d3d4%' OR student_code LIKE 'BIS-%';
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RAISE NOTICE 'Deleted % seeded fake students from students table.', cnt;
END $$;

SELECT id, first_name, last_name, roll_number, student_code FROM public.students WHERE school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8';
"""

p = subprocess.Popen(
    ["ssh", "altrixadmin@169.58.111.159", "sudo -u postgres psql -d altrix"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)
out, err = p.communicate(input=sql_clean)
print("=== CLEANUP OUTPUT ===")
print("STDOUT:\n", out)
print("STDERR:\n", err)
