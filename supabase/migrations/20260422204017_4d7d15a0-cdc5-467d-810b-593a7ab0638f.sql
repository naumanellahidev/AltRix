-- Complaints system
-- Two flows: 
--   * student_to_principal: anonymous (sender hidden), goes to principal/vice_principal
--   * teacher_to_parent: fully named, identifies child + teacher, goes to that child's guardians

CREATE TABLE IF NOT EXISTS public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  flow TEXT NOT NULL CHECK (flow IN ('student_to_principal','teacher_to_parent')),
  sender_user_id UUID NOT NULL,
  -- For teacher_to_parent: the student this is about (we then route to guardians)
  -- For student_to_principal: optional self-link (we never display)
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  category TEXT,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','dismissed')),
  resolution_note TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaints_school_flow ON public.complaints(school_id, flow, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_student ON public.complaints(student_id);
CREATE INDEX IF NOT EXISTS idx_complaints_sender ON public.complaints(sender_user_id);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- INSERT: students can file student_to_principal; teachers can file teacher_to_parent
DROP POLICY IF EXISTS "Complaints insert by sender" ON public.complaints;
CREATE POLICY "Complaints insert by sender"
  ON public.complaints FOR INSERT
  WITH CHECK (
    sender_user_id = auth.uid()
    AND (
      (flow = 'student_to_principal'
        AND EXISTS (SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid() AND ur.school_id = complaints.school_id AND ur.role = 'student'))
      OR
      (flow = 'teacher_to_parent'
        AND EXISTS (SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid() AND ur.school_id = complaints.school_id AND ur.role = 'teacher')
        AND complaints.student_id IS NOT NULL)
    )
  );

-- SELECT visibility:
--  * sender always sees own complaint (so student can track their own; sender_id is never shown to others)
--  * student_to_principal: principals/vice_principals/owners see it (without exposing sender to UI)
--  * teacher_to_parent: guardians of that student see it; principals/vice_principals see it
DROP POLICY IF EXISTS "Complaints select" ON public.complaints;
CREATE POLICY "Complaints select"
  ON public.complaints FOR SELECT
  USING (
    sender_user_id = auth.uid()
    OR (
      flow = 'student_to_principal'
      AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid()
                    AND ur.school_id = complaints.school_id
                    AND ur.role IN ('principal','vice_principal','school_owner','super_admin'))
    )
    OR (
      flow = 'teacher_to_parent'
      AND (
        EXISTS (SELECT 1 FROM public.student_guardians sg
                WHERE sg.student_id = complaints.student_id AND sg.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = auth.uid()
                     AND ur.school_id = complaints.school_id
                     AND ur.role IN ('principal','vice_principal','school_owner','super_admin'))
      )
    )
  );

-- UPDATE: principals/vice_principals can update status & resolution for student_to_principal;
-- guardians and principals can mark teacher_to_parent as resolved/in_review for their child
DROP POLICY IF EXISTS "Complaints update" ON public.complaints;
CREATE POLICY "Complaints update"
  ON public.complaints FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.school_id = complaints.school_id
              AND ur.role IN ('principal','vice_principal','school_owner','super_admin'))
    OR (flow = 'teacher_to_parent'
        AND EXISTS (SELECT 1 FROM public.student_guardians sg
                    WHERE sg.student_id = complaints.student_id AND sg.user_id = auth.uid()))
  );

-- DELETE: only school owner / super_admin
DROP POLICY IF EXISTS "Complaints delete" ON public.complaints;
CREATE POLICY "Complaints delete"
  ON public.complaints FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.school_id = complaints.school_id
              AND ur.role IN ('school_owner','super_admin'))
  );

-- Trigger: keep updated_at fresh
DROP TRIGGER IF EXISTS complaints_updated_at ON public.complaints;
CREATE TRIGGER complaints_updated_at BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public-safe view for principal screens that hides sender_user_id for student_to_principal flow
CREATE OR REPLACE VIEW public.complaints_principal_view
WITH (security_invoker=on) AS
  SELECT
    id,
    school_id,
    flow,
    CASE WHEN flow = 'student_to_principal' THEN NULL ELSE sender_user_id END AS sender_user_id,
    student_id,
    category,
    subject,
    content,
    status,
    resolution_note,
    resolved_by,
    resolved_at,
    created_at,
    updated_at
  FROM public.complaints;