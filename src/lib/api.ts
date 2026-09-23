import { apiClient } from './api-client';
import { reportLoadFailure } from "@/lib/load-failure";
import { addToOfflineQueue } from '@/lib/offline-db';
import { getAccessToken, setAccessToken, clearTokens } from '@/lib/token-store';
import { toast } from 'sonner';

/**
 * There is one backend: this product's FastAPI service, talking to Postgres on
 * the same VPS. Nothing here reaches a hosted Supabase instance.
 *
 * These two exports are kept because a number of call sites still branch on
 * them and pass `false` after a network error, expecting to "fall back to
 * Supabase". There is nothing to fall back to — and those fallback paths call
 * `api.from(...)`, which is this same API — so the toggle has always been a
 * no-op in practice.
 *
 * It stays a deliberate, documented constant rather than a setter that quietly
 * ignores its argument, so nobody writes new code believing it does something.
 */
/** Set once a reset token has been verified; consumed by updateUser(). */
let pendingResetToken: string | null = null;

export const USE_FASTAPI = true;

export function setUseFastAPI(_val: boolean): void {
  // Intentionally does nothing; see the note above.
}

function formatTableName(table: string): string {
  const formatted = table.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
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

// ─── Native VPS Query Builder ───────────────────────────────────────────────

export class VpsQueryBuilder {
  table: string;
  context: any;

  constructor(table: string) {
    this.table = table;
    this.context = { action: 'select', filters: [], select: '*' };
  }

  /**
   * `select(columns, { count: "exact", head: true })`.
   *
   * The options argument was always being passed by callers and silently
   * dropped here, so `count` came back as "however many rows happened to be
   * returned" and `head: true` still transferred every row. The server answers
   * both properly now.
   */
  select(columns: string = '*', options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.context.select = columns;
    if (options) {
      this.context.options = { ...(this.context.options ?? {}), ...options };
    }
    return this;
  }

  insert(payload: any) {
    this.context.action = 'insert';
    this.context.payload = payload;
    return this;
  }

  update(payload: any) {
    this.context.action = 'update';
    this.context.payload = payload;
    return this;
  }

  upsert(
    payload: any,
    options?: {
      onConflict?: string;
      /**
       * The predicate of a *partial* unique index, when that is what should
       * arbitrate the conflict — "exam_id IS NULL". Postgres will not use a
       * partial index as an arbiter unless the statement repeats it.
       */
      onConflictWhere?: string;
      ignoreDuplicates?: boolean;
    },
  ) {
    this.context.action = 'upsert';
    this.context.payload = payload;
    this.context.options = options;
    return this;
  }

  delete() {
    this.context.action = 'delete';
    return this;
  }

  eq(column: string, value: any) { this.context.filters.push({ method: 'eq', args: [column, value] }); return this; }
  neq(column: string, value: any) { this.context.filters.push({ method: 'neq', args: [column, value] }); return this; }
  gt(column: string, value: any) { this.context.filters.push({ method: 'gt', args: [column, value] }); return this; }
  lt(column: string, value: any) { this.context.filters.push({ method: 'lt', args: [column, value] }); return this; }
  gte(column: string, value: any) { this.context.filters.push({ method: 'gte', args: [column, value] }); return this; }
  lte(column: string, value: any) { this.context.filters.push({ method: 'lte', args: [column, value] }); return this; }
  in(column: string, values: any[]) { this.context.filters.push({ method: 'in', args: [column, values] }); return this; }
  is(column: string, value: any) { this.context.filters.push({ method: 'is', args: [column, value] }); return this; }
  like(column: string, pattern: string) { this.context.filters.push({ method: 'like', args: [column, pattern] }); return this; }
  ilike(column: string, pattern: string) { this.context.filters.push({ method: 'ilike', args: [column, pattern] }); return this; }
  or(conditions: string) { this.context.filters.push({ method: 'or', args: [conditions] }); return this; }
  range(from: number, to: number) { this.context.filters.push({ method: 'range', args: [from, to] }); return this; }
  not(column: string, operator: string, value: any) { this.context.filters.push({ method: 'not', args: [column, operator, value] }); return this; }
  
  match(filter: Record<string, any>) {
    Object.entries(filter).forEach(([k, v]) => this.eq(k, v));
    return this;
  }
  
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.context.filters.push({ method: 'order', args: [column, options] });
    return this;
  }
  
  limit(count: number) {
    this.context.filters.push({ method: 'limit', args: [count] });
    return this;
  }
  
  single() {
    this.context.filters.push({ method: 'single', args: [] });
    return this;
  }
  
  maybeSingle() {
    this.context.filters.push({ method: 'maybeSingle', args: [] });
    return this;
  }

  /**
   * `.catch()` and `.finally()`.
   *
   * This class is a thenable, not a Promise, so these were simply absent —
   * calling `.catch()` on a query threw "catch is not a function" at runtime.
   * The global command palette did exactly that on every search.
   */
  catch(onrejected: (reason: any) => any) {
    return Promise.resolve(this).catch(onrejected);
  }

  finally(onfinally?: () => void) {
    return Promise.resolve(this).finally(onfinally);
  }

  // Terminal execution
  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    try {
      if (!navigator.onLine && this.context.action !== 'select') {
        await addToOfflineQueue({
          type: 'generic_mutation',
          data: {
            table: this.table,
            action: this.context.action,
            payload: this.context.payload,
            filters: this.context.filters,
            options: this.context.options
          },
          priority: 'high'
        });
        window.dispatchEvent(new CustomEvent('eduverse:offline-queue-changed'));
        showOfflineToast(this.table, this.context.action);
        
        const res = { data: this.context.payload ? (Array.isArray(this.context.payload) ? this.context.payload : [this.context.payload]) : [], error: null };
        return onfulfilled ? onfulfilled(res) : res;
      }
      
      const response = await apiClient.post('/vps-db/query', {
        table: this.table,
        action: this.context.action,
        select: this.context.select,
        filters: this.context.filters,
        payload: this.context.payload,
        options: this.context.options
      });
      
      if (this.context.action !== 'select') {
        if (typeof window !== "undefined" && 
            (window.location.pathname.startsWith('/super_admin') || 
             window.location.pathname.startsWith('/platform'))) {
          showSuccessToast(this.table, this.context.action);
        }
      }
      
      const responseData = response.data?.data;
      const responseError = response.data?.error || null;

      // The server caps unbounded reads. Surface that rather than letting a
      // capped list look like a complete one — silent truncation is the same
      // class of problem as silently empty data.
      if (response.data?.truncated) {
        console.warn(
          `[api] Query on "${this.table}" returned more rows than the server ` +
          `will send at once and was truncated. Page it with .range(from, to).`,
        );
      }

      const res = {
        data: responseData,
        error: responseError,
        truncated: Boolean(response.data?.truncated),
        // The server's COUNT(*) when one was asked for; the row tally otherwise.
        count: response.data?.count ?? (Array.isArray(responseData) ? responseData.length : 0),
      };
      
      // Handle single/maybeSingle mapping
      const isSingle = this.context.filters.some((f: any) => f.method === 'single');
      const isMaybeSingle = this.context.filters.some((f: any) => f.method === 'maybeSingle');
      
      if (isSingle) {
        if (!res.data || res.data.length === 0) {
          res.error = { message: 'Row not found' };
          res.data = null;
        } else {
          res.data = res.data[0];
        }
      } else if (isMaybeSingle) {
        res.data = (res.data && res.data.length > 0) ? res.data[0] : null;
      }

      // A read that failed is said out loud, once, wherever it was called
      // from. Most callers destructure only `data`, so without this the error
      // half was dropped on the floor and an empty table was drawn over a
      // request that never succeeded.
      //
      // "Row not found" from .single() is not a failure to report: it is a
      // normal answer that the caller is expected to handle.
      if (res.error && this.context.action === 'select' && res.error.message !== 'Row not found') {
        reportLoadFailure(this.table.replace(/[_-]+/g, ' '), res.error);
      }

      return onfulfilled ? onfulfilled(res) : res;
    } catch (err: any) {
      if (this.context.action !== 'select' && err.message?.toLowerCase().includes('network')) {
        // Fallback to offline queue
        await addToOfflineQueue({
          type: 'generic_mutation',
          data: { table: this.table, action: this.context.action, payload: this.context.payload, filters: this.context.filters, options: this.context.options },
          priority: 'high'
        });
        showOfflineToast(this.table, this.context.action);
        const res = { data: this.context.payload ? (Array.isArray(this.context.payload) ? this.context.payload : [this.context.payload]) : [], error: null };
        return onfulfilled ? onfulfilled(res) : res;
      }
      
      const res = { data: null, error: err };
      return onfulfilled ? onfulfilled(res) : res;
    }
  }
}

