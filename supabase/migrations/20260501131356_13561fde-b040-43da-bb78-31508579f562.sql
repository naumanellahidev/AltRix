CREATE TABLE IF NOT EXISTS public.password_reset_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_password_reset_rate_limits_email_requested
  ON public.password_reset_rate_limits (email_hash, requested_at DESC);