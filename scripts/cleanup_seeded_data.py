#!/usr/bin/env python3
import subprocess

sql_cleanup = """
DO $$
DECLARE
    s_rec RECORD;
BEGIN
    -- Delete all seeded students and their associations
    DELETE FROM public.book_issues WHERE borrower_id::text LIKE 'd1d2d3d4%';
    DELETE FROM public.book_reservations WHERE student_id::text LIKE 'd1d2d3d4%';
    DELETE FROM public.report_cards WHERE student_id::text LIKE 'd1d2d3d4%';
    DELETE FROM public.fee_vouchers WHERE student_id::text LIKE 'd1d2d3d4%';
    
    -- Delete from students table
    DELETE FROM public.students WHERE id::text LIKE 'd1d2d3d4%' OR student_code LIKE 'BIS-%';
    
    RAISE NOTICE 'Seeded fake students cleaned up.';
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
out, err = p.communicate(input=sql_cleanup)
print("STDOUT:\n", out)
print("STDERR:\n", err)