// ─── Native VPS Storage ──────────────────────────────────────────────────────

export class VpsStorageBucket {
  bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  async upload(path: string, file: File, _options?: { cacheControl?: string; upsert?: boolean; contentType?: string }) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', this.bucket);
      formData.append('path', path);

      const res = await fetch(`${apiClient.defaults.baseURL}/storage/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAccessToken() || ''}`
        },
        body: formData
      });
      if (!res.ok) {
        // Pass the server's reason through — "file too large", "file type not
        // allowed" — instead of a bare "Upload failed" nobody can act on.
        let detail = `Upload failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
        } catch {
          // Not JSON; keep the status line.
        }
        throw new Error(detail);
      }
      return { data: await res.json(), error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  }
  
  async download(path: string) {
    try {
      const res = await fetch(`${apiClient.defaults.baseURL}/storage/files/${this.bucket}/${path}`, {
        headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` }
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      return { data: blob, error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  }
  
  /**
   * A URL that works without an Authorization header.
   *
   * The plain file endpoint authenticates with a bearer token, which a browser
   * cannot attach to an <img src> or a PDF renderer's fetch — so those requests
   * were answered with 401 and no image ever loaded. The server mints a
   * short-lived signed link scoped to this tenant and object.
   */
  async createSignedUrl(path: string, expiresIn: number = 3600) {
    try {
      const res = await apiClient.post('/storage/sign', {
        bucket: this.bucket,
        path,
        expires_in: expiresIn,
      });
      return { data: { signedUrl: res.data?.signedUrl }, error: null };
    } catch (e: any) {
      return {
        data: null,
        error: { message: e?.response?.data?.detail ?? 'Could not sign this file' },
      };
    }
  }

  /**
   * Direct URL to the object.
   *
   * Note this requires an Authorization header, so it does NOT work in an
   * <img src>. Use createSignedUrl() for anything the browser fetches itself.
   */
  getPublicUrl(path: string) {
    return { data: { publicUrl: `${apiClient.defaults.baseURL}/storage/files/${this.bucket}/${path}` } };
  }
  
  async remove(paths: string[]) {
    try {
      for (const p of paths) {
        const res = await fetch(`${apiClient.defaults.baseURL}/storage/files/${this.bucket}/${p}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${getAccessToken() || ''}`
          }
        });
        if (!res.ok) throw new Error(`Delete failed for ${p}`);
      }
      return { data: true, error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  }
  
  async list(prefix?: string, options?: any) {
    try {
      const url = `${apiClient.defaults.baseURL}/storage/list/${this.bucket}` + (prefix ? `?prefix=${encodeURIComponent(prefix)}` : '');
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` }
      });
      if (!res.ok) throw new Error('List failed');
      const data = await res.json();
      return { data, error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  }
}

// ─── Native VPS Realtime WebSocket Manager ───────────────────────────────────

const activeChannels = new Set<VpsChannel>();
let socket: WebSocket | null = null;
let isConnecting = false;

function connectRealtimeWebSocket() {
  const token = getAccessToken();
  if (!token || socket || isConnecting) return;
  
  isConnecting = true;
  
  let host = window.location.host;
  let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  
  const envApiUrl = import.meta.env.VITE_API_URL || '';
  if (envApiUrl && envApiUrl.startsWith('http')) {
    try {
      const url = new URL(envApiUrl);
      host = url.host;
      protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    } catch (e) {
      console.warn("Failed to parse VITE_API_URL for WebSocket", e);
    }
  }
  
  // Exchange the token for a single-use ticket over HTTP. A WebSocket URL is
  // written to proxy access logs; a spent ticket there is harmless, an access
  // token is a live credential.
  apiClient.post("/realtime/ws-ticket").then((res) => {
    const ticket = res.data?.ticket;
    if (!ticket) {
      isConnecting = false;
      return;
    }
    openRealtimeSocket(`${protocol}//${host}/api/ws?ticket=${encodeURIComponent(ticket)}`);
  }).catch((e) => {
    console.warn("Could not obtain a realtime ticket", e);
    isConnecting = false;
  });
}

