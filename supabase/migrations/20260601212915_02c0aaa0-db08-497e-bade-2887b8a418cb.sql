-- Create missing storage buckets that the app references
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('hr-documents', 'hr-documents', false),
  ('message-attachments', 'message-attachments', false),
  ('assignment-submissions', 'assignment-submissions', false)
ON CONFLICT (id) DO NOTHING;

-- Policies: authenticated users (school staff) can read/write within these buckets.
-- App-layer permissions further restrict who can call the upload code paths.

-- hr-documents
DROP POLICY IF EXISTS "hr-documents read auth" ON storage.objects;
DROP POLICY IF EXISTS "hr-documents write auth" ON storage.objects;
DROP POLICY IF EXISTS "hr-documents update auth" ON storage.objects;
DROP POLICY IF EXISTS "hr-documents delete auth" ON storage.objects;

CREATE POLICY "hr-documents read auth"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'hr-documents');

CREATE POLICY "hr-documents write auth"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hr-documents');

CREATE POLICY "hr-documents update auth"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'hr-documents');

CREATE POLICY "hr-documents delete auth"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'hr-documents');

-- message-attachments
DROP POLICY IF EXISTS "message-attachments read auth" ON storage.objects;
DROP POLICY IF EXISTS "message-attachments write auth" ON storage.objects;
DROP POLICY IF EXISTS "message-attachments delete auth" ON storage.objects;

CREATE POLICY "message-attachments read auth"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'message-attachments');

CREATE POLICY "message-attachments write auth"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'message-attachments');

CREATE POLICY "message-attachments delete auth"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'message-attachments' AND owner = auth.uid());

-- assignment-submissions
DROP POLICY IF EXISTS "assignment-submissions read auth" ON storage.objects;
DROP POLICY IF EXISTS "assignment-submissions write auth" ON storage.objects;
DROP POLICY IF EXISTS "assignment-submissions delete auth" ON storage.objects;

CREATE POLICY "assignment-submissions read auth"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'assignment-submissions');

CREATE POLICY "assignment-submissions write auth"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'assignment-submissions');

CREATE POLICY "assignment-submissions delete auth"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'assignment-submissions' AND owner = auth.uid());