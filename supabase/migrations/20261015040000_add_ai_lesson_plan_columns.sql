-- Migration to add AI curriculum planning columns to public.lesson_plans table
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS curriculum_type TEXT;
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS grade_level TEXT;
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS lesson_duration_minutes INTEGER DEFAULT 45;
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS bloom_levels TEXT[] DEFAULT '{}';
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS ai_plan_data JSONB;
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS ai_slide_script JSONB;
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS ai_quiz_data JSONB;
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS ai_model_used TEXT;
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS generation_status TEXT DEFAULT 'idle';

NOTIFY pgrst, 'reload schema';
