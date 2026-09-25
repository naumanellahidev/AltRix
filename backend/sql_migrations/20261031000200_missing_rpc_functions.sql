-- ============================================================================
-- Six database functions the app has been calling that did not exist.
--
-- They were on the data proxy's allowlist, and the screens called them, but
-- none was ever created on this database, so every call failed:
--   directory_search            the Directory screen's search: printed "No students found."
--   ensure_default_crm_pipeline CRM and Directory lead creation (12 failures in the log)
--   create_public_lead          the website enquiry form
--   get_child_teachers_detailed a parent's "contact my child's teachers"
--   search_messages             message search
--   export_table_schema         the platform's schema viewer
-- Each is written against the tables as they are, keeps callers inside their
-- own school, and never lists the platform owner (is_platform_owner()).
--
-- Also: Beacon had two CRM pipelines both marked default (a race in the old
-- client-side fallback), so every "the default pipeline" lookup failed with
-- "multiple rows". One default is kept per school (the one with the most
-- leads) and a unique index stops a second. Nothing is deleted.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

-- ── One default CRM pipeline per school ─────────────────────────────────────
WITH ranked AS (
  SELECT p.id,
         row_number() OVER (
           PARTITION BY p.school_id
           ORDER BY (SELECT count(*) FROM crm_leads l WHERE l.pipeline_id = p.id) DESC, p.created_at, p.id
         ) AS rn
    FROM crm_pipelines p
   WHERE p.is_default
)
UPDATE crm_pipelines SET is_default = false
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_default_pipeline_per_school
    ON public.crm_pipelines (school_id) WHERE is_default;

