import psycopg2
from psycopg2.extras import RealDictCursor

def cleanup():
    conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
    cur = conn.cursor(cursor_factory=RealDictCursor)

    print("=== Cleaning up seeded records ===")

    # 1. Delete seeded fee payments & invoices
    cur.execute("""
        DELETE FROM public.fee_payments 
        WHERE invoice_id IN (SELECT id FROM public.fee_invoices WHERE invoice_number LIKE 'INV-%-2026-08%' OR invoice_number LIKE 'INV-BLHR%' OR invoice_number LIKE 'INV-LGS%' OR invoice_number LIKE 'INV-AMS%');
        DELETE FROM public.fee_invoices 
        WHERE invoice_number LIKE 'INV-%-2026-08%' OR invoice_number LIKE 'INV-BLHR%' OR invoice_number LIKE 'INV-LGS%' OR invoice_number LIKE 'INV-AMS%';
    """)
    print("Cleaned fee payments and invoices.")

    # 2. Delete seeded attendance entries & sessions
    cur.execute("""
        DELETE FROM public.attendance_entries 
        WHERE session_id IN (SELECT id FROM public.attendance_sessions WHERE session_date = '2026-08-15' AND period_label = 'Period 1');
        DELETE FROM public.attendance_sessions 
        WHERE session_date = '2026-08-15' AND period_label = 'Period 1';
    """)
    print("Cleaned attendance entries and sessions.")

    # 3. Delete seeded students (created on 2026-08-16)
    cur.execute("""
        DELETE FROM public.students 
        WHERE student_code LIKE 'BLHR-%' OR student_code LIKE 'LGS-%' OR student_code LIKE 'AMS-%'
           OR registration_number LIKE 'BLHR-%' OR registration_number LIKE 'LGS-%' OR registration_number LIKE 'AMS-%';
    """)
    print("Cleaned seeded students.")

    # 4. Delete seeded class_sections (names with -LHR-, -Gulberg-, -Johar-, -Central-, -Exec-)
    cur.execute("""
        DELETE FROM public.class_sections 
        WHERE name LIKE '%-LHR-%' OR name LIKE '%-Gulberg-%' OR name LIKE '%-Johar-%' OR name LIKE '%-Central-%' OR name LIKE '%-Exec-%';
    """)
    print("Cleaned seeded class sections.")

    # 5. Clean up seeded academic classes created on 2026-08-16
    cur.execute("""
        DELETE FROM public.academic_classes 
        WHERE id NOT IN (
            'dd247768-5372-4fa4-a331-d32b1845eb83',
            'b7234af2-e407-4072-bb69-4a63b1289ff2',
            'ad31734f-0abf-4341-83dd-b0b8cf233e62',
            '26912959-8764-4879-99cf-dc37dea1733b'
        );
    """)
    print("Cleaned seeded academic classes.")

    # 6. Delete seeded campuses
    cur.execute("""
        DELETE FROM public.campuses 
        WHERE id IN (
            'aaaaaaaa-1111-4444-8888-000000000001',
            'aaaaaaaa-1111-4444-8888-000000000002',
            'bbbbbbbb-2222-4444-8888-000000000001',
            'bbbbbbbb-2222-4444-8888-000000000002'
        );
    """)
    print("Cleaned seeded campuses.")

    # 7. Restore original Beacon Campuses
    cur.execute("""
        UPDATE public.campuses 
        SET slug = 'beacon-main', name = 'Beacon Main' 
        WHERE id = '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8';

        UPDATE public.campuses 
        SET slug = 'sec', name = 'Beacon Lahore' 
        WHERE id = 'a847833c-90a7-4f25-b793-8a813eee2215';
    """)
    print("Restored original Beacon campuses.")

    # 8. Reset staff campus assignments
    cur.execute("""
        DELETE FROM public.staff_campus_assignments;
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("Cleanup completed successfully! Only real admin data retained.")

if __name__ == "__main__":
    cleanup()
