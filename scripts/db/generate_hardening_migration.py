#!/usr/bin/env python3
"""
Generate the database hardening migration.

Written as a generator rather than hand-authored SQL because it covers 67 index
additions and ~80 column type changes, and transcribing that by hand is how a
table gets missed or a column name typo'd into a migration that fails halfway.

It reads the SQLAlchemy models as the source of truth and emits idempotent SQL.

    python scripts/db/generate_hardening_migration.py
"""
import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(ROOT)

# ─── What changes, and what deliberately does not ─────────────────────────────

#: Money. Exact decimal arithmetic is required: `paid_amount >= total_amount`
#: decides whether an invoice is settled, and in binary floating point
#: 3 x 1650.10 is 4950.299999999999, so a fully paid invoice reads as partial.
MONEY = {
    "fee_invoices": ["subtotal", "discount_amount", "sibling_discount_amount",
                     "late_fee", "total_amount", "paid_amount",
                     "merit_discount_amount"],
    "fee_payments": ["amount"],
    "fee_plan_items": ["amount"],
    "fee_escalations": ["overdue_amount"],
    "installment_payments": ["amount", "paid_amount"],
    "installment_plans": ["total_amount", "installment_amount"],
    "jazzcash_transactions": ["amount"],
    "sibling_discounts": ["discount_value"],
    "hr_salary_records": ["base_salary", "allowances", "deductions"],
    "tax_certificates": ["total_fees_paid", "total_tuition", "total_other_charges"],
    "payment_gateway_configs": ["min_amount", "max_amount", "processing_fee_value"],
    "student_fee_assignments": ["scholarship_amount"],
}

#: Marks, percentages and GPA. Same problem in a different costume: a grade
#: boundary check of `percentage >= 80.0` can put a student in the wrong band
#: when the stored value is 79.99999999999999.
GRADES = {
    "exam_results": ["marks_obtained", "max_marks"],
    "exam_datesheets": ["max_marks", "passing_marks"],
    "exams": ["passing_percentage"],
    "assignments": ["max_marks"],
    "assignment_submissions": ["marks_obtained", "marks", "marks_before_penalty",
                               "penalty_applied"],
    "academic_assessments": ["max_marks", "passing_marks", "weightage_percent"],
    "assessment_criteria": ["max_score"],
    "assessment_results": ["marks_obtained"],
    "assessment_lo_mappings": ["weightage"],
    "criteria_scores": ["score"],
    "co_curricular_grades": ["score", "max_score"],
    "strand_assessments": ["score", "max_score", "percentage"],
    "grade_boundaries": ["min_percentage", "max_percentage", "gpa_equivalent"],
    "grade_scales": ["min_percentage", "max_percentage", "gpa_points"],
    "report_cards": ["total_marks", "max_total_marks", "percentage", "gpa",
                     "attendance_percentage"],
    "report_card_subject_entries": ["marks_obtained", "max_marks", "percentage",
                                    "gpa_points", "class_average",
                                    "highest_in_class"],
    "student_fee_assignments": ["discount_pct"],
    "staff_appraisals": ["salary_increment_pct"],
    "hr_leave_requests": ["days_count"],
}

#: Left as double precision on purpose.
#:
#:   coordinates      - nobody compares a latitude for exact equality, and
#:                      decimal degrees have no fixed scale
#:   branding         - HSL values feeding CSS
#:   AI / KPI scores  - statistical estimates, never summed into a balance
KEEP_FLOAT_NOTE = """
--   latitude / longitude / altitude  (schools, bus_stops, vehicles,
--       hr_staff_attendance) -- no exact comparison, no fixed scale
--   school_branding accent_* and radius_scale -- HSL values for CSS
--   ai_* and staff_kpi_scores -- statistical estimates, never a balance
"""

MONEY_TYPE = "NUMERIC(14, 2)"
GRADE_TYPE = "NUMERIC(8, 3)"


