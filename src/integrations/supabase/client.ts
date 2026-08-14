// Historical Migration Note:
// The mock Supabase client has been retired. All database queries, auth,
// storage, and websocket subscriptions are now routed through the native
// VPS API client library inside src/lib/api.ts.