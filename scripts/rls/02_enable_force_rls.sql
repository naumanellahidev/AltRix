-- ============================================================================
-- AltRix — Step 2 of 3: enforce row-level security
--
-- Run as a superuser, AFTER 01_create_app_role.sql and AFTER
-- 03_verify_rls.sql has reported a clean result in a staging copy.
--
-- What FORCE does
-- ---------------
-- ALTER TABLE ... FORCE ROW LEVEL SECURITY makes policies apply to the table's
-- owner as well. Without it, anything connecting as the owner (today: the API)
-- sees every row regardless of policy.
--
-- THE IMPORTANT SAFETY RULE
-- -------------------------
-- A table with RLS enabled and ZERO policies denies everything. Enabling FORCE
-- across the board would therefore make parts of the product return empty
-- results rather than errors -- the silent-empty-data failure mode, which is
-- far worse than a crash because nobody notices.
--
-- So this script only touches tables that already have at least one policy, and
-- prints the tables it skipped so they can be reviewed by hand.
-- ============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Tables that have policies -> enable + force
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r           record;
    forced_count int := 0;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND EXISTS (
              SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
          )
        ORDER BY c.relname
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname
        );
        EXECUTE format(
            'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname
        );
        forced_count := forced_count + 1;
    END LOOP;

    RAISE NOTICE 'FORCE ROW LEVEL SECURITY applied to % table(s)', forced_count;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables with NO policies -> report only, change nothing
--
--    Each of these needs a decision:
--      * tenant data      -> write a policy, then re-run this script
--      * reference data   -> add a permissive read-only policy
--      * internal/ops     -> leave RLS off; the API reaches it through routers
--                            that do their own checks
-- ---------------------------------------------------------------------------
SELECT
    c.relname                                     AS table_without_policies,
    c.relrowsecurity                              AS rls_enabled,
    EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'school_id'
          AND NOT a.attisdropped
    )                                             AS looks_tenant_scoped,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
ORDER BY looks_tenant_scoped DESC, c.relname;

-- Rows where looks_tenant_scoped = true are the ones that matter most:
-- they hold per-school data but have no policy protecting them.

-- ---------------------------------------------------------------------------
-- 3. Any table with RLS enabled but no policies is a deny-all trap.
--    This should return zero rows; if it does not, fix those before cutover.
-- ---------------------------------------------------------------------------
SELECT c.relname AS deny_all_table
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
ORDER BY c.relname;
