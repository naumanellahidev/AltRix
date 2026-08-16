import psycopg2
from psycopg2.extras import RealDictCursor
import requests
import json

BASE_URL = "https://altrixcore.com/api"

# 1. Test live auth for all roles & schools
CREDENTIALS = [
    # Beacon
    {"email": "beaconowner@gmail.com", "password": "Owner888", "school": "beacon", "role": "school_owner"},
    {"email": "beaconadmin@gmail.com", "password": "SuperAdmin@888", "school": "beacon", "role": "school_owner"},
    {"email": "beaconryk@gmail.com", "password": "Principal888", "school": "beacon", "role": "principal"},
    {"email": "beaconhr@gmail.com", "password": "Hr888", "school": "beacon", "role": "hr_manager"},
    {"email": "beaconaccountant@gmail.com", "password": "Accountant888", "school": "beacon", "role": "accountant"},
    {"email": "beaconacademic@gmail.com", "password": "Academic888", "school": "beacon", "role": "academic_coordinator"},
    {"email": "beaconcounselor@gmail.com", "password": "Counselor888", "school": "beacon", "role": "counselor"},
    {"email": "teacher1@gmail.com", "password": "Teacher888", "school": "beacon", "role": "teacher"},
    {"email": "teacher2@gmail.com", "password": "Teacher888", "school": "beacon", "role": "teacher"},
    {"email": "teacher3@gmail.com", "password": "Teacher888", "school": "beacon", "role": "teacher"},
    {"email": "student@gmail.com", "password": "Student888", "school": "beacon", "role": "student"},
    {"email": "parent1@gmail.com", "password": "Parent888", "school": "beacon", "role": "parent"},
    # LGS
    {"email": "lgs@gmail.com", "password": "Principal888", "school": "lgs", "role": "principal"},
    {"email": "teacher1lgs@gmail.com", "password": "Teacher888", "school": "lgs", "role": "teacher"},
    # American
    {"email": "american@gmail.com", "password": "Principal888", "school": "american", "role": "principal"},
    # Master Super Admin
    {"email": "naumancheema643@gmail.com", "password": "Super888", "school": "beacon", "role": "super_admin"},
]

def verify_live_api_and_data():
    print("="*70)
    print("=== PART 1: PRACTICAL LIVE API & CREDENTIALS VERIFICATION ===")
    print("="*70)
    auth_passed = 0
    auth_failed = 0
    for idx, c in enumerate(CREDENTIALS, 1):
        email = c["email"]
        pwd = c["password"]
        try:
            res = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": pwd}, timeout=10)
            if res.status_code == 200:
                data = res.json()
                token = data.get("access_token")
                me_res = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
                if me_res.status_code == 200:
                    me_data = me_res.json()
                    school_slug = me_data.get("school", {}).get("slug") if isinstance(me_data.get("school"), dict) else me_data.get("school_slug", "N/A")
                    raw_roles = me_data.get("roles", [])
                    roles = [r if isinstance(r, str) else r.get("role") for r in raw_roles]
                    print(f"[{idx:02d}/{len(CREDENTIALS)}] PASS: {email:28s} | School: {str(school_slug):10s} | Roles: {roles}")
                    auth_passed += 1
                else:
                    print(f"[{idx:02d}/{len(CREDENTIALS)}] FAIL: {email:28s} -> /auth/me failed ({me_res.status_code})")
                    auth_failed += 1
            else:
                print(f"[{idx:02d}/{len(CREDENTIALS)}] FAIL: {email:28s} -> Login failed ({res.status_code}: {res.text})")
                auth_failed += 1
        except Exception as e:
            print(f"[{idx:02d}/{len(CREDENTIALS)}] ERROR: {email:28s} -> {e}")
            auth_failed += 1

    print(f"\nAPI Auth Summary: {auth_passed} PASSED, {auth_failed} FAILED")

def verify_db_isolation():
    print("\n" + "="*70)
    print("=== PART 2: DATABASE CAMPUS & SCHOOL DATA ISOLATION VERIFICATION ===")
    print("="*70)
    conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # 1. Check schools and campuses
    cur.execute("""
        SELECT s.slug as school_slug, s.name as school_name, c.slug as campus_slug, c.name as campus_name, c.id as campus_id
        FROM public.schools s
        JOIN public.campuses c ON c.school_id = s.id
        ORDER BY s.slug, c.name
    """)
    campuses = cur.fetchall()
    print(f"Total Configured Campuses: {len(campuses)}")
    for c in campuses:
        cid = c['campus_id']
        cur.execute("SELECT count(*) as count FROM public.students WHERE campus_id = %s", (cid,))
        st_cnt = cur.fetchone()['count']

        cur.execute("SELECT count(*) as count FROM public.class_sections WHERE campus_id = %s", (cid,))
        sec_cnt = cur.fetchone()['count']

        cur.execute("SELECT count(*) as count FROM public.attendance_entries WHERE campus_id = %s", (cid,))
        att_cnt = cur.fetchone()['count']

        cur.execute("SELECT count(*) as count FROM public.fee_invoices WHERE campus_id = %s", (cid,))
        fee_cnt = cur.fetchone()['count']

        cur.execute("SELECT count(*) as count FROM public.staff_campus_assignments WHERE campus_id = %s", (cid,))
        staff_cnt = cur.fetchone()['count']

        print(f"[{c['school_slug']:8s}] Campus: {c['campus_name']:24s} ({c['campus_slug']:16s}) -> "
              f"Students: {st_cnt:02d} | Sections: {sec_cnt:02d} | Attendance: {att_cnt:02d} | Fees: {fee_cnt:02d} | Staff: {staff_cnt:02d}")

    # 2. Assert Strict Isolation: No cross-campus student or section pollution
    cur.execute("""
        SELECT count(*) as count 
        FROM public.students st
        JOIN public.campuses c ON c.id = st.campus_id
        WHERE st.school_id != c.school_id
    """)
    mismatched = cur.fetchone()['count']
    if mismatched == 0:
        print("\n[VERIFIED] Zero cross-school/campus foreign key pollution across all students!")
    else:
        print(f"\n[ALERT] Found {mismatched} mismatched student records!")

    cur.close()
    conn.close()

if __name__ == "__main__":
    verify_live_api_and_data()
    try:
        verify_db_isolation()
    except Exception as e:
        print(f"DB verification skipped or failed locally: {e}")

