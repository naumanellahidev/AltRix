-- Enable real-time replication for hr_staff_attendance table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'hr_staff_attendance'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_staff_attendance;
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END
$$;
