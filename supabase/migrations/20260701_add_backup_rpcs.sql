-- Migration: 20260701_add_backup_rpcs.sql
-- This migration adds RPC functions for database backup and restore operations.

-- Function: export_table_schema
-- Exports a table's schema and rows for a given school_id as JSONB.
CREATE OR REPLACE FUNCTION public.export_table_schema(p_table_name text, p_school_id uuid)
RETURNS jsonb AS $$
DECLARE
  schema_json jsonb;
  rows_json jsonb;
BEGIN
  -- Get table schema definition (columns)
  SELECT jsonb_agg(jsonb_build_object(
    'column_name', column_name,
    'data_type', data_type,
    'is_nullable', is_nullable,
    'character_maximum_length', character_maximum_length
  ))
  INTO schema_json
  FROM information_schema.columns
  WHERE table_name = p_table_name;

  -- Get rows for the specific school_id (if column exists)
  EXECUTE format('SELECT jsonb_agg(t) FROM (SELECT * FROM %I WHERE school_id = $1) t', p_table_name)
  USING p_school_id
  INTO rows_json;

  RETURN jsonb_build_object(
    'table', p_table_name,
    'schema', schema_json,
    'rows', rows_json
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: send_email_notification
-- Sends an email using Supabase's HTTP request to an email provider (placeholder implementation).
CREATE OR REPLACE FUNCTION public.send_email_notification(to_email text, subject text, body text)
RETURNS void AS $$
BEGIN
  -- Placeholder: In production, integrate with an email provider via HTTP request.
  RAISE NOTICE 'Sending email to % with subject %', to_email, subject;
  -- Example using supabase.http function (if available):
  -- PERFORM http_post('https://api.emailservice.com/send', jsonb_build_object('to', to_email, 'subject', subject, 'body', body)::text, 'application/json');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: get_backup_key
-- Returns a symmetric encryption key for backups (placeholder, should be stored securely).
CREATE OR REPLACE FUNCTION public.get_backup_key()
RETURNS text AS $$
BEGIN
  -- In production, retrieve from secure vault or environment variable.
  RETURN 'my-super-secret-backup-key-32bytes!';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: log_audit
-- Stores audit log entries.
CREATE OR REPLACE FUNCTION public.log_audit(p_action text, p_details jsonb)
RETURNS void AS $$
BEGIN
  INSERT INTO public.audit_logs (action, details, created_at)
  VALUES (p_action, p_details, now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution rights to the auth role (or appropriate role)
GRANT EXECUTE ON FUNCTION public.export_table_schema(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_email_notification(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_backup_key() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, jsonb) TO anon, authenticated;

-- End of migration
