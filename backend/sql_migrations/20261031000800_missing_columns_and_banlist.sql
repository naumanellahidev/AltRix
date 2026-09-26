-- ============================================================================
-- Columns and a table the code writes to that the database never had.
--
-- Found by EXPLAINing every SQL statement in the backend against the schema:
--
-- * user_roles.created_by: setting a user's roles, inviting a user and the
--   bulk staff import all wrote who granted the role, and every one of those
--   inserts failed.
-- * ip_banlist: the security-threats page created it at run time, which the
--   app's database role is not allowed to do, so the page never worked.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_by uuid;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_created_by_fkey') THEN
        ALTER TABLE public.user_roles
            ADD CONSTRAINT user_roles_created_by_fkey
            FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ip_banlist (
    ip_address varchar(100) PRIMARY KEY,
    reason     text,
    banned_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'altrix_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_banlist TO altrix_app;
    END IF;
END $$;

COMMIT;
