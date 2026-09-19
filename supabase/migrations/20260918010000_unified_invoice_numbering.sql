-- ============================================================================
-- One invoice number sequence, not two.
--
-- There were two functions issuing invoice numbers, and they disagreed:
--
--   generate_invoice_number()  <prefix>-2026-000412   the school's own prefix,
--                                                     six digits, computed as
--                                                     MAX(existing) + 1
--   next_invoice_number()      INV-2026-00412         a fixed prefix, five
--                                                     digits, atomic, but
--                                                     starting again from 1
--
-- The first is the one fee vouchers use, and MAX + 1 is a race: two accountants
-- generating a batch at the same moment both read MAX = 411 and both issue 412.
-- The second insert then hits the (school_id, invoice_number) unique index and
-- fails. The voucher screen swallowed that failure and fabricated an invoice
-- client-side, so a parent was handed a voucher for an invoice that was not in
-- the database.
--
-- The second function is atomic but, being new, started counting at 1 — which,
-- for a school that had already issued 411 invoices this year, meant reissuing
-- numbers that were already printed on vouchers in parents' hands.
--
-- Now both names resolve to one sequence that:
--   * is atomic   (INSERT ... ON CONFLICT DO UPDATE ... RETURNING),
--   * keeps each school's configured prefix and the six-digit format already
--     printed on its documents, and
--   * on first use for a school and year, starts after the highest number that
--     school has already issued, so no printed number is ever reissued.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_number_sequences (
    school_id   UUID    NOT NULL,
    year        INTEGER NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (school_id, year)
);

-- The prefix a school prints on its invoices. Falls back to INV.
CREATE OR REPLACE FUNCTION public.invoice_prefix_for(_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
    _prefix TEXT;
BEGIN
    IF to_regclass('public.fee_settings') IS NOT NULL THEN
        SELECT NULLIF(TRIM(invoice_prefix), '') INTO _prefix
        FROM public.fee_settings WHERE school_id = _school_id;
    END IF;
    RETURN COALESCE(_prefix, 'INV');
END $fn$;

-- Highest number already issued by this school for this year, in the format
-- <prefix>-<year>-<digits>. Read once per school and year, to seed the sequence.
CREATE OR REPLACE FUNCTION public.highest_issued_invoice_number(
    _school_id UUID, _prefix TEXT, _year INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
    _pattern TEXT := '^' || regexp_replace(_prefix, '([.^$*+?()[\]{}|\\-])', '\\\1', 'g')
                     || '-' || _year || '-([0-9]+)$';
    _max INTEGER;
BEGIN
    IF to_regclass('public.fee_invoices') IS NULL THEN RETURN 0; END IF;

    SELECT COALESCE(MAX((regexp_match(invoice_number, _pattern))[1]::INTEGER), 0)
      INTO _max
      FROM public.fee_invoices
     WHERE school_id = _school_id
       AND invoice_number ~ _pattern;

    RETURN COALESCE(_max, 0);
END $fn$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
    _year   INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
    _prefix TEXT    := public.invoice_prefix_for(_school_id);
    _next   INTEGER;
BEGIN
    IF _school_id IS NULL THEN
        RAISE EXCEPTION 'next_invoice_number: school_id is required';
    END IF;

    -- Seed on first use for this school and year, from what is already
    -- printed. Two sessions seeding at once both compute the same seed and one
    -- insert wins; the other does nothing. Neither issues a number here.
    INSERT INTO public.invoice_number_sequences (school_id, year, last_number)
    VALUES (_school_id, _year,
            public.highest_issued_invoice_number(_school_id, _prefix, _year))
    ON CONFLICT (school_id, year) DO NOTHING;

    -- The row lock taken by this UPDATE serialises concurrent callers, so each
    -- receives a distinct number.
    UPDATE public.invoice_number_sequences
       SET last_number = last_number + 1
     WHERE school_id = _school_id AND year = _year
    RETURNING last_number INTO _next;

    RETURN _prefix || '-' || _year || '-' || LPAD(_next::TEXT, 6, '0');
END $fn$;

-- The name the fee voucher RPC and older code call. Same sequence.
CREATE OR REPLACE FUNCTION public.generate_invoice_number(_school_id UUID)
RETURNS TEXT
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
    SELECT public.next_invoice_number(_school_id);
$fn$;

-- A school that raises its sequence past a number issued outside it (an import,
-- a manual entry) would otherwise collide later. Keep the sequence ahead of any
-- number written directly into the table.
CREATE OR REPLACE FUNCTION public.keep_invoice_sequence_ahead()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
    _year   INTEGER;
    _prefix TEXT;
    _num    INTEGER;
    _match  TEXT[];
BEGIN
    IF NEW.invoice_number IS NULL OR NEW.school_id IS NULL THEN
        RETURN NEW;
    END IF;

    _prefix := public.invoice_prefix_for(NEW.school_id);
    _match := regexp_match(
        NEW.invoice_number,
        '^' || regexp_replace(_prefix, '([.^$*+?()[\]{}|\\-])', '\\\1', 'g')
            || '-([0-9]{4})-([0-9]+)$'
    );
    IF _match IS NULL THEN
        RETURN NEW;
    END IF;

    _year := _match[1]::INTEGER;
    _num  := _match[2]::INTEGER;

    INSERT INTO public.invoice_number_sequences (school_id, year, last_number)
    VALUES (NEW.school_id, _year, _num)
    ON CONFLICT (school_id, year)
    DO UPDATE SET last_number = GREATEST(invoice_number_sequences.last_number, EXCLUDED.last_number);

    RETURN NEW;
END $fn$;

DO $$
BEGIN
    IF to_regclass('public.fee_invoices') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_keep_invoice_sequence_ahead ON public.fee_invoices;
        CREATE TRIGGER trg_keep_invoice_sequence_ahead
            AFTER INSERT ON public.fee_invoices
            FOR EACH ROW EXECUTE FUNCTION public.keep_invoice_sequence_ahead();
    END IF;
END $$;

-- Existing sequences were seeded from 1 by the previous definition. Lift any
-- that fell behind what the school had already printed.
DO $$
DECLARE
    r RECORD;
    _seed INTEGER;
BEGIN
    IF to_regclass('public.fee_invoices') IS NULL THEN RETURN; END IF;
    FOR r IN SELECT school_id, year, last_number FROM public.invoice_number_sequences LOOP
        _seed := public.highest_issued_invoice_number(
            r.school_id, public.invoice_prefix_for(r.school_id), r.year);
        IF _seed > r.last_number THEN
            UPDATE public.invoice_number_sequences
               SET last_number = _seed
             WHERE school_id = r.school_id AND year = r.year;
        END IF;
    END LOOP;
END $$;

COMMIT;
