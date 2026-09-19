-- ============================================================================
-- AltRix — Step 1 of 3: create the least-privilege application role
--
-- Run as a superuser (the postgres user), once per environment.
--
-- Why this exists
-- ---------------
-- The API currently connects as `postgres`, which both owns every table and is
-- a superuser. Postgres skips row-level security for superusers, and for table
-- owners unless the table is marked FORCE. The result is that all ~604 RLS
-- policies in supabase/migrations are never evaluated on the API's connection.
--
-- This role is an ordinary login role: no superuser, no BYPASSRLS, no
-- ownership of the tables it reads. Once the API connects as this role, the
-- policies begin to apply.
--
-- Deliberately NOT granted
-- ------------------------
--   SUPERUSER / BYPASSRLS  - would reintroduce the exact problem
--   CREATEROLE / CREATEDB  - not needed by the API
--   CREATE ON SCHEMA       - the API must not run DDL; see the runbook note
--                            about removing the startup DDL before cutover
-- ============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. The role. Replace the password before running, or set it afterwards with
--    ALTER ROLE altrix_app WITH PASSWORD '...';
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'altrix_app') THEN
        CREATE ROLE altrix_app LOGIN PASSWORD 'CHANGE_ME_BEFORE_RUNNING';
        RAISE NOTICE 'Created role altrix_app';
    ELSE
        RAISE NOTICE 'Role altrix_app already exists, leaving it alone';
    END IF;
END
$$;

-- Belt and braces: make sure the role never carries the attributes that would
-- silently disable RLS again, even if it was created by hand earlier.
ALTER ROLE altrix_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- ---------------------------------------------------------------------------
-- 2. Schema access
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO altrix_app;

-- The login path reads and updates auth.users directly.
GRANT USAGE ON SCHEMA auth TO altrix_app;
GRANT SELECT, UPDATE ON auth.users TO altrix_app;

-- ---------------------------------------------------------------------------
-- 3. Data access on existing objects
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO altrix_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO altrix_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO altrix_app;

-- The RLS helper functions (has_role, is_school_member, ...) live in public and
-- are SECURITY DEFINER, so they keep working for this role.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO altrix_app;

-- ---------------------------------------------------------------------------
-- 4. Same access for objects created later, so a new table is not silently
--    unreadable after the next migration.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO altrix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO altrix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO altrix_app;

-- ---------------------------------------------------------------------------
-- 5. Report what was granted
-- ---------------------------------------------------------------------------
SELECT
    rolname,
    rolsuper     AS is_superuser,
    rolbypassrls AS bypasses_rls,
    rolcanlogin  AS can_login
FROM pg_roles
WHERE rolname = 'altrix_app';

-- Expected: is_superuser = f, bypasses_rls = f, can_login = t
-- If either of the first two is t, STOP: RLS will not be enforced.
