
CREATE POLICY "platform_admin_read_migration_backups" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'migration-backups' AND public.is_platform_admin(auth.uid()));
CREATE POLICY "platform_admin_write_migration_backups" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'migration-backups' AND public.is_platform_admin(auth.uid()));
CREATE POLICY "platform_admin_update_migration_backups" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'migration-backups' AND public.is_platform_admin(auth.uid()));
CREATE POLICY "platform_admin_delete_migration_backups" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'migration-backups' AND public.is_platform_admin(auth.uid()));
