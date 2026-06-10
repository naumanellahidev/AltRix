-- Migration: Fix Principal RLS Policies
-- Replaces incorrect school_id references on auth.users with public.is_school_member utility function.

-- 1) pt_conversations Policies
DROP POLICY IF EXISTS "principal_read_convo" ON public.pt_conversations;
DROP POLICY IF EXISTS "principal_insert_convo" ON public.pt_conversations;
DROP POLICY IF EXISTS "principal_delete_convo" ON public.pt_conversations;

CREATE POLICY "principal_read_convo" ON public.pt_conversations
  FOR SELECT USING (public.is_school_member(school_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "principal_insert_convo" ON public.pt_conversations
  FOR INSERT WITH CHECK (public.is_school_member(school_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "principal_delete_convo" ON public.pt_conversations
  FOR DELETE USING (public.is_school_member(school_id) OR public.is_platform_admin(auth.uid()));


-- 2) pt_messages Policies
DROP POLICY IF EXISTS "principal_read_msg" ON public.pt_messages;
DROP POLICY IF EXISTS "principal_insert_msg" ON public.pt_messages;

CREATE POLICY "principal_read_msg" ON public.pt_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.pt_conversations pc 
      WHERE pc.id = pt_messages.convo_id 
        AND (public.is_school_member(pc.school_id) OR public.is_platform_admin(auth.uid()))
    )
  );

CREATE POLICY "principal_insert_msg" ON public.pt_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pt_conversations pc 
      WHERE pc.id = NEW.convo_id 
        AND (public.is_school_member(pc.school_id) OR public.is_platform_admin(auth.uid()))
    )
  );


-- 3) budget_scenarios Policies
DROP POLICY IF EXISTS "principal_read_scenario" ON public.budget_scenarios;
DROP POLICY IF EXISTS "principal_insert_scenario" ON public.budget_scenarios;
DROP POLICY IF EXISTS "principal_update_scenario" ON public.budget_scenarios;
DROP POLICY IF EXISTS "principal_delete_scenario" ON public.budget_scenarios;

CREATE POLICY "principal_read_scenario" ON public.budget_scenarios
  FOR SELECT USING (public.is_school_member(school_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "principal_insert_scenario" ON public.budget_scenarios
  FOR INSERT WITH CHECK (public.is_school_member(school_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "principal_update_scenario" ON public.budget_scenarios
  FOR UPDATE USING (public.is_school_member(school_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_school_member(school_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "principal_delete_scenario" ON public.budget_scenarios
  FOR DELETE USING (public.is_school_member(school_id) OR public.is_platform_admin(auth.uid()));
