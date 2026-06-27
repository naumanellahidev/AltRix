import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { addToOfflineQueue } from '@/lib/offline-db';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const getInitialUseFastAPI = (): boolean => {
  if (typeof window === "undefined") return import.meta.env.VITE_USE_FASTAPI === 'true';
  const cached = sessionStorage.getItem("eduverse:use_fastapi");
  if (cached !== null) {
    return cached === "true";
  }
  return import.meta.env.VITE_USE_FASTAPI === 'true';
};

export let USE_FASTAPI = getInitialUseFastAPI();

export function setUseFastAPI(val: boolean) {
  USE_FASTAPI = val;
  if (typeof window !== "undefined") {
    sessionStorage.setItem("eduverse:use_fastapi", String(val));
    window.dispatchEvent(new CustomEvent("eduverse:use-fastapi-changed", { detail: val }));
  }
}

// Create the raw, unproxied client for internal/sync engine operations
export const rawSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Helper to determine network connectivity errors
function isNetworkError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return (
    error instanceof TypeError ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("aborted") ||
    msg.includes("network")
  );
}

// Convert table name to a user-friendly singular label
function formatTableName(table: string): string {
  // e.g. "hr_leave_requests" -> "Hr Leave Request"
  const formatted = table
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  if (formatted.endsWith('s') && !formatted.endsWith('ss')) {
    return formatted.slice(0, -1);
  }
  return formatted;
}

function showSuccessToast(table: string, action: string) {
  const entity = formatTableName(table);
  let actionWord = "updated";
  if (action === "insert") actionWord = "created";
  if (action === "delete") actionWord = "deleted";
  toast.success(`${entity} ${actionWord} successfully!`);
}

function showOfflineToast(table: string, action: string) {
  const entity = formatTableName(table);
  toast.info(`${entity} saved locally (Offline). Will sync automatically when internet is back!`, {
    duration: 5000,
  });
}

// Handle local offline queue writes
async function handleOfflineWrite(table: string, context: any) {
  try {
    await addToOfflineQueue({
      type: 'generic_mutation',
      data: {
        table,
        action: context.action,
        payload: context.data,
        filters: context.filters
      },
      priority: 'high'
    });
    
    // Notify general listeners that offline queue has new items
    window.dispatchEvent(new CustomEvent('eduverse:offline-queue-changed'));
  } catch (err) {
    console.error("Failed to add to offline queue:", err);
  }
  
  showOfflineToast(table, context.action);
  
  // Return a mock successful result structure to prevent downstream application crashes
  return {
    data: context.data ? (Array.isArray(context.data) ? context.data : [context.data]) : [],
    error: null,
    status: 200,
    statusText: 'OK'
  };
}

// Proxies terminal Postgrest builders to intercept promise/await resolution
function createBuilderProxy(builder: any, table: string, context: any = {}) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === '__isProxied') return true;
      
      const val = Reflect.get(target, prop, receiver);
      
      if (typeof val === 'function') {
        return (...args: any[]) => {
          const propStr = prop as string;
          
          if (propStr === 'then') {
            const onfulfilled = args[0];
            const onrejected = args[1];
            
            // If it's a read query, execute normally without interception
            if (!context.action) {
              return target.then(onfulfilled, onrejected);
            }
            
            // If we are offline, save write locally
            if (!navigator.onLine) {
              return handleOfflineWrite(table, context).then(onfulfilled, onrejected);
            }
            
            // If online, execute and handle potential network dropout fallbacks
            return target.then(
              (result: any) => {
                if (result && result.error) {
                  if (isNetworkError(result.error)) {
                    return handleOfflineWrite(table, context).then(onfulfilled, onrejected);
                  }
                  return onfulfilled(result);
                }
                
                if (typeof window !== "undefined" && 
                    (window.location.pathname.startsWith('/super_admin') || 
                     window.location.pathname.startsWith('/platform'))) {
                  showSuccessToast(table, context.action);
                }
                return onfulfilled(result);
              },
              (err: any) => {
                if (isNetworkError(err)) {
                  return handleOfflineWrite(table, context).then(onfulfilled, onrejected);
                }
                if (onrejected) {
                  return onrejected(err);
                }
                throw err;
              }
            );
          }
          
          // Capture mutating actions
          if (['insert', 'update', 'upsert', 'delete'].includes(propStr)) {
            const nextContext = {
              ...context,
              action: propStr,
              data: args[0],
              filters: []
            };
            const nextBuilder = val.apply(target, args);
            return createBuilderProxy(nextBuilder, table, nextContext);
          }
          
          // Capture filters applied on the mutating action
          if (context.action && ['eq', 'neq', 'gt', 'lt', 'in', 'is', 'like', 'ilike', 'match'].includes(propStr)) {
            const nextContext = {
              ...context,
              filters: [...(context.filters || []), { method: propStr, args }]
            };
            const nextBuilder = val.apply(target, args);
            return createBuilderProxy(nextBuilder, table, nextContext);
          }
          
          const nextBuilder = val.apply(target, args);
          if (nextBuilder && typeof nextBuilder === 'object' && typeof nextBuilder.then === 'function') {
            return createBuilderProxy(nextBuilder, table, context);
          }
          return nextBuilder;
        };
      }
      
      return val;
    }
  });
}

// Proxies the core client to intercept `supabase.from()` calls
function createOfflineProxy(supabaseClient: any) {
  return new Proxy(supabaseClient, {
    get(target, prop, receiver) {
      if (prop === 'raw') {
        return rawSupabase;
      }
      if (prop === 'from') {
        return (table: string) => {
          const originalBuilder = target.from(table);
          return createBuilderProxy(originalBuilder, table);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

export const supabase = createOfflineProxy(rawSupabase) as unknown as typeof rawSupabase;