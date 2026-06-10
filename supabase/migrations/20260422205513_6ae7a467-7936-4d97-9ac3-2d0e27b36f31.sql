
-- Allow senders to edit their own complaints (subject/content/category) while not resolved
DROP POLICY IF EXISTS "complaints_update_sender" ON public.complaints;
CREATE POLICY "complaints_update_sender"
ON public.complaints
FOR UPDATE
USING (sender_user_id = auth.uid() AND status NOT IN ('resolved', 'dismissed'))
WITH CHECK (sender_user_id = auth.uid());

-- Threaded feedback table
CREATE TABLE IF NOT EXISTS public.complaint_feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('sender','receiver','principal')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaint_feedbacks_complaint ON public.complaint_feedbacks(complaint_id);

ALTER TABLE public.complaint_feedbacks ENABLE ROW LEVEL SECURITY;

-- Helper: can the user see this complaint?
CREATE OR REPLACE FUNCTION public.can_access_complaint(_complaint_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.complaints c
    WHERE c.id = _complaint_id
      AND (
        -- Sender always
        c.sender_user_id = auth.uid()
        -- Principal/admin
        OR public.has_role(auth.uid(), c.school_id, 'principal')
        OR public.has_role(auth.uid(), c.school_id, 'school_owner')
        OR public.has_role(auth.uid(), c.school_id, 'super_admin')
        OR public.has_role(auth.uid(), c.school_id, 'vice_principal')
        -- Parent of the student (teacher_to_parent flow)
        OR (c.flow = 'teacher_to_parent' AND c.student_id IS NOT NULL
            AND public.is_my_child(c.school_id, c.student_id))
      )
  );
$$;

-- View feedbacks: anyone who can access the complaint
DROP POLICY IF EXISTS "feedbacks_select" ON public.complaint_feedbacks;
CREATE POLICY "feedbacks_select" ON public.complaint_feedbacks
FOR SELECT USING (public.can_access_complaint(complaint_id));

-- Insert feedback: must be the author and have access
DROP POLICY IF EXISTS "feedbacks_insert" ON public.complaint_feedbacks;
CREATE POLICY "feedbacks_insert" ON public.complaint_feedbacks
FOR INSERT WITH CHECK (
  author_user_id = auth.uid() AND public.can_access_complaint(complaint_id)
);

-- Update/delete own feedback
DROP POLICY IF EXISTS "feedbacks_update_own" ON public.complaint_feedbacks;
CREATE POLICY "feedbacks_update_own" ON public.complaint_feedbacks
FOR UPDATE USING (author_user_id = auth.uid()) WITH CHECK (author_user_id = auth.uid());

DROP POLICY IF EXISTS "feedbacks_delete_own" ON public.complaint_feedbacks;
CREATE POLICY "feedbacks_delete_own" ON public.complaint_feedbacks
FOR DELETE USING (author_user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_complaint_feedbacks_updated_at ON public.complaint_feedbacks;
CREATE TRIGGER trg_complaint_feedbacks_updated_at
BEFORE UPDATE ON public.complaint_feedbacks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- View to mask anonymous student authors for principal-side display
CREATE OR REPLACE VIEW public.complaint_feedbacks_principal_view AS
SELECT
  f.id,
  f.complaint_id,
  f.school_id,
  CASE WHEN c.flow = 'student_to_principal' AND f.author_role = 'sender'
       THEN NULL ELSE f.author_user_id END AS author_user_id,
  f.author_role,
  f.content,
  f.created_at,
  f.updated_at
FROM public.complaint_feedbacks f
JOIN public.complaints c ON c.id = f.complaint_id;

GRANT SELECT ON public.complaint_feedbacks_principal_view TO authenticated;
