-- Sync existing staff user_roles into staff_campus_assignments
INSERT INTO public.staff_campus_assignments (id, user_id, campus_id, role, created_at)
SELECT 
    gen_random_uuid(),
    ur.user_id,
    ur.campus_id,
    ur.role,
    now()
FROM public.user_roles ur
WHERE ur.campus_id IS NOT NULL
  AND ur.role IN (
    'teacher', 'principal', 'vice_principal', 'accountant',
    'academic_coordinator', 'counselor', 'hr_manager', 'school_admin',
    'librarian', 'transport_manager', 'receptionist', 'security_guard', 'staff', 'admin', 'school_owner'
  )
ON CONFLICT (campus_id, user_id) 
DO UPDATE SET role = EXCLUDED.role;

-- Create sync trigger function
CREATE OR REPLACE FUNCTION public.fn_sync_staff_campus_assignment()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.campus_id IS NOT NULL AND NEW.role IN (
        'teacher', 'principal', 'vice_principal', 'accountant',
        'academic_coordinator', 'counselor', 'hr_manager', 'school_admin',
        'librarian', 'transport_manager', 'receptionist', 'security_guard', 'staff', 'admin', 'school_owner'
    ) THEN
        INSERT INTO public.staff_campus_assignments (id, user_id, campus_id, role, created_at)
        VALUES (gen_random_uuid(), NEW.user_id, NEW.campus_id, NEW.role, now())
        ON CONFLICT (campus_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_staff_campus ON public.user_roles;
CREATE TRIGGER trg_sync_staff_campus
AFTER INSERT OR UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_staff_campus_assignment();
