import psycopg2
from psycopg2.extras import RealDictCursor
import json
import uuid

def seed_data():
    conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
    cur = conn.cursor(cursor_factory=RealDictCursor)

    print("=== Step 1: Campuses Setup ===")
    # Beacon
    cur.execute("""
        UPDATE public.campuses SET slug = 'beacon-main', name = 'Beacon Main Campus' WHERE id = '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8';
        UPDATE public.campuses SET slug = 'beacon-lahore', name = 'Beacon Lahore Campus' WHERE id = 'a847833c-90a7-4f25-b793-8a813eee2215';
    """)

    # LGS
    lgs_cid_1 = 'aaaaaaaa-1111-4444-8888-000000000001'
    lgs_cid_2 = 'aaaaaaaa-1111-4444-8888-000000000002'
    cur.execute("""
        INSERT INTO public.campuses (id, school_id, name, slug, address, is_active)
        VALUES 
          (%s, 'c4e835dd-b67d-4f88-9763-5561ff057116', 'LGS Gulberg Campus', 'lgs-gulberg', 'Main Gulberg III, Lahore', true),
          (%s, 'c4e835dd-b67d-4f88-9763-5561ff057116', 'LGS Johar Town Campus', 'lgs-johar', 'Block G, Johar Town, Lahore', true)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, is_active = true;
    """, (lgs_cid_1, lgs_cid_2))

    # American
    ams_cid_1 = 'bbbbbbbb-2222-4444-8888-000000000001'
    ams_cid_2 = 'bbbbbbbb-2222-4444-8888-000000000002'
    cur.execute("""
        INSERT INTO public.campuses (id, school_id, name, slug, address, is_active)
        VALUES 
          (%s, '8a40ec06-7a91-4e68-9375-d59e312762f9', 'American Central Campus', 'american-central', 'Sector F-7/2, Islamabad', true),
          (%s, '8a40ec06-7a91-4e68-9375-d59e312762f9', 'American Executive Campus', 'american-executive', 'DHA Phase 5, Islamabad', true)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, is_active = true;
    """, (ams_cid_1, ams_cid_2))

    print("=== Step 2: Academic Classes Setup ===")
    schools = [
        ('70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'beacon'),
        ('c4e835dd-b67d-4f88-9763-5561ff057116', 'lgs'),
        ('8a40ec06-7a91-4e68-9375-d59e312762f9', 'american')
    ]
    
    classes_map = {}
    for sid, slug in schools:
        for g in range(1, 11):
            cname = f"Grade {g}"
            cur.execute("""
                SELECT id FROM public.academic_classes WHERE school_id = %s AND name = %s LIMIT 1
            """, (sid, cname))
            row = cur.fetchone()
            if row:
                cid = row['id']
            else:
                cid = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO public.academic_classes (id, school_id, name, grade_level)
                    VALUES (%s, %s, %s, %s)
                """, (cid, sid, cname, f"{g}"))
            classes_map[(sid, cname)] = cid

    print("=== Step 3: Class Sections per Campus ===")
    campuses_config = [
        # (school_id, campus_id, campus_prefix)
        ('70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8', 'Main'),
        ('70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'a847833c-90a7-4f25-b793-8a813eee2215', 'LHR'),
        ('c4e835dd-b67d-4f88-9763-5561ff057116', lgs_cid_1, 'Gulberg'),
        ('c4e835dd-b67d-4f88-9763-5561ff057116', lgs_cid_2, 'Johar'),
        ('8a40ec06-7a91-4e68-9375-d59e312762f9', ams_cid_1, 'Central'),
        ('8a40ec06-7a91-4e68-9375-d59e312762f9', ams_cid_2, 'Exec'),
    ]

    section_map = {}
    for sid, cid, prefix in campuses_config:
        for grade_num in [8, 9, 10]:
            class_id = classes_map[(sid, f"Grade {grade_num}")]
            for sname in ['A', 'B']:
                full_section_name = f"{grade_num}-{prefix}-{sname}"
                cur.execute("""
                    SELECT id FROM public.class_sections 
                    WHERE school_id = %s AND campus_id = %s AND name = %s LIMIT 1
                """, (sid, cid, full_section_name))
                row = cur.fetchone()
                if row:
                    sec_id = row['id']
                else:
                    sec_id = str(uuid.uuid4())
                    cur.execute("""
                        INSERT INTO public.class_sections (id, school_id, campus_id, class_id, name, room)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (sec_id, sid, cid, class_id, full_section_name, f"Room {grade_num}0{ord(sname)-64}"))
                section_map[(cid, grade_num, sname)] = sec_id

    # Update existing sections without campus to Beacon Main
    cur.execute("""
        UPDATE public.class_sections 
        SET campus_id = '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8'
        WHERE school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8' AND campus_id IS NULL;
    """)

    print("=== Step 4: Students per Campus ===")
    # Update existing beacon students without campus_id
    cur.execute("""
        UPDATE public.students 
        SET campus_id = '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8'
        WHERE school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8' AND campus_id IS NULL;
    """)

    sample_students_per_campus = {
        # Beacon Lahore
        'a847833c-90a7-4f25-b793-8a813eee2215': [
            ('Zainab', 'Fatima', 'Dr. Tariq Mahmood', 'BLHR-101', 'LHR-101', 9, 'A', 'female', 'O+'),
            ('Hassan', 'Raza', 'Syed Raza Ali', 'BLHR-102', 'LHR-102', 9, 'A', 'male', 'B+'),
            ('Maryam', 'Naveed', 'Naveed Ashraf', 'BLHR-103', 'LHR-103', 10, 'A', 'female', 'A+'),
            ('Bilal', 'Ahmed', 'Ahmed Khan', 'BLHR-104', 'LHR-104', 10, 'B', 'male', 'AB+'),
        ],
        # LGS Gulberg
        lgs_cid_1: [
            ('Ayesha', 'Malik', 'Malik Usman', 'LGS-GUL-01', 'GUL-101', 9, 'A', 'female', 'A+'),
            ('Hamza', 'Butt', 'Khurram Butt', 'LGS-GUL-02', 'GUL-102', 10, 'A', 'male', 'O+'),
            ('Zoya', 'Qureshi', 'Qureshi Farooq', 'LGS-GUL-03', 'GUL-103', 9, 'B', 'female', 'B+'),
        ],
        # LGS Johar Town
        lgs_cid_2: [
            ('Mahnoor', 'Imran', 'Imran Siddiqui', 'LGS-JOH-01', 'JOH-101', 9, 'A', 'female', 'B+'),
            ('Daniyal', 'Shah', 'Shahid Shah', 'LGS-JOH-02', 'JOH-102', 10, 'A', 'male', 'A-'),
            ('Ali', 'Hamza', 'Hamza Tariq', 'LGS-JOH-03', 'JOH-103', 10, 'B', 'male', 'O+'),
        ],
        # American Central
        ams_cid_1: [
            ('Sarah', 'Khan', 'Farhan Khan', 'AMS-CEN-01', 'CEN-101', 9, 'A', 'female', 'O-'),
            ('Omar', 'Farooq', 'Farooq Sheikh', 'AMS-CEN-02', 'CEN-102', 10, 'A', 'male', 'B-'),
            ('Aria', 'Qasim', 'Qasim Javed', 'AMS-CEN-03', 'CEN-103', 9, 'B', 'female', 'A+'),
        ],
        # American Executive
        ams_cid_2: [
            ('Esha', 'Rehman', 'Atif Rehman', 'AMS-EXE-01', 'EXE-101', 9, 'A', 'female', 'AB+'),
            ('Rayyan', 'Ali', 'Ali Zafar', 'AMS-EXE-02', 'EXE-102', 10, 'A', 'male', 'A+'),
            ('Mikael', 'Baig', 'Mirza Baig', 'AMS-EXE-03', 'EXE-103', 10, 'B', 'male', 'O+'),
        ],
    }

    students_map = {}
    for cid, st_list in sample_students_per_campus.items():
        cur.execute("SELECT school_id FROM public.campuses WHERE id = %s", (cid,))
        school_id = cur.fetchone()['school_id']

        for fname, lname, gname, adm_no, roll, gr, sec, gender, blood in st_list:
            sec_id = section_map.get((cid, gr, sec))
            cur.execute("SELECT id FROM public.students WHERE school_id = %s AND (student_code = %s OR registration_number = %s)", (school_id, adm_no, adm_no))
            st_row = cur.fetchone()
            if st_row:
                st_id = st_row['id']
                cur.execute("""
                    UPDATE public.students 
                    SET campus_id = %s, class_section_id = %s, first_name = %s, last_name = %s, parent_name = %s, status = 'active'
                    WHERE id = %s
                """, (cid, sec_id, fname, lname, gname, st_id))
            else:
                st_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO public.students (
                        id, school_id, campus_id, class_section_id, student_code, registration_number, roll_number,
                        first_name, last_name, parent_name, parent_phone, parent_email, emergency_contact,
                        status, date_of_birth, gender, blood_group
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, '+92 300 1234567', 'guardian@gmail.com', '+92 300 1234567',
                        'active', '2010-01-01', %s, %s
                    )
                """, (st_id, school_id, cid, sec_id, adm_no, adm_no, roll, fname, lname, gname, gender, blood))
            students_map[(cid, adm_no)] = st_id

    print("=== Step 5: Attendance Sessions & Entries per Campus ===")
    for cid, st_list in sample_students_per_campus.items():
        cur.execute("SELECT school_id FROM public.campuses WHERE id = %s", (cid,))
        school_id = cur.fetchone()['school_id']

        for gr, sec in [(9, 'A'), (10, 'A')]:
            sec_id = section_map.get((cid, gr, sec))
            if not sec_id:
                continue

            sess_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO public.attendance_sessions (
                    id, school_id, campus_id, class_section_id, session_date, period_label
                ) VALUES (%s, %s, %s, %s, '2026-08-15', 'Period 1')
                ON CONFLICT (school_id, class_section_id, session_date, period_label) DO NOTHING
            """, (sess_id, school_id, cid, sec_id))

            # Fetch the actual session_id
            cur.execute("""
                SELECT id FROM public.attendance_sessions 
                WHERE school_id = %s AND class_section_id = %s AND session_date = '2026-08-15' AND period_label = 'Period 1'
            """, (school_id, sec_id))
            sess_row = cur.fetchone()
            if sess_row:
                real_sess_id = sess_row['id']
                # Fetch students in this section
                cur.execute("SELECT id FROM public.students WHERE class_section_id = %s", (sec_id,))
                sec_students = cur.fetchall()
                for s_idx, s_row in enumerate(sec_students):
                    st_id = s_row['id']
                    st_status = 'present' if s_idx % 4 != 0 else 'late'
                    cur.execute("""
                        INSERT INTO public.attendance_entries (
                            id, session_id, student_id, school_id, campus_id, status, note
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (school_id, session_id, student_id) DO UPDATE SET status = EXCLUDED.status
                    """, (str(uuid.uuid4()), real_sess_id, st_id, school_id, cid, st_status, 'On-time attendance' if st_status == 'present' else 'Late arrival'))

    print("=== Step 6: Fee Invoices & Payments per Campus ===")
    for cid, st_list in sample_students_per_campus.items():
        cur.execute("SELECT school_id FROM public.campuses WHERE id = %s", (cid,))
        school_id = cur.fetchone()['school_id']

        for fname, lname, gname, adm_no, roll, gr, sec, gender, blood in st_list:
            st_id = students_map[(cid, adm_no)]
            inv_no = f"INV-{adm_no}-2026-08"
            cur.execute("SELECT id FROM public.fee_invoices WHERE school_id = %s AND invoice_number = %s", (school_id, inv_no))
            inv_row = cur.fetchone()
            
            amount = 18000 if 'BLHR' in adm_no else 22000 if 'LGS' in adm_no else 28000
            is_paid = (hash(adm_no) % 2 == 0)
            paid_amt = amount if is_paid else 0
            status = 'paid' if is_paid else 'pending'

            if inv_row:
                inv_id = inv_row['id']
                cur.execute("""
                    UPDATE public.fee_invoices 
                    SET campus_id = %s, subtotal = %s, total_amount = %s, paid_amount = %s, status = %s
                    WHERE id = %s
                """, (cid, amount, amount, paid_amt, status, inv_id))
            else:
                inv_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO public.fee_invoices (
                        id, school_id, campus_id, student_id, invoice_number, period_label,
                        due_date, subtotal, total_amount, paid_amount, status, notes
                    ) VALUES (
                        %s, %s, %s, %s, %s, 'August 2026',
                        '2026-08-25', %s, %s, %s, %s, 'Monthly tuition and facilities fee'
                    )
                """, (inv_id, school_id, cid, st_id, inv_no, amount, amount, paid_amt, status))

            if is_paid:
                cur.execute("SELECT id FROM public.fee_payments WHERE invoice_id = %s", (inv_id,))
                if not cur.fetchone():
                    cur.execute("""
                        INSERT INTO public.fee_payments (
                            id, school_id, campus_id, invoice_id, student_id, amount, method, status, transaction_ref, notes
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, 'bank_transfer', 'success', %s, 'Paid via Online Transfer'
                        )
                    """, (str(uuid.uuid4()), school_id, cid, inv_id, st_id, amount, f"TXN-{adm_no}"))

    print("=== Step 7: Staff Campus Assignments ===")
    staff_assignments = [
        # (user_email, campus_id, role)
        ('beaconryk@gmail.com', '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8', 'principal'),
        ('teacher1@gmail.com', '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8', 'teacher'),
        ('teacher2@gmail.com', 'a847833c-90a7-4f25-b793-8a813eee2215', 'teacher'),
        ('teacher3@gmail.com', 'a847833c-90a7-4f25-b793-8a813eee2215', 'teacher'),
        ('lgs@gmail.com', lgs_cid_1, 'principal'),
        ('teacher1lgs@gmail.com', lgs_cid_1, 'teacher'),
        ('american@gmail.com', ams_cid_1, 'principal'),
    ]

    for email, cid, role in staff_assignments:
        cur.execute("SELECT id FROM auth.users WHERE LOWER(TRIM(email)) = %s", (email,))
        u = cur.fetchone()
        if u:
            uid = u['id']
            cur.execute("""
                INSERT INTO public.staff_campus_assignments (id, user_id, campus_id, role)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (campus_id, user_id) DO UPDATE SET role = EXCLUDED.role
            """, (str(uuid.uuid4()), uid, cid, role))

            # Also assign campus_id in user_roles
            cur.execute("""
                UPDATE public.user_roles SET campus_id = %s WHERE user_id = %s
            """, (cid, uid))

    conn.commit()
    cur.close()
    conn.close()
    print("\nSUCCESS! Rich multi-campus & multi-school data seeded cleanly.")

if __name__ == "__main__":
    seed_data()
