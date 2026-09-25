# -*- coding: utf-8 -*-
"""
Platform billing shows what was billed, and nothing it made up.

The billing page read a table and called a function that did not exist,
then filled the gap with invoices it invented in the browser. A school's
owner could also have marked their own platform invoice Paid, because the
table sat among the school's own configuration.
"""
import io
import re

MIGRATION = io.open("sql_migrations/20261031000300_platform_billing.sql", encoding="utf-8").read()
PAGE = io.open("../src/pages/platform/PlatformBillingPage.tsx", encoding="utf-8").read()
POLICY = io.open("app/utils/db_proxy_policy.py", encoding="utf-8").read()


def test_the_invoices_table_and_the_billing_run_exist():
    assert "CREATE TABLE IF NOT EXISTS public.platform_invoices" in MIGRATION
    assert "CREATE OR REPLACE FUNCTION public.cron_generate_platform_invoices()" in MIGRATION
    assert "ADD COLUMN IF NOT EXISTS next_billing_date" in MIGRATION
    assert "ADD COLUMN IF NOT EXISTS billing_status" in MIGRATION


def test_money_is_exact_and_an_invoice_is_never_deleted_with_its_school():
    assert "numeric(12, 2)" in MIGRATION
    assert "ON DELETE RESTRICT" in MIGRATION


def test_the_run_is_the_platform_owners_and_raises_each_invoice_once():
    run = MIGRATION[MIGRATION.index("FUNCTION public.cron_generate_platform_invoices"):]
    assert "is_platform_owner(auth.uid())" in run
    assert "uq_platform_invoice_recurring" in MIGRATION and "ON CONFLICT DO NOTHING" in run
    # A school with no billing date is scheduled, not billed by surprise.
    assert "IF s.next_billing_date IS NULL THEN" in run


def test_no_invoice_plan_or_amount_is_invented_in_the_browser():
    assert "local_platform_invoices" not in PAGE
    assert "local-inv" not in PAGE
    assert "local_billing_school" not in PAGE
    assert "Simulated" not in PAGE and "Local simulation" not in PAGE
    # A school with no amount shows "Not billed", not a template price.
    # (the plan picker may list template prices; a school's own amount may not
    # fall back to one)
    assert "billing_amount: Number(s.billing_amount ?? 0)" in PAGE
    assert "s.billing_amount || (planTemplates" not in PAGE
    assert '"Not billed"' in PAGE and '"Not scheduled"' in PAGE


def test_no_email_is_claimed_that_was_never_sent():
    assert "notification sent" not in PAGE
    # (an input may still use it as a placeholder; the toast may not claim it)
    assert '|| "principal@school.com"' not in PAGE


def test_a_school_cannot_touch_its_platform_invoices():
    platform_only = re.search(r"PLATFORM_ONLY_TABLES: Set\[str\] = \{([^}]*)\}", POLICY).group(1)
    assert '"platform_invoices"' in platform_only
    config = re.search(r"SCHOOL_CONFIG_TABLES: Set\[str\] = \{([^}]*)\}", POLICY).group(1)
    assert "platform_invoices" not in config
