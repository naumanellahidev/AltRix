ALTER TABLE public.admin_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID DEFAULT NULL REFERENCES public.admin_messages(id);
NOTIFY pgrst, 'reload schema';