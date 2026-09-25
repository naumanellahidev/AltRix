-- ============================================================================
-- Change notifications for one more table the Copilot answers from:
-- user_roles (who is staff, a teacher, a parent or a student).
-- Same trigger function as 20261029000000_copilot_change_notifications.sql.
--
-- Idempotent: safe to run more than once. Tables that do not exist are skipped.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['user_roles']
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns c
            JOIN information_schema.tables t
              ON t.table_schema = c.table_schema AND t.table_name = c.table_name
            WHERE c.table_schema = 'public' AND c.table_name = tbl
              AND c.column_name = 'school_id' AND t.table_type = 'BASE TABLE'
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_altrix_notify_change ON public.%I', tbl);
            EXECUTE format(
                'CREATE TRIGGER trg_altrix_notify_change AFTER INSERT OR UPDATE OR DELETE '
                'ON public.%I FOR EACH ROW EXECUTE FUNCTION public.altrix_notify_change()', tbl);
        END IF;
    END LOOP;
END
$$;

COMMIT;
