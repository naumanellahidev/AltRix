CREATE TABLE IF NOT EXISTS public.school_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  attendance_warning_threshold integer NOT NULL DEFAULT 75,
  attendance_critical_threshold integer NOT NULL DEFAULT 60,
  pending_invoices_threshold integer NOT NULL DEFAULT 10,
  support_ticket_hours integer NOT NULL DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view alert settings"
ON public.school_alert_settings FOR SELECT
USING (public.is_school_member(auth.uid(), school_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Admins can insert alert settings"
ON public.school_alert_settings FOR INSERT
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), school_id, 'super_admin')
  OR public.has_role(auth.uid(), school_id, 'school_owner')
  OR public.has_role(auth.uid(), school_id, 'principal')
  OR public.has_role(auth.uid(), school_id, 'vice_principal')
);

CREATE POLICY "Admins can update alert settings"
ON public.school_alert_settings FOR UPDATE
USING (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), school_id, 'super_admin')
  OR public.has_role(auth.uid(), school_id, 'school_owner')
  OR public.has_role(auth.uid(), school_id, 'principal')
  OR public.has_role(auth.uid(), school_id, 'vice_principal')
);

CREATE TRIGGER set_school_alert_settings_updated_at
BEFORE UPDATE ON public.school_alert_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();