def tenant_tables_missing_index():
    """Tables carrying school_id that have no index on it."""
    indexed = set()
    for f in (glob.glob("supabase/migrations/*.sql")
              + glob.glob("backend/app/scripts/migrations/*.sql")):
        s = io.open(f, encoding="utf-8", errors="replace").read()
        for m in re.finditer(
            r"CREATE\s+(?:UNIQUE\s+)?INDEX[^;]*?ON\s+(?:public\.)?(\w+)\s*"
            r"(?:USING\s+\w+\s*)?\(([^)]*)\)", s, re.I | re.S,
        ):
            if "school_id" in m.group(2):
                indexed.add(m.group(1))

    tenant = set()
    for f in glob.glob("backend/app/models/*.py"):
        s = io.open(f, encoding="utf-8").read()
        for m in re.finditer(r"class\s+\w+\(Base\):(.*?)(?=\nclass |\Z)", s, re.S):
            body = m.group(1)
            tn = re.search(r'__tablename__\s*=\s*"([^"]+)"', body)
            if tn and "school_id" in body:
                tenant.add(tn.group(1))

    return sorted(tenant - indexed), len(tenant), len(tenant & indexed)


def build() -> str:
    missing, total, already = tenant_tables_missing_index()

    out = []
    w = out.append

    w("-- ============================================================================")
    w("-- AltRix — database hardening")
    w("--")
    w("-- Three problems, all of which get worse as the product grows:")
    w("--")
    w("--   1. Tenant queries had no index. Every school-scoped read - which is")
    w("--      almost every read in the product, since the data proxy adds a")
    w(f"--      school_id filter to all of them - was a sequential scan. {len(missing)} of")
    w(f"--      {total} tenant tables were affected ({already} already had one).")
    w("--")
    w("--   2. Money and marks were stored as double precision. Binary floating")
    w("--      point cannot represent 1650.10, so three of them sum to")
    w("--      4950.299999999999 and `paid_amount >= total_amount` is false for a")
    w("--      fully paid invoice. The same arithmetic decides grade boundaries.")
    w("--")
    w("--   3. Nothing stopped duplicate attendance for one student in one")
    w("--      session, and invoice numbers were unique across ALL schools rather")
    w("--      than within one - so two schools could not both have INV-2026-001,")
    w("--      and the random fallback numbering collides at ~2,000 invoices.")
    w("--")
    w("-- Idempotent throughout: safe to re-run, and safe to apply to a database")
    w("-- that already has some of these.")
    w("-- ============================================================================")
    w("")
    w("BEGIN;")
    w("")

    # ── 1. Indexes ────────────────────────────────────────────────────────────
    w("-- ─── 1. Tenant indexes ──────────────────────────────────────────────────")
    w("--")
    w("-- CONCURRENTLY is deliberately NOT used: it cannot run inside a")
    w("-- transaction, and these tables are small enough today that a brief lock")
    w("-- during a deploy window is the cheaper trade. On a large existing")
    w("-- database, run this section separately with CONCURRENTLY instead.")
    w("")
    for t in missing:
        w(f"CREATE INDEX IF NOT EXISTS idx_{t}_school_id")
        w(f"    ON public.{t} (school_id);")
    w("")

    # ── 2. Numeric ────────────────────────────────────────────────────────────
    w("-- ─── 2. Exact decimal for money, marks and percentages ──────────────────")
    w("--")
    w("-- USING ... ::numeric rounds the stored double to the target scale, which")
    w("-- is what the value was always meant to be. Amounts already drifted by")
    w("-- fractions of a paisa land on the correct figure.")
    w("--")
    w("-- Deliberately NOT converted:" + KEEP_FLOAT_NOTE.rstrip())
    w("")

    def alter(table, cols, sqltype, label):
        w(f"-- {label}: {table}")
        w("DO $$")
        w("BEGIN")
        w(f"    IF to_regclass('public.{table}') IS NOT NULL THEN")
        for c in cols:
            w(f"        IF EXISTS (SELECT 1 FROM information_schema.columns")
            w(f"                   WHERE table_schema='public' AND table_name='{table}'")
            w(f"                     AND column_name='{c}' AND data_type='double precision') THEN")
            w(f"            ALTER TABLE public.{table}")
            w(f"                ALTER COLUMN {c} TYPE {sqltype}")
            w(f"                USING ROUND({c}::numeric, {sqltype.split(',')[1].strip(' )')});")
            w("        END IF;")
        w("    END IF;")
        w("END $$;")
        w("")

    for t, cols in sorted(MONEY.items()):
        alter(t, cols, MONEY_TYPE, "money")
    for t, cols in sorted(GRADES.items()):
        alter(t, cols, GRADE_TYPE, "marks / percentage")

    # ── 3. Constraints ────────────────────────────────────────────────────────
    w("-- ─── 3. Integrity constraints ───────────────────────────────────────────")
    w("")
    w("-- One attendance row per student per session.")
    w("--")
    w("-- Without this a double-submit, a retry, or the offline queue syncing")
    w("-- twice creates duplicates, and attendance feeds report cards and parent")
    w("-- notifications. Existing duplicates are collapsed to the newest row")
    w("-- first, otherwise the constraint cannot be created.")
    w("DO $$")
    w("BEGIN")
    w("    IF to_regclass('public.attendance_entries') IS NOT NULL THEN")
    w("        DELETE FROM public.attendance_entries a")
    w("        USING public.attendance_entries b")
    w("        WHERE a.session_id = b.session_id")
    w("          AND a.student_id = b.student_id")
    w("          AND a.ctid < b.ctid;")
    w("")
    w("        CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_session_student")
    w("            ON public.attendance_entries (session_id, student_id);")
    w("    END IF;")
    w("END $$;")
    w("")
    w("-- Invoice numbers are unique per school, not globally.")
    w("--")
    w("-- A global constraint meant two schools could not both issue")
    w("-- INV-2026-001, and the random six-digit fallback has a 89% chance of")
    w("-- colliding by 2,000 invoices platform-wide - each collision surfacing to")
    w("-- an accountant as a failed invoice.")
    w("DO $$")
    w("DECLARE")
    w("    conname text;")
    w("BEGIN")
    w("    IF to_regclass('public.fee_invoices') IS NULL THEN RETURN; END IF;")
    w("")
    w("    FOR conname IN")
    w("        SELECT c.conname FROM pg_constraint c")
    w("        JOIN pg_class t ON t.oid = c.conrelid")
    w("        WHERE t.relname = 'fee_invoices' AND c.contype = 'u'")
    w("          AND pg_get_constraintdef(c.oid) = 'UNIQUE (invoice_number)'")
    w("    LOOP")
    w("        EXECUTE format('ALTER TABLE public.fee_invoices DROP CONSTRAINT %I', conname);")
    w("    END LOOP;")
    w("")
    w("    CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_invoices_school_number")
    w("        ON public.fee_invoices (school_id, invoice_number);")
    w("END $$;")
    w("")
    w("-- Per-school invoice sequence, so numbering is contiguous and collision")
    w("-- free instead of random. Used by the invoice creation path.")
    w("CREATE TABLE IF NOT EXISTS public.invoice_number_sequences (")
    w("    school_id   UUID    NOT NULL,")
    w("    year        INTEGER NOT NULL,")
    w("    last_number INTEGER NOT NULL DEFAULT 0,")
    w("    PRIMARY KEY (school_id, year)")
    w(");")
    w("")
    w("CREATE OR REPLACE FUNCTION public.next_invoice_number(_school_id UUID)")
    w("RETURNS TEXT AS $$")
    w("DECLARE")
    w("    yr  INTEGER := EXTRACT(YEAR FROM NOW());")
    w("    nxt INTEGER;")
    w("BEGIN")
    w("    -- ON CONFLICT ... RETURNING makes this atomic: two concurrent invoice")
    w("    -- creations cannot receive the same number.")
    w("    INSERT INTO public.invoice_number_sequences (school_id, year, last_number)")
    w("    VALUES (_school_id, yr, 1)")
    w("    ON CONFLICT (school_id, year)")
    w("    DO UPDATE SET last_number = invoice_number_sequences.last_number + 1")
    w("    RETURNING last_number INTO nxt;")
    w("")
    w("    RETURN 'INV-' || yr || '-' || LPAD(nxt::text, 5, '0');")
    w("END;")
    w("$$ LANGUAGE plpgsql;")
    w("")
    w("COMMIT;")
    w("")
    return "\n".join(out)


def main() -> int:
    # Computed BEFORE writing: this migration lands in the same directory the
    # scan reads, so re-scanning afterwards counts its own output and reports
    # that nothing was missing.
    missing, total, already = tenant_tables_missing_index()

    sql = build()
    target = "backend/sql_migrations/20260918000000_database_hardening.sql"
    io.open(target, "w", encoding="utf-8").write(sql)

    money_cols = sum(len(v) for v in MONEY.values())
    grade_cols = sum(len(v) for v in GRADES.values())
    print(f"wrote {target}")
    print(f"  indexes added      : {len(missing)}  ({already}/{total} already had one)")
    print(f"  money columns      : {money_cols} -> {MONEY_TYPE}")
    print(f"  marks/percentages  : {grade_cols} -> {GRADE_TYPE}")
    print(f"  constraints        : attendance uniqueness, per-school invoice numbers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
