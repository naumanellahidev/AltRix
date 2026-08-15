-- 1. Re-link records referencing old super admin UUID to active super admin UUID
UPDATE public.app_notifications 
SET user_id = '0c7e6b7e-f4fb-436a-b2bf-2e05ab38e285' 
WHERE user_id = '314f9841-bc85-47e8-b953-53e18e780498';

UPDATE public.hr_staff_attendance 
SET user_id = '0c7e6b7e-f4fb-436a-b2bf-2e05ab38e285' 
WHERE user_id = '314f9841-bc85-47e8-b953-53e18e780498';

-- 2. Clean up defunct orphaned profiles from historical test runs
DELETE FROM public.profiles 
WHERE id IN ('314f9841-bc85-47e8-b953-53e18e780498', '96a5d5a8-df99-43c6-b1c4-b7f4de4dee2f', '5164836d-9108-47e6-8805-7beab8eb9c50');

-- 3. Fix mock nil student_id fee invoice to point to student Nauman Ellahi
UPDATE public.fee_invoices
SET student_id = 'e80a74f9-a679-4d1f-b1a0-2e2862672a9d'
WHERE student_id = '00000000-0000-0000-0000-000000000000';
