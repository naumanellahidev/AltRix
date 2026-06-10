-- Make exam_id nullable so non-exam cumulative cards can be saved
ALTER TABLE public.report_cards ALTER COLUMN exam_id DROP NOT NULL;

-- Period metadata (additive, all nullable with safe defaults)
ALTER TABLE public.report_cards
  ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'exam',
  ADD COLUMN IF NOT EXISTS period_label text,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS academic_year text,
  ADD COLUMN IF NOT EXISTS last_edited_by uuid;

-- Allow only known period types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_cards_period_type_chk'
  ) THEN
    ALTER TABLE public.report_cards
      ADD CONSTRAINT report_cards_period_type_chk
      CHECK (period_type IN ('exam','monthly','term','annual','cumulative'));
  END IF;
END $$;

-- Partial unique index: one card per student per non-exam period_label
CREATE UNIQUE INDEX IF NOT EXISTS report_cards_period_unique
  ON public.report_cards (school_id, student_id, period_type, period_label)
  WHERE exam_id IS NULL;

-- Helpful filter index for parent/student lists
CREATE INDEX IF NOT EXISTS idx_report_cards_student_published
  ON public.report_cards (student_id, is_published, period_type);