/**
 * Global type augmentation for Supabase client.
 * 
 * Many tables, RPCs, and views exist in the database but are not yet
 * reflected in the auto-generated types.ts file. This declaration
 * widens the client's `.from()` and `.rpc()` signatures so that
 * any table/rpc name compiles without error.
 */

declare module "@supabase/supabase-js" {
  interface SupabaseClient<
    Database = any,
    SchemaName extends string & keyof Database = "public" extends keyof Database
      ? "public" & keyof Database
      : string & keyof Database,
    Schema extends Record<string, unknown> = Database[SchemaName] extends Record<string, unknown>
      ? Database[SchemaName]
      : any
  > {
    /** Allow any table name without type errors */
    from(relation: string): any;
    /** Allow any RPC name without type errors */
    rpc(fn: string, args?: Record<string, any>, options?: any): any;
  }
}

export {};
