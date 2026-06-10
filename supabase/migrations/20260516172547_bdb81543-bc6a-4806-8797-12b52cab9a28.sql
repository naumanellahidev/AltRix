CREATE TABLE IF NOT EXISTS public.platform_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_user_id UUID NOT NULL,
  school_id UUID NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('new_school','new_campus','other')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requesters insert their own platform requests"
ON public.platform_requests FOR INSERT
WITH CHECK (auth.uid() = requester_user_id);

CREATE POLICY "Requesters view their own platform requests"
ON public.platform_requests FOR SELECT
USING (auth.uid() = requester_user_id OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins update platform requests"
ON public.platform_requests FOR UPDATE
USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_platform_requests_updated_at
BEFORE UPDATE ON public.platform_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_platform_requests_requester ON public.platform_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_platform_requests_status ON public.platform_requests(status);