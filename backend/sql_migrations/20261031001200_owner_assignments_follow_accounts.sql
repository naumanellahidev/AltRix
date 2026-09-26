-- ============================================================================
-- An owner assignment belongs to an account that exists.
--
-- school_owner_assignments.owner_user_id had no foreign key, so deleting an
-- account left its assignment behind: the owner's security screen counted
-- "3 owner(s)" for a school with two, the third a deleted account.
--
-- Orphaned assignments are removed and the key added, so deleting an account
-- removes its assignments with it.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

DELETE FROM public.school_owner_assignments a
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.owner_user_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'school_owner_assignments_owner_user_id_fkey') THEN
        ALTER TABLE public.school_owner_assignments
            ADD CONSTRAINT school_owner_assignments_owner_user_id_fkey
            FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

COMMIT;
