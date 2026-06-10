-- Add location coordinates columns to hr_staff_attendance table to log where staff checked in/out from
ALTER TABLE public.hr_staff_attendance 
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS altitude numeric;
