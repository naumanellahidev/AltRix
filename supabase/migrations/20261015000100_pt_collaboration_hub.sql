-- Migration: Parent‑Teacher Collaboration Hub schema
-- Creates encrypted conversation and message tables for principals.
CREATE TABLE public.pt_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  title text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.pt_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convo_id uuid NOT NULL REFERENCES public.pt_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  encrypted_body jsonb NOT NULL,    -- { iv: text, data: text }
  created_at timestamp with time zone DEFAULT now()
);

-- Enable Row‑Level Security
ALTER TABLE public.pt_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_messages ENABLE ROW LEVEL SECURITY;

-- Policies – only principals (role) can read/write their school's conversations
CREATE POLICY "principal_read_convo" ON public.pt_conversations
  FOR SELECT USING (school_id = (SELECT school_id FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "principal_insert_convo" ON public.pt_conversations
  FOR INSERT WITH CHECK (school_id = (SELECT school_id FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "principal_delete_convo" ON public.pt_conversations
  FOR DELETE USING (school_id = (SELECT school_id FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "principal_read_msg" ON public.pt_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.pt_conversations pc WHERE pc.id = pt_messages.convo_id AND pc.school_id = (SELECT school_id FROM auth.users WHERE id = auth.uid()))
  );
CREATE POLICY "principal_insert_msg" ON public.pt_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.pt_conversations pc WHERE pc.id = NEW.convo_id AND pc.school_id = (SELECT school_id FROM auth.users WHERE id = auth.uid()))
  );
