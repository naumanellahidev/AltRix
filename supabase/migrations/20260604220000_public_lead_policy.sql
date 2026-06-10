-- Enable lead submissions for public unauthenticated users (parents)
-- 1) Create a SECURE, SECURITY DEFINER function to insert leads bypassing standard RLS
CREATE OR REPLACE FUNCTION public.create_public_lead(
  _school_slug text,
  _full_name text,
  _email text,
  _phone text,
  _notes text,
  _source text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_pipeline_id uuid;
  v_stage_id uuid;
  v_lead_id uuid;
BEGIN
  -- Resolve school_id from slug
  SELECT id INTO v_school_id FROM public.schools WHERE slug = _school_slug;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'School slug "%" not found', _school_slug;
  END IF;

  -- Ensure default pipeline exists
  PERFORM public.ensure_default_crm_pipeline(v_school_id);

  -- Retrieve the default pipeline ID
  SELECT id INTO v_pipeline_id FROM public.crm_pipelines 
  WHERE school_id = v_school_id AND is_default = true LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    -- Fallback: take any pipeline if default is missing
    SELECT id INTO v_pipeline_id FROM public.crm_pipelines 
    WHERE school_id = v_school_id LIMIT 1;
  END IF;

  -- Retrieve the first stage (lowest sort_order)
  SELECT id INTO v_stage_id FROM public.crm_stages 
  WHERE school_id = v_school_id AND pipeline_id = v_pipeline_id 
  ORDER BY sort_order ASC LIMIT 1;

  IF v_stage_id IS NULL THEN
    -- Fallback: create a default stage if none exist
    INSERT INTO public.crm_stages (school_id, pipeline_id, name, sort_order)
    VALUES (v_school_id, v_pipeline_id, 'Inquiry / New', 0)
    RETURNING id INTO v_stage_id;
  END IF;

  -- Insert the public lead
  INSERT INTO public.crm_leads (
    school_id,
    pipeline_id,
    stage_id,
    full_name,
    email,
    phone,
    source,
    notes,
    status,
    score
  ) VALUES (
    v_school_id,
    v_pipeline_id,
    v_stage_id,
    _full_name,
    _email,
    _phone,
    COALESCE(_source, 'Website Inquiry Form'),
    _notes,
    'open',
    10 -- Initial score for web inquiries
  ) RETURNING id INTO v_lead_id;

  -- Log initial activity timeline entry
  INSERT INTO public.crm_activities (
    school_id,
    lead_id,
    activity_type,
    summary,
    created_at
  ) VALUES (
    v_school_id,
    v_lead_id,
    'system_event',
    'Lead submitted inquiry details via public online form.',
    now()
  );

  RETURN v_lead_id;
END;
$$;

-- 2) Create RLS insert policy for anonymous insertions
DROP POLICY IF EXISTS "Public anonymous insert crm_leads" ON public.crm_leads;
CREATE POLICY "Public anonymous insert crm_leads"
ON public.crm_leads FOR INSERT
TO anon
WITH CHECK (source = 'Website Inquiry Form' OR source = 'Public Form');
