ALTER TABLE public.attendance_sessions
ADD CONSTRAINT attendance_sessions_school_section_date_period_uq
UNIQUE (school_id, class_section_id, session_date, period_label);

NOTIFY pgrst, 'reload schema';