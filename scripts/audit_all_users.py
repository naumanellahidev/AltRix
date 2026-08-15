import subprocess
import json

out = subprocess.check_output([
    "sudo", "-u", "postgres", "psql", "-d", "altrix", "-t", "-A", "-F", "|",
    "-c", """
    SELECT 
        u.id, 
        u.email,
        COALESCE(p.display_name, 'N/A') as full_name,
        COALESCE(psa.user_id IS NOT NULL, false) as is_super_admin,
        COALESCE(s.slug, 'none') as school_slug,
        COALESCE(s.name, 'none') as school_name,
        COALESCE(ur.role, 'none') as user_role,
        COALESCE(sm.status, 'none') as membership_status,
        COALESCE(soa.id IS NOT NULL, false) as is_school_owner_assigned
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.platform_super_admins psa ON psa.user_id = u.id
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    LEFT JOIN public.schools s ON s.id = ur.school_id
    LEFT JOIN public.school_memberships sm ON sm.user_id = u.id AND (sm.school_id = s.id OR s.id IS NULL)
    LEFT JOIN public.school_owner_assignments soa ON soa.owner_user_id = u.id
    ORDER BY u.created_at;
    """
]).decode().strip()

print(f"{'EMAIL':<30} | {'FULL NAME':<20} | {'SUPER':<5} | {'SCHOOL SLUG':<15} | {'ROLE':<20} | {'MEMBERSHIP'}")
print("-" * 115)
for line in out.splitlines():
    if not line or "|" not in line:
        continue
    parts = line.split("|")
    uid, email, name, is_super, slug, sname, role, mem_stat, is_soa = parts
    print(f"{email:<30} | {name:<20} | {is_super:<5} | {slug:<15} | {role:<20} | {mem_stat}")
