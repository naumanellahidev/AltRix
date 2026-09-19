-- ============================================================================
-- Employment contracts get real reference numbers.
--
-- The contract form said "Reference No. — auto if blank", but nothing assigned
-- one: the appointment letter printed "HR-" and the first eight characters of
-- the row's id instead (HR-3F9A2C1B). Letters already in staff files carry that
-- string, so it is kept for them; every new contract gets the next number in
-- the school's own sequence for the year, HR-2026-0001, HR-2026-0002, …
--
--   * atomic: INSERT ... ON CONFLICT DO UPDATE ... RETURNING, so two HR staff
--     saving at the same moment never receive the same number;
--   * seeded, on first use for a school and year, from the highest HR-<year>-n
--     the school has already typed in by hand, so no number is issued twice;
--   * clearing the reference when editing keeps the one already issued — a
--     printed letter's reference never changes under it.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.hr_contract_reference_sequences (
    school_id   UUID    NOT NULL,
    year        INTEGER NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (school_id, year)
);

ALTER TABLE public.hr_contract_reference_sequences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_hr_contract_reference(_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
    _year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    _pattern TEXT := '^HR-' || _year || '-([0-9]+)$';
    _seed INTEGER;
    _n INTEGER;
BEGIN
    SELECT COALESCE(MAX((regexp_match(reference_number, _pattern))[1]::INTEGER), 0)
      INTO _seed
      FROM public.hr_contracts
     WHERE school_id = _school_id
       AND reference_number ~ _pattern;

    INSERT INTO public.hr_contract_reference_sequences AS s (school_id, year, last_number)
    VALUES (_school_id, _year, COALESCE(_seed, 0) + 1)
    ON CONFLICT (school_id, year)
    DO UPDATE SET last_number = GREATEST(s.last_number, COALESCE(_seed, 0)) + 1
    RETURNING last_number INTO _n;

    RETURN 'HR-' || _year || '-' || lpad(_n::TEXT, 4, '0');
END $fn$;

CREATE OR REPLACE FUNCTION public.assign_hr_contract_reference()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
    NEW.reference_number := NULLIF(TRIM(NEW.reference_number), '');
    IF NEW.reference_number IS NULL THEN
        IF TG_OP = 'UPDATE' AND OLD.reference_number IS NOT NULL THEN
            NEW.reference_number := OLD.reference_number;
        ELSE
            NEW.reference_number := public.next_hr_contract_reference(NEW.school_id);
        END IF;
    END IF;
    RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_assign_hr_contract_reference ON public.hr_contracts;
CREATE TRIGGER trg_assign_hr_contract_reference
    BEFORE INSERT OR UPDATE OF reference_number ON public.hr_contracts
    FOR EACH ROW EXECUTE FUNCTION public.assign_hr_contract_reference();

-- Contracts saved before this carry the reference their letters were printed
-- with. Written without firing the trigger's numbering (the value is set).
UPDATE public.hr_contracts
   SET reference_number = 'HR-' || upper(left(id::TEXT, 8))
 WHERE NULLIF(TRIM(reference_number), '') IS NULL;

REVOKE ALL ON FUNCTION public.next_hr_contract_reference(UUID) FROM PUBLIC;

COMMIT;