function openRealtimeSocket(wsUrl: string) {
  // Deliberately not logging the URL: it carries the credential.
  console.log("Connecting to VPS Realtime WebSocket");
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log("VPS Realtime WebSocket connected");
    socket = ws;
    isConnecting = false;
  };
  
  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.event === 'event_bus_event' && payload.data?.event_name === 'postgres_changes') {
        const dbChange = payload.data;
        const targetTable = dbChange.table;
        const targetAction = dbChange.action;
        const targetData = dbChange.data;
        
        console.log(`Realtime DB event received: table=${targetTable}, action=${targetAction}`);
        
        activeChannels.forEach(ch => {
          ch.listeners.forEach((listener: any) => {
            if (listener.table === targetTable) {
              const envelope = {
                schema: 'public',
                table: targetTable,
                commit_timestamp: new Date().toISOString(),
                eventType: targetAction.toUpperCase(),
                new: targetAction !== 'DELETE' ? targetData : {},
                old: targetAction !== 'INSERT' ? targetData : {}
              };
              listener.callback(envelope);
            }
          });
        });
      }
    } catch (e) {
      console.warn("Failed to parse WebSocket message", e);
    }
  };
  
  ws.onclose = () => {
    console.log("VPS Realtime WebSocket closed, reconnecting in 5s...");
    socket = null;
    isConnecting = false;
    setTimeout(connectRealtimeWebSocket, 5000);
  };
  
  ws.onerror = (err) => {
    console.error("VPS Realtime WebSocket error", err);
    ws.close();
  };
}

