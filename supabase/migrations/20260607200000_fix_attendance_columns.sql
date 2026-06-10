-- Fix hr_staff_attendance columns to ensure compatibility across all schema versions.
-- Original table (20260123223555) used: check_in_time, check_out_time
-- Newer migration (20260601205118) used: clock_in, clock_out
-- This migration adds the newer column names as aliases / adds missing columns safely.

-- Add clock_in / clock_out if the table has the original column names
ALTER TABLE public.hr_staff_attendance
  ADD COLUMN IF NOT EXISTS clock_in timestamptz,
  ADD COLUMN IF NOT EXISTS clock_out timestamptz,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS altitude numeric;

-- Backfill clock_in/clock_out from check_in_time/check_out_time if those exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hr_staff_attendance'
      AND column_name = 'check_in_time'
  ) THEN
    UPDATE public.hr_staff_attendance
    SET clock_in = check_in_time
    WHERE clock_in IS NULL AND check_in_time IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hr_staff_attendance'
      AND column_name = 'check_out_time'
  ) THEN
    UPDATE public.hr_staff_attendance
    SET clock_out = check_out_time
    WHERE clock_out IS NULL AND check_out_time IS NOT NULL;
  END IF;
END;
$$;

-- Ensure principal role can select from hr_staff_attendance (via can_manage_hr -> can_manage_staff)
-- Drop stale duplicate SELECT policies if both old and new migrations ran
DROP POLICY IF EXISTS "hr_staff_att_select" ON public.hr_staff_attendance;
DROP POLICY IF EXISTS "Staff can view own attendance" ON public.hr_staff_attendance;

-- Unified SELECT policy: HR managers (includes principal) OR own record
CREATE POLICY "hr_staff_att_select" ON public.hr_staff_attendance
  FOR SELECT USING (
    public.can_manage_hr(school_id) OR user_id = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