-- ── ensure_default_crm_pipeline ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_default_crm_pipeline(_school_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pid uuid;
BEGIN
  SELECT id INTO pid FROM crm_pipelines WHERE school_id = _school_id AND is_default LIMIT 1;
  IF pid IS NOT NULL THEN
    RETURN pid;
  END IF;
  -- A school with pipelines but none marked default: adopt the oldest.
  SELECT id INTO pid FROM crm_pipelines WHERE school_id = _school_id ORDER BY created_at, id LIMIT 1;
  IF pid IS NOT NULL THEN
    UPDATE crm_pipelines SET is_default = true WHERE id = pid;
    RETURN pid;
  END IF;
  INSERT INTO crm_pipelines (school_id, name, is_default)
  VALUES (_school_id, 'Admissions', true)
  ON CONFLICT DO NOTHING
  RETURNING id INTO pid;
  IF pid IS NULL THEN  -- created concurrently
    SELECT id INTO pid FROM crm_pipelines WHERE school_id = _school_id AND is_default LIMIT 1;
    RETURN pid;
  END IF;
  INSERT INTO crm_stages (school_id, pipeline_id, name, sort_order)
  SELECT _school_id, pid, s.name, s.ord
    FROM (VALUES ('New', 10), ('Contacted', 20), ('Tour Scheduled', 30),
                 ('Applied', 40), ('Won', 50), ('Lost', 60)) AS s(name, ord);
  RETURN pid;
END
$$;

-- ── create_public_lead: the website enquiry form ────────────────────────────
CREATE OR REPLACE FUNCTION public.create_public_lead(
  _school_slug text, _full_name text, _email text, _phone text, _notes text, _source text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sid uuid;
  pid uuid;
  first_stage uuid;
  lead_id uuid;
BEGIN
  IF coalesce(length(trim(_full_name)), 0) < 2 OR length(_full_name) > 120 THEN
    RAISE EXCEPTION 'Please give your name.';
  END IF;
  IF coalesce(trim(_email), '') = '' AND coalesce(trim(_phone), '') = '' THEN
    RAISE EXCEPTION 'Please give a phone number or an email address so the school can reply.';
  END IF;
  SELECT id INTO sid FROM schools WHERE slug = _school_slug LIMIT 1;
  IF sid IS NULL THEN
    RAISE EXCEPTION 'That school was not found.';
  END IF;
  pid := ensure_default_crm_pipeline(sid);
  SELECT id INTO first_stage FROM crm_stages WHERE pipeline_id = pid ORDER BY sort_order, created_at LIMIT 1;
  INSERT INTO crm_leads (school_id, pipeline_id, stage_id, full_name, email, phone, source, notes, status, score)
  VALUES (sid, pid, first_stage, trim(_full_name), nullif(trim(_email), ''), nullif(trim(_phone), ''),
          left(coalesce(nullif(trim(_source), ''), 'Website Inquiry Form'), 80), left(_notes, 2000), 'open', 10)
  RETURNING id INTO lead_id;
  -- The people who follow up enquiries hear about it at once.
  INSERT INTO app_notifications (school_id, user_id, type, title, body, entity_type, entity_id, category, action_url)
  SELECT DISTINCT sid, ur.user_id, 'inquiry', 'New admission enquiry',
         'A new enquiry from ' || trim(_full_name) || ' came in through the website.',
         'crm_leads', lead_id, 'admissions', NULL
    FROM user_roles ur
   WHERE ur.school_id = sid
     AND ur.role::text IN ('marketing_staff', 'principal', 'school_admin', 'school_owner')
     AND NOT is_platform_owner(ur.user_id);
  RETURN lead_id;
END
$$;

-- ── directory_search ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.directory_search(
  _school_id uuid, _entity text, _q text, _status text, _limit integer, _offset integer
)
RETURNS TABLE(entity text, id uuid, title text, subtitle text, status text, created_at timestamptz, total_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH allowed AS (
    SELECT is_school_member(auth.uid(), _school_id) OR is_platform_owner(auth.uid()) AS ok
  ),
  needle AS (SELECT '%' || coalesce(nullif(trim(_q), ''), '') || '%' AS pat),
  rows AS (
    SELECT 'students'::text AS entity, s.id,
           trim(concat_ws(' ', s.first_name, s.last_name)) AS title,
           concat_ws(' · ',
             (SELECT concat_ws(' ', ac.name, cs.name) FROM student_enrollments se
                JOIN class_sections cs ON cs.id = se.class_section_id
                JOIN academic_classes ac ON ac.id = cs.class_id
               WHERE se.student_id = s.id AND se.end_date IS NULL LIMIT 1),
             nullif('Roll ' || s.roll_number, 'Roll '),
             s.registration_number) AS subtitle,
           coalesce(s.status::text, 'unknown') AS status,
           s.created_at
      FROM students s, needle
     WHERE _entity = 'students' AND s.school_id = _school_id
       AND (trim(concat_ws(' ', s.first_name, s.last_name)) ILIKE needle.pat
            OR coalesce(s.roll_number::text, '') ILIKE needle.pat
            OR coalesce(s.registration_number, '') ILIKE needle.pat
            OR coalesce(s.parent_name, '') ILIKE needle.pat)
       AND (_status IS NULL
            OR (_status = 'active' AND s.status::text IN ('active', 'enrolled'))
            OR (_status = 'unknown' AND s.status IS NULL)
            OR s.status::text = _status)
    UNION ALL
    SELECT 'staff', ur.user_id,
           coalesce(nullif(p.display_name, ''), p.email, 'Unnamed account'),
           string_agg(DISTINCT initcap(replace(ur.role::text, '_', ' ')), ', '),
           'active', min(p.created_at)
      FROM user_roles ur LEFT JOIN profiles p ON p.id = ur.user_id, needle
     WHERE _entity = 'staff' AND ur.school_id = _school_id
       AND ur.role::text NOT IN ('parent', 'student')
       AND NOT is_platform_owner(ur.user_id)
       AND (coalesce(p.display_name, '') ILIKE needle.pat OR coalesce(p.email, '') ILIKE needle.pat)
       AND (_status IS NULL OR _status = 'active')
     GROUP BY ur.user_id, p.display_name, p.email
    UNION ALL
    SELECT 'leads', l.id, l.full_name,
           concat_ws(' · ', l.phone, l.email, l.source),
           coalesce(l.status, 'open'), l.created_at
      FROM crm_leads l, needle
     WHERE _entity = 'leads' AND l.school_id = _school_id
       AND (l.full_name ILIKE needle.pat OR coalesce(l.email, '') ILIKE needle.pat
            OR coalesce(l.phone, '') ILIKE needle.pat)
       AND (_status IS NULL OR coalesce(l.status, 'open') = _status)
  )
  SELECT r.entity, r.id, r.title, r.subtitle, r.status, r.created_at, count(*) OVER () AS total_count
    FROM rows r, allowed
   WHERE allowed.ok
   ORDER BY r.title NULLS LAST, r.id
   LIMIT greatest(1, least(coalesce(_limit, 25), 5000))
  OFFSET greatest(0, coalesce(_offset, 0));
$$;

-- ── get_child_teachers_detailed ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_child_teachers_detailed(_school_id uuid, _student_id uuid)
RETURNS TABLE(teacher_user_id uuid, display_name text, email text, phone_number text,
              subject_name text, is_class_teacher boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH caller_may AS (
    -- The child's own guardian, the student themself, or the school's staff.
    SELECT EXISTS (SELECT 1 FROM student_guardians g WHERE g.student_id = _student_id AND g.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM students s WHERE s.id = _student_id AND s.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.school_id = _school_id
                    AND ur.role::text NOT IN ('parent', 'student'))
        OR is_platform_owner(auth.uid()) AS ok
  ),
  section AS (
    SELECT se.class_section_id AS id FROM student_enrollments se
      JOIN students s ON s.id = se.student_id
     WHERE se.student_id = _student_id AND se.end_date IS NULL AND s.school_id = _school_id
  ),
  links AS (
    SELECT ta.teacher_user_id, sub.name AS subject_name, (ta.subject_id IS NULL) AS is_class_teacher
      FROM teacher_assignments ta LEFT JOIN subjects sub ON sub.id = ta.subject_id
     WHERE ta.class_section_id IN (SELECT id FROM section)
    UNION
    SELECT tsa.teacher_user_id, sub.name, false
      FROM teacher_subject_assignments tsa LEFT JOIN subjects sub ON sub.id = tsa.subject_id
     WHERE tsa.class_section_id IN (SELECT id FROM section)
    UNION
    SELECT te.teacher_user_id, te.subject_name, false
      FROM timetable_entries te
     WHERE te.class_section_id IN (SELECT id FROM section) AND te.teacher_user_id IS NOT NULL
  )
  SELECT l.teacher_user_id,
         coalesce(nullif(p.display_name, ''), p.email, 'Teacher'),
         p.email, p.phone,
         string_agg(DISTINCT l.subject_name, ', ') FILTER (WHERE l.subject_name IS NOT NULL),
         bool_or(l.is_class_teacher)
    FROM links l
    JOIN caller_may ON caller_may.ok
    LEFT JOIN profiles p ON p.id = l.teacher_user_id
   WHERE l.teacher_user_id IS NOT NULL AND NOT is_platform_owner(l.teacher_user_id)
   GROUP BY l.teacher_user_id, p.display_name, p.email, p.phone
   ORDER BY bool_or(l.is_class_teacher) DESC, 2;
$$;

-- ── search_messages: the caller's own messages only ─────────────────────────
-- _user_id is accepted for the existing callers but not trusted: whoever is
-- signed in (auth.uid()) is whose messages are searched.
CREATE OR REPLACE FUNCTION public.search_messages(_school_id uuid, _user_id uuid, _query text, _limit integer)
RETURNS TABLE(id uuid, subject text, content text, sender_user_id uuid, created_at timestamptz,
              is_sent boolean, relevance real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
       pat AS (SELECT '%' || trim(coalesce(_query, '')) || '%' AS p)
  SELECT m.id, m.subject, m.content, m.sender_user_id, m.created_at,
         (m.sender_user_id = me.uid) AS is_sent,
         ((CASE WHEN coalesce(m.subject, '') ILIKE pat.p THEN 2 ELSE 0 END)
          + (CASE WHEN coalesce(m.content, '') ILIKE pat.p THEN 1 ELSE 0 END))::real AS relevance
    FROM admin_messages m, me, pat
   WHERE m.school_id = _school_id
     AND me.uid IS NOT NULL
     AND length(trim(coalesce(_query, ''))) >= 2
     AND (m.sender_user_id = me.uid
          OR EXISTS (SELECT 1 FROM admin_message_recipients r WHERE r.message_id = m.id AND r.recipient_user_id = me.uid))
     AND (coalesce(m.subject, '') ILIKE pat.p OR coalesce(m.content, '') ILIKE pat.p)
   ORDER BY relevance DESC, m.created_at DESC
   LIMIT greatest(1, least(coalesce(_limit, 50), 200));
$$;

-- ── export_table_schema: the platform owner's schema viewer ─────────────────
CREATE OR REPLACE FUNCTION public.export_table_schema()
RETURNS TABLE("table" text, columns jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.table_name::text,
         jsonb_agg(jsonb_build_object('name', c.column_name, 'type', c.data_type,
                                      'nullable', c.is_nullable = 'YES', 'default', c.column_default)
                   ORDER BY c.ordinal_position)
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
   WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
     AND is_platform_owner(auth.uid())
   GROUP BY c.table_name
   ORDER BY c.table_name;
$$;

COMMIT;
