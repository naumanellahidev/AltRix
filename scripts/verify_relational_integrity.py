import subprocess
import os

env = os.environ.copy()
env['PGPASSWORD'] = '29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f'

def run_query(sql):
    return subprocess.check_output([
        "psql", "-h", "127.0.0.1", "-U", "altrix_app", "-d", "altrix", "-t", "-A",
        "-c", sql
    ], env=env).decode().strip()

checks = [
    ("Orphaned profiles (no auth.users)", "SELECT count(*) FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL;"),
    ("Orphaned user_roles (no auth.users)", "SELECT count(*) FROM public.user_roles ur LEFT JOIN auth.users u ON u.id = ur.user_id WHERE u.id IS NULL;"),
    ("Orphaned school_memberships (no auth.users)", "SELECT count(*) FROM public.school_memberships sm LEFT JOIN auth.users u ON u.id = sm.user_id WHERE u.id IS NULL;"),
    ("Orphaned school_memberships (no schools)", "SELECT count(*) FROM public.school_memberships sm LEFT JOIN public.schools s ON s.id = sm.school_id WHERE s.id IS NULL;"),
    ("Orphaned students (no schools)", "SELECT count(*) FROM public.students st LEFT JOIN public.schools s ON s.id = st.school_id WHERE s.id IS NULL;"),
    ("Orphaned class_sections (no schools)", "SELECT count(*) FROM public.class_sections cs LEFT JOIN public.schools s ON s.id = cs.school_id WHERE s.id IS NULL;"),
    ("Orphaned student_enrollments (no students)", "SELECT count(*) FROM public.student_enrollments se LEFT JOIN public.students st ON st.id = se.student_id WHERE st.id IS NULL;"),
    ("Orphaned attendance_entries (no students)", "SELECT count(*) FROM public.attendance_entries ae LEFT JOIN public.students st ON st.id = ae.student_id WHERE ae.student_id IS NOT NULL AND st.id IS NULL;"),
    ("Orphaned fee_invoices (no students)", "SELECT count(*) FROM public.fee_invoices fi LEFT JOIN public.students st ON st.id = fi.student_id WHERE fi.student_id IS NOT NULL AND st.id IS NULL;"),
    ("Orphaned exam_results (no students)", "SELECT count(*) FROM public.exam_results er LEFT JOIN public.students st ON st.id = er.student_id WHERE er.student_id IS NOT NULL AND st.id IS NULL;"),
    ("Orphaned report_cards (no students)", "SELECT count(*) FROM public.report_cards rc LEFT JOIN public.students st ON st.id = rc.student_id WHERE rc.student_id IS NOT NULL AND st.id IS NULL;"),
    ("Orphaned timetable_entries (no class_sections)", "SELECT count(*) FROM public.timetable_entries te LEFT JOIN public.class_sections cs ON cs.id = te.class_section_id WHERE te.class_section_id IS NOT NULL AND cs.id IS NULL;"),
    ("Orphaned app_notifications (no users)", "SELECT count(*) FROM public.app_notifications an LEFT JOIN auth.users u ON u.id = an.user_id WHERE an.user_id IS NOT NULL AND u.id IS NULL;"),
    ("Orphaned hr_staff_attendance (no users)", "SELECT count(*) FROM public.hr_staff_attendance sa LEFT JOIN auth.users u ON u.id = sa.user_id WHERE sa.user_id IS NOT NULL AND u.id IS NULL;")
]

print("=== DATA INTEGRITY & RELATION CHECKS ===")
print(f"{'INTEGRITY CHECK':<50} | {'ORPHANS':<10} | {'STATUS'}")
print("-" * 75)

all_passed = True
for title, query in checks:
    try:
        cnt = int(run_query(query))
        status = "PASS" if cnt == 0 else f"FAIL ({cnt} orphans)"
        if cnt > 0:
            all_passed = False
        print(f"{title:<50} | {cnt:<10} | {status}")
    except Exception as e:
        print(f"{title:<50} | {'ERROR':<10} | FAIL ({e})")
        all_passed = False

print("-" * 75)
if all_passed:
    print("ALL RELATIONAL INTEGRITY CHECKS PASSED: ZERO ORPHANED RECORDS ACROSS ALL MODULES!")
else:
    print("SOME INTEGRITY CHECKS FAILED. REVIEW DETAILS ABOVE.")
