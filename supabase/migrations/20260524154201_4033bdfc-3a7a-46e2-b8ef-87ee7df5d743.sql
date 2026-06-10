-- ============================================================
-- Helper: can_manage_hr
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_manage_hr(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','vice_principal','hr_manager','accountant')
  );
$$;

-- ============================================================
-- Helper: can_view_counseling
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_view_counseling(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','vice_principal','academic_coordinator','counselor')
  );
$$;

-- ============================================================
-- Helper: can_view_crm
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_view_crm(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','vice_principal','marketing_staff','academic_coordinator')
  );
$$;

-- ============================================================
-- Helper: is_school_admin (used by several restricted SELECT policies)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_school_admin(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND school_id = _school_id
      AND role IN ('super_admin','school_owner','principal','vice_principal')
  );
$$;

-- ============================================================
-- AI / counseling tables
-- ============================================================
DROP POLICY IF EXISTS "Members read ai_counseling_queue" ON public.ai_counseling_queue;
CREATE POLICY "Counselors and guardians read ai_counseling_queue"
ON public.ai_counseling_queue FOR SELECT
USING (
  public.can_view_counseling(school_id)
  OR (student_id IS NOT NULL AND public.is_my_child(school_id, student_id))
);

DROP POLICY IF EXISTS "Members read ai_early_warnings" ON public.ai_early_warnings;
CREATE POLICY "Counselors and guardians read ai_early_warnings"
ON public.ai_early_warnings FOR SELECT
USING (
  public.can_view_counseling(school_id)
  OR (student_id IS NOT NULL AND public.is_my_child(school_id, student_id))
);

DROP POLICY IF EXISTS "Members read ai_student_profiles" ON public.ai_student_profiles;
CREATE POLICY "Counselors and guardians read ai_student_profiles"
ON public.ai_student_profiles FOR SELECT
USING (
  public.can_view_counseling(school_id)
  OR (student_id IS NOT NULL AND public.is_my_child(school_id, student_id))
);

-- ============================================================
-- CRM leads
-- ============================================================
DROP POLICY IF EXISTS "Members read crm_leads" ON public.crm_leads;
CREATE POLICY "CRM staff read crm_leads"
ON public.crm_leads FOR SELECT
USING (public.can_view_crm(school_id));

-- ============================================================
-- HR tables (salary, payruns, reviews, contracts, documents)
-- Staff may still see their own records via user_id = auth.uid()
-- ============================================================
DROP POLICY IF EXISTS "Members read hr_salary_records" ON public.hr_salary_records;
CREATE POLICY "HR staff and owners read hr_salary_records"
ON public.hr_salary_records FOR SELECT
USING (public.can_manage_hr(school_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Members read hr_pay_runs" ON public.hr_pay_runs;
CREATE POLICY "HR staff and owners read hr_pay_runs"
ON public.hr_pay_runs FOR SELECT
USING (public.can_manage_hr(school_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Members read hr_reviews" ON public.hr_reviews;
CREATE POLICY "HR staff and owners read hr_reviews"
ON public.hr_reviews FOR SELECT
USING (public.can_manage_hr(school_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Members read hr_contracts" ON public.hr_contracts;
CREATE POLICY "HR staff and owners read hr_contracts"
ON public.hr_contracts FOR SELECT
USING (public.can_manage_hr(school_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Members read hr_documents" ON public.hr_documents;
CREATE POLICY "HR staff and owners read hr_documents"
ON public.hr_documents FOR SELECT
USING (public.can_manage_hr(school_id) OR user_id = auth.uid());

-- ============================================================
-- Parent messages: only sender, recipient, child's guardian, admins
-- ============================================================
DROP POLICY IF EXISTS "Members read parent_messages" ON public.parent_messages;
CREATE POLICY "Participants and admins read parent_messages"
ON public.parent_messages FOR SELECT
USING (
  sender_user_id = auth.uid()
  OR recipient_user_id = auth.uid()
  OR (student_id IS NOT NULL AND public.is_my_child(school_id, student_id))
  OR public.is_school_admin(school_id)
);

-- ============================================================
-- Parent notifications: only the parent and admins
-- ============================================================
DROP POLICY IF EXISTS "Members read parent_notifications" ON public.parent_notifications;
CREATE POLICY "Parent and admins read parent_notifications"
ON public.parent_notifications FOR SELECT
USING (
  parent_user_id = auth.uid()
  OR public.is_school_admin(school_id)
);

-- ============================================================
-- Scheduled messages: only sender and admins
-- ============================================================
DROP POLICY IF EXISTS "Members read scheduled_messages" ON public.scheduled_messages;
CREATE POLICY "Sender and admins read scheduled_messages"
ON public.scheduled_messages FOR SELECT
USING (
  sender_user_id = auth.uid()
  OR public.is_school_admin(school_id)
);

-- ============================================================
-- Storage: admission-documents — enforce school scope via path
-- File path convention: <school_id>/<application_id>/<filename>
-- ============================================================
DROP POLICY IF EXISTS "admission_docs_read" ON storage.objects;
CREATE POLICY "admission_docs_read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'admission-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['super_admin','school_owner','principal','vice_principal','academic_coordinator','hr_manager','teacher'])
      AND ur.school_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS "admission_docs_insert" ON storage.objects;
CREATE POLICY "admission_docs_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'admission-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['super_admin','school_owner','principal','vice_principal','academic_coordinator','hr_manager','teacher'])
      AND ur.school_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS "admission_docs_delete" ON storage.objects;
CREATE POLICY "admission_docs_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'admission-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['super_admin','school_owner','principal','vice_principal','academic_coordinator','hr_manager'])
      AND ur.school_id::text = (storage.foldername(name))[1]
  )
);

-- ============================================================
-- Storage: fee-payment-proofs — guardian-only uploads
-- File path convention: <school_id>/<student_id>/<filename>
-- ============================================================
DROP POLICY IF EXISTS "fpp_storage_parent_insert" ON storage.objects;
CREATE POLICY "fpp_storage_parent_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'fee-payment-proofs'
  AND auth.uid() IS NOT NULL
  AND public.is_my_child(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);