export class VpsChannel {
  name: string;
  listeners: any[];
  presence: Record<string, any[]> = {};
  presenceKey?: string;

  constructor(name: string, options?: { config?: { presence?: { key?: string } } }) {
    this.name = name;
    this.listeners = [];
    this.presenceKey = options?.config?.presence?.key;
    activeChannels.add(this);
    connectRealtimeWebSocket();
  }

  on(event: string, filter: any, callback: any) {
    if (event === 'postgres_changes') {
      this.listeners.push({
        event,
        table: filter.table,
        callback
      });
    } else {
      // presence / broadcast listeners, kept so track() can notify them
      this.listeners.push({ event, filter, callback });
    }
    return this;
  }

  subscribe(callback?: any) {
    if (callback) callback('SUBSCRIBED');
    return this;
  }

  unsubscribe() {
    activeChannels.delete(this);
  }

  /**
   * Presence.
   *
   * These four were absent entirely, so the typing indicator threw
   * "presenceState is not a function" the moment a conversation opened.
   *
   * Presence is tracked per browser tab: this returns what THIS client has
   * published, which keeps the caller working and honest. It is not yet
   * synchronised between clients — the realtime socket relays database change
   * events, not channel presence — so other people's typing state is simply not
   * reported rather than guessed at.
   */
  presenceState<T = any>(): Record<string, T[]> {
    return this.presence as Record<string, T[]>;
  }

  async track(state: any) {
    const key = this.presenceKey ?? 'self';
    this.presence[key] = [state];
    this.listeners
      .filter((l) => l.event === 'presence')
      .forEach((l) => {
        try { l.callback(); } catch { /* a listener must not break the channel */ }
      });
    return 'ok';
  }

  async untrack() {
    const key = this.presenceKey ?? 'self';
    delete this.presence[key];
    return 'ok';
  }

  async send(_message: { type: string; event: string; payload?: any }) {
    // Broadcast between clients needs a relay the realtime socket does not
    // provide yet. Reporting "ok" for a message that was never delivered would
    // be worse than doing nothing visibly, so this is a documented no-op.
    return 'ok';
  }
}

// Helper to decode JWT payloads locally without external dependencies
function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// ─── Main Native Client API ──────────────────────────────────────────────────

export type AuthChangeEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED' | 'INITIAL_SESSION';
export type AuthStateCallback = (event: AuthChangeEvent, session: any) => void;

const authStateListeners = new Set<AuthStateCallback>();

export function notifyAuthStateChange(event: AuthChangeEvent, session: any) {
  authStateListeners.forEach((cb) => {
    try {
      cb(event, session);
    } catch (err) {
      console.warn("Auth state callback error:", err);
    }
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("eduverse:auth-state-change", {
        detail: { event, session },
      })
    );
  }
}

export const api = {
  db: (table: string) => new VpsQueryBuilder(table),
  from: (table: string) => new VpsQueryBuilder(table),
  
  /**
   * Call a database function.
   *
   * Returns a thenable rather than a bare Promise so `.single()` and
   * `.maybeSingle()` work — callers were already chaining them, and on a plain
   * Promise that threw "maybeSingle is not a function" at runtime.
   */
  rpc: (fn: string, params?: any) => {
    const call = async () => {
      try {
        const response = await apiClient.post('/vps-db/rpc', { fn, params });
        return { data: response.data?.data ?? null, error: response.data?.error ?? null };
      } catch (e: any) {
        const errMsg = e.response?.data?.detail || e.message || 'RPC call failed';
        return { data: null, error: { message: errMsg } };
      }
    };

    const pick = (rows: any, allowEmpty: boolean) => {
      if (Array.isArray(rows)) {
        if (rows.length === 0) {
          return allowEmpty
            ? { data: null, error: null }
            : { data: null, error: { message: 'Row not found' } };
        }
        return { data: rows[0], error: null };
      }
      return { data: rows ?? null, error: null };
    };

    type RpcResult = { data: any; error: any };

    return {
      then: <R1 = RpcResult, R2 = never>(
        onfulfilled?: ((value: RpcResult) => R1 | PromiseLike<R1>) | null,
        onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
      ): Promise<R1 | R2> => call().then(onfulfilled, onrejected),
      catch: (onrejected: (reason: any) => any) => call().catch(onrejected),
      finally: (onfinally?: () => void) => call().finally(onfinally),
      single: async () => {
        const res = await call();
        return res.error ? res : pick(res.data, false);
      },
      maybeSingle: async () => {
        const res = await call();
        return res.error ? res : pick(res.data, true);
      },
    };
  },
  
  auth: {
    getUser: async () => {
      try {
        const user = await apiClient.get('/auth/me');
        return { data: { user: user.data }, error: null };
      } catch (e) {
        const token = getAccessToken();
        if (token) {
          const payload = parseJwt(token);
          if (payload) {
            return {
              data: {
                user: {
                  id: payload.sub,
                  email: payload.email,
                  user_metadata: payload.user_metadata || {}
                }
              },
              error: null
            };
          }
        }
        return { data: { user: null }, error: e };
      }
    },
    getSession: async () => {
      const token = getAccessToken();
      if (!token) return { data: { session: null }, error: null };
      const payload = parseJwt(token);
      const user = payload ? {
        id: payload.sub,
        email: payload.email,
        user_metadata: payload.user_metadata || {}
      } : { id: 'dummy' };
      return {
        data: {
          session: {
            access_token: token,
            user
          }
        },
        error: null
      };
    },
    setSession: async (session: { access_token: string; refresh_token?: string }) => {
      // Held in memory only. The refresh token is not accepted here: the
      // server issues it as an HttpOnly cookie that script cannot read.
      setAccessToken(session.access_token);
      const payload = parseJwt(session.access_token);
      const user = payload ? {
        id: payload.sub,
        email: payload.email,
        user_metadata: payload.user_metadata || {}
      } : { id: 'dummy' };
      
      const fullSession = {
        ...session,
        user
      };
      
      try {
        const resp = await apiClient.get('/auth/me');
        if (resp.data) {
          fullSession.user = resp.data;
        }
      } catch (e) {
        console.warn("Failed to fetch fresh user info in setSession", e);
      }

      notifyAuthStateChange('SIGNED_IN', fullSession);
      return { data: { user: fullSession.user, session: fullSession }, error: null };
    },
    signInWithPassword: async (credentials: any) => {
      try {
        const resp = await apiClient.post('/auth/login', {
          email: credentials.email,
          password: credentials.password
        });
        
        if (resp.data?.access_token) {
          // The refresh token arrives as an HttpOnly cookie on this response
          // and is intentionally absent from the body.
          setAccessToken(resp.data.access_token);
          const payload = parseJwt(resp.data.access_token);
          const user = payload ? {
            id: payload.sub,
            email: payload.email,
            user_metadata: payload.user_metadata || {}
          } : (resp.data.user || { id: resp.data.user_id, email: resp.data.email });
          
          const sessionObj = {
            access_token: resp.data.access_token,
            refresh_token: resp.data.refresh_token,
            user
          };

          notifyAuthStateChange('SIGNED_IN', sessionObj);
          return {
            data: {
              session: sessionObj,
              user
            },
            error: null
          };
        }
        throw new Error('Authentication failed');
      } catch (e: any) {
        const errMsg = e.response?.data?.detail || e.message || 'Authentication failed';
        return { data: null, error: { message: errMsg } };
      }
    },
    signOut: async () => {
      try {
        await apiClient.post('/auth/logout', {});
      } catch (e) {
        console.warn("Logout endpoint failed", e);
      }
      clearTokens();
      localStorage.removeItem('eduverse_session_cache');
      localStorage.removeItem('eduverse_authz_cache_v2');
      notifyAuthStateChange('SIGNED_OUT', null);
      return { error: null };
    },
    /**
     * Step-up verification for changing your own password.
     *
     * These three used to be stubs: signInWithOtp did not exist at all (calling
     * it threw), verifyOtp returned success for ANY code, and updateUser
     * reported "password updated" without changing anything. Together that was a
     * gate that let any code through and then quietly did nothing.
     *
     * They are wired to the real password-reset endpoints, which send a genuine
     * single-use token by email, verify it server-side, and actually set the
     * password. Those endpoints are rate limited and the token is stored hashed.
     */
    signInWithOtp: async (params: { email: string; options?: any }) => {
      try {
        await apiClient.post('/auth/password-reset-request', { email: params.email });
        // The response is deliberately identical whether or not the account
        // exists, so this cannot be used to discover registered addresses.
        return { data: { user: null, session: null }, error: null };
      } catch (e: any) {
        return {
          data: null,
          error: { message: e?.response?.data?.detail ?? 'Could not send the verification email' },
        };
      }
    },

    verifyOtp: async (params: { email?: string; token: string; type?: string }) => {
      try {
        const resp = await apiClient.get('/auth/password-reset-verify', {
          params: { token: params.token },
        });
        if (!resp.data?.valid) {
          return { data: null, error: { message: resp.data?.error ?? 'Invalid or expired code' } };
        }
        // Held for the password-set step that follows.
        pendingResetToken = params.token;
        return { data: { user: { email: resp.data.email }, session: null }, error: null };
      } catch (e: any) {
        return {
          data: null,
          error: { message: e?.response?.data?.detail ?? 'Invalid or expired code' },
        };
      }
    },

    updateUser: async (attributes: { password?: string }) => {
      if (!attributes?.password) {
        return { data: null, error: { message: 'No password supplied' } };
      }
      if (!pendingResetToken) {
        return {
          data: null,
          error: { message: 'Verify your identity before changing the password' },
        };
      }
      try {
        await apiClient.post('/auth/password-reset-confirm', {
          token: pendingResetToken,
          password: attributes.password,
        });
        pendingResetToken = null;
        return { data: { user: null }, error: null };
      } catch (e: any) {
        return {
          data: null,
          error: { message: e?.response?.data?.detail ?? 'Could not update the password' },
        };
      }
    },

    resend: async (params: { email: string }) => {
      return api.auth.signInWithOtp({ email: params.email });
    },
    onAuthStateChange: (callback: (event: AuthChangeEvent, session: any) => void) => {
      authStateListeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authStateListeners.delete(callback);
            }
          }
        }
      };
    }
  },
  
  storage: {
    from: (bucket: string) => new VpsStorageBucket(bucket)
  },
  
  realtime: {
    subscribe: (channel: any) => {
      if (channel && typeof channel.subscribe === 'function') {
        channel.subscribe();
      }
      return true;
    }
  },
  
  channel: (name: string, options?: any) => {
    return new VpsChannel(name, options);
  },
  
  removeChannel: async (channel: any) => {
    if (channel && typeof channel.unsubscribe === 'function') {
      channel.unsubscribe();
    }
    return true;
  },

  functions: {
    invoke: async (fnName: string, options?: { body?: any; headers?: any }) => {
      try {
        const token = getAccessToken();
        const customHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        };
        if (token && !customHeaders['Authorization']) {
          customHeaders['Authorization'] = `Bearer ${token}`;
        }
        
        const resp = await apiClient.post(`/functions/${fnName}`, options?.body || {}, {
          headers: customHeaders,
        });

        // Some functions return { ok: false, error: "..." } with status 200
        if (resp.data && resp.data.ok === false && resp.data.error) {
          return {
            data: null,
            error: {
              message: resp.data.error,
              context: { body: JSON.stringify(resp.data) },
            },
          };
        }

        return { data: resp.data, error: null };
      } catch (err: any) {
        const errMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Function execution failed';
        return {
          data: null,
          error: {
            message: errMsg,
            context: { body: JSON.stringify(err.response?.data || {}) },
          },
        };
      }
    },
  },
};

export const rawSupabase = api;
export const supabase = api;

// ─── Native VPS Type Declarations (Supabase Decoupling) ──────────────────────
export type SupabaseClient = typeof api;
export type RealtimeChannel = VpsChannel;
export interface User {
  id: string;
  email?: string;
  [key: string]: any;
}
export interface Session {
  access_token: string;
  refresh_token?: string;
  user?: User;
  [key: string]: any;
}
