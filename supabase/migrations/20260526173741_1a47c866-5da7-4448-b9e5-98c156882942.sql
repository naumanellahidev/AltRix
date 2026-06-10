-- Tighten SELECT policies on sensitive tables (security findings)

-- 1) admin_messages: scope to sender, recipients, and school admins
DROP POLICY IF EXISTS "Members read admin_messages" ON public.admin_messages;
CREATE POLICY "Sender recipients and admins read admin_messages"
ON public.admin_messages FOR SELECT
USING (
  sender_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.admin_message_recipients r
    WHERE r.message_id = admin_messages.id AND r.recipient_user_id = auth.uid()
  )
  OR public.is_school_admin(school_id)
);

-- 2) ai_academic_predictions: counselors/academic staff, guardians of student, or the student
DROP POLICY IF EXISTS "Members read ai_academic_predictions" ON public.ai_academic_predictions;
CREATE POLICY "Scoped read ai_academic_predictions"
ON public.ai_academic_predictions FOR SELECT
USING (
  public.can_view_counseling(school_id)
  OR public.is_my_child(school_id, student_id)
  OR student_id = public.my_student_id(school_id)
);

-- 3) ai_teacher_performance: HR managers or the teacher themself
DROP POLICY IF EXISTS "Members read ai_teacher_performance" ON public.ai_teacher_performance;
CREATE POLICY "HR and self read ai_teacher_performance"
ON public.ai_teacher_performance FOR SELECT
USING (
  public.can_manage_hr(school_id)
  OR teacher_user_id = auth.uid()
);

-- 4) behavior_notes: academic/counseling staff or guardians of the student
DROP POLICY IF EXISTS "Members read behavior_notes" ON public.behavior_notes;
CREATE POLICY "Staff and guardians read behavior_notes"
ON public.behavior_notes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = behavior_notes.school_id
      AND ur.role IN ('super_admin','school_owner','principal','vice_principal','academic_coordinator','counselor','teacher')
  )
  OR public.is_my_child(school_id, student_id)
);

-- 5) CRM operational tables: gate behind can_view_crm
DROP POLICY IF EXISTS "Members read crm_call_logs" ON public.crm_call_logs;
CREATE POLICY "CRM staff read crm_call_logs"
ON public.crm_call_logs FOR SELECT
USING (public.can_view_crm(school_id));

DROP POLICY IF EXISTS "Members read crm_activities" ON public.crm_activities;
CREATE POLICY "CRM staff read crm_activities"
ON public.crm_activities FOR SELECT
USING (public.can_view_crm(school_id));

DROP POLICY IF EXISTS "Members read crm_follow_ups" ON public.crm_follow_ups;
CREATE POLICY "CRM staff read crm_follow_ups"
ON public.crm_follow_ups FOR SELECT
USING (public.can_view_crm(school_id));

-- 6) Finance tables
DROP POLICY IF EXISTS "Members read finance_expenses" ON public.finance_expenses;
CREATE POLICY "Finance staff read finance_expenses"
ON public.finance_expenses FOR SELECT
USING (public.can_manage_finance(school_id));

DROP POLICY IF EXISTS "Members read finance_invoices" ON public.finance_invoices;
CREATE POLICY "Finance staff and guardians read finance_invoices"
ON public.finance_invoices FOR SELECT
USING (
  public.can_view_fees(school_id)
  OR public.is_my_child(school_id, student_id)
  OR student_id = public.my_student_id(school_id)
);

DROP POLICY IF EXISTS "Members read finance_payments" ON public.finance_payments;
CREATE POLICY "Finance staff and guardians read finance_payments"
ON public.finance_payments FOR SELECT
USING (
  public.can_view_fees(school_id)
  OR public.is_my_child(school_id, student_id)
  OR student_id = public.my_student_id(school_id)
);

-- 7) hr_leave_requests: HR staff or the requester
DROP POLICY IF EXISTS "Members read hr_leave_requests" ON public.hr_leave_requests;
CREATE POLICY "HR and self read hr_leave_requests"
ON public.hr_leave_requests FOR SELECT
USING (
  public.can_manage_hr(school_id)
  OR user_id = auth.uid()
);

-- 8) salary_budget_targets: HR/finance only
DROP POLICY IF EXISTS "Members read salary_budget_targets" ON public.salary_budget_targets;
CREATE POLICY "HR read salary_budget_targets"
ON public.salary_budget_targets FOR SELECT
USING (public.can_manage_hr(school_id));

-- 9) student_guardians: admins, the guardian themself, or staff with academic/counseling oversight
DROP POLICY IF EXISTS "Members read student_guardians" ON public.student_guardians;
CREATE POLICY "Staff and self read student_guardians"
ON public.student_guardians FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = student_guardians.student_id
      AND (
        public.is_school_admin(s.school_id)
        OR public.can_view_counseling(s.school_id)
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.school_id = s.school_id
            AND ur.role IN ('academic_coordinator','teacher','accountant','hr_manager','marketing_staff')
        )
      )
  )
);

-- 10) student-photos storage bucket: make private, restrict reads to authenticated school members
UPDATE storage.buckets SET public = false WHERE id = 'student-photos';

DROP POLICY IF EXISTS "Student photos are publicly readable" ON storage.objects;
CREATE POLICY "School members read student photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-photos'
  AND public.is_school_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
