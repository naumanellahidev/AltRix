-- Add columns to public.complaints
ALTER TABLE public.complaints 
  ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('low','medium','high')) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS anonymous BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_comment TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Re-create complaints_principal_view to support the new columns and optional anonymity
CREATE OR REPLACE VIEW public.complaints_principal_view
WITH (security_invoker=on) AS
  SELECT
    id,
    school_id,
    flow,
    CASE WHEN (flow = 'student_to_principal' AND anonymous = true) THEN NULL ELSE sender_user_id END AS sender_user_id,
    student_id,
    category,
    subject,
    content,
    status,
    priority,
    anonymous,
    rating,
    rating_comment,
    attachments,
    resolution_note,
    resolved_by,
    resolved_at,
    created_at,
    updated_at
  FROM public.complaints;

-- Re-create complaint_feedbacks_principal_view to support optional anonymity
CREATE OR REPLACE VIEW public.complaint_feedbacks_principal_view
WITH (security_invoker=on) AS
SELECT
  f.id,
  f.complaint_id,
  f.school_id,
  CASE WHEN c.flow = 'student_to_principal' AND c.anonymous = true AND f.author_role = 'sender'
       THEN NULL ELSE f.author_user_id END AS author_user_id,
  f.author_role,
  f.content,
  f.created_at,
  f.updated_at
FROM public.complaint_feedbacks f
JOIN public.complaints c ON c.id = f.complaint_id;

-- Add complaints and complaint_feedbacks to the supabase_realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Check if complaints is already in publication, if not add it
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'complaints') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
    END IF;
    -- Check if complaint_feedbacks is already in publication, if not add it
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'complaint_feedbacks') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.complaint_feedbacks;
    END IF;
  END IF;
END $$;
