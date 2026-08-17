import { apiClient } from './api-client';
import { addToOfflineQueue } from '@/lib/offline-db';
import { toast } from 'sonner';

export let USE_FASTAPI = true;

export function setUseFastAPI(val: boolean) {
  USE_FASTAPI = true;
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

  select(columns: string = '*') {
    this.context.select = columns;
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

  upsert(payload: any, options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
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
      
      const res = {
        data: responseData,
        error: responseError,
        count: Array.isArray(responseData) ? responseData.length : 0
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

  async upload(path: string, file: File) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', this.bucket);
      formData.append('path', path);

      const res = await fetch(`${apiClient.defaults.baseURL}/storage/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
        },
        body: formData
      });
      if (!res.ok) throw new Error('Upload failed');
      return { data: await res.json(), error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  }
  
  async download(path: string) {
    try {
      const res = await fetch(`${apiClient.defaults.baseURL}/storage/files/${this.bucket}/${path}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` }
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      return { data: blob, error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  }
  
  getPublicUrl(path: string) {
    return { data: { publicUrl: `${apiClient.defaults.baseURL}/storage/files/${this.bucket}/${path}` } };
  }
  
  async remove(paths: string[]) {
    try {
      for (const p of paths) {
        const res = await fetch(`${apiClient.defaults.baseURL}/storage/files/${this.bucket}/${p}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
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
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` }
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
  const token = localStorage.getItem('access_token');
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
  } else if (host.includes('vercel.app')) {
    host = 'altrixcore.com';
    protocol = 'wss:';
  }
  
  const wsUrl = `${protocol}//${host}/api/ws?token=${token}`;
  
  console.log("Connecting to VPS Realtime WebSocket:", wsUrl);
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

  constructor(name: string) {
    this.name = name;
    this.listeners = [];
    activeChannels.add(this);
    connectRealtimeWebSocket();
  }

  on(event: string, filter: any, callback: any) {
    if (event === 'postgres_changes') {
      this.listeners.push({
        table: filter.table,
        callback
      });
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

export const api = {
  db: (table: string) => new VpsQueryBuilder(table),
  from: (table: string) => new VpsQueryBuilder(table),
  
  rpc: async (fn: string, params?: any) => {
    try {
      const response = await apiClient.post('/vps-db/rpc', { fn, params });
      return { data: response.data?.data ?? null, error: response.data?.error ?? null };
    } catch (e: any) {
      const errMsg = e.response?.data?.detail || e.message || 'RPC call failed';
      return { data: null, error: { message: errMsg } };
    }
  },
  
  auth: {
    getUser: async () => {
      try {
        const user = await apiClient.get('/auth/me');
        return { data: { user: user.data }, error: null };
      } catch (e) {
        const token = localStorage.getItem('access_token');
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
      const token = localStorage.getItem('access_token');
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
            refresh_token: localStorage.getItem('refresh_token') || undefined,
            user
          }
        },
        error: null
      };
    },
    setSession: async (session: { access_token: string; refresh_token?: string }) => {
      localStorage.setItem('access_token', session.access_token);
      if (session.refresh_token) {
        localStorage.setItem('refresh_token', session.refresh_token);
      }
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
      
      return { data: { user: fullSession.user, session: fullSession }, error: null };
    },
    signInWithPassword: async (credentials: any) => {
      try {
        const resp = await apiClient.post('/auth/login', {
          email: credentials.email,
          password: credentials.password
        });
        
        if (resp.data?.access_token) {
          localStorage.setItem('access_token', resp.data.access_token);
          if (resp.data.refresh_token) {
            localStorage.setItem('refresh_token', resp.data.refresh_token);
          }
          const payload = parseJwt(resp.data.access_token);
          const user = payload ? {
            id: payload.sub,
            email: payload.email,
            user_metadata: payload.user_metadata || {}
          } : (resp.data.user || { id: resp.data.user_id, email: resp.data.email });
          
          return {
            data: {
              session: {
                access_token: resp.data.access_token,
                refresh_token: resp.data.refresh_token,
                user
              },
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
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      return { error: null };
    },
    updateUser: async (attributes: any) => {
      return { data: { user: { id: 'dummy' } }, error: null };
    },
    resend: async (params: any) => {
      return { data: { ok: true }, error: null };
    },
    verifyOtp: async (params: any) => {
      return { data: { session: { access_token: 'dummy-otp-token' } }, error: null };
    },
    onAuthStateChange: (callback: any) => {
      return { data: { subscription: { unsubscribe: () => {} } } };
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
  
  channel: (name: string) => {
    return new VpsChannel(name);
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
        const token = localStorage.getItem('access_token');
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
