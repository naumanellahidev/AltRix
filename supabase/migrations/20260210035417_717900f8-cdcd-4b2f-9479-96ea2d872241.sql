ALTER TABLE public.admin_messages ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] DEFAULT NULL;
NOTIFY pgrst, 'reload schema';