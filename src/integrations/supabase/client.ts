import { apiClient } from '@/lib/api-client';
import { addToOfflineQueue } from '@/lib/offline-db';
import { toast } from 'sonner';

export let USE_FASTAPI = true;

export function setUseFastAPI(val: boolean) {
  USE_FASTAPI = true;
  if (typeof window !== "undefined") {
    sessionStorage.setItem("eduverse:use_fastapi", "true");
    window.dispatchEvent(new CustomEvent("eduverse:use-fastapi-changed", { detail: true }));
  }
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

// ─── Query Builder Mock ──────────────────────────────────────────────────────

class MockQueryBuilder {
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
            filters: this.context.filters
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
        payload: this.context.payload
      });
      
      if (this.context.action !== 'select') {
        if (typeof window !== "undefined" && 
            (window.location.pathname.startsWith('/super_admin') || 
             window.location.pathname.startsWith('/platform'))) {
          showSuccessToast(this.table, this.context.action);
        }
      }
      
      const res = { data: response.data, error: response.error || null, count: response.data?.length || 0 };
      
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
          data: { table: this.table, action: this.context.action, payload: this.context.payload, filters: this.context.filters },
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

// ─── Storage Mock ────────────────────────────────────────────────────────────

class MockStorageBucket {
  bucket: string;
  constructor(bucket: string) { this.bucket = bucket; }
  
  async upload(path: string, file: any, options?: any) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      formData.append('bucket', this.bucket);
      const res = await fetch(`${apiClient.baseURL}/vps_storage/upload`, {
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
      const res = await fetch(`${apiClient.baseURL}/vps_storage/download?bucket=${this.bucket}&path=${encodeURIComponent(path)}`, {
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
    return { data: { publicUrl: `${apiClient.baseURL}/vps_storage/public?bucket=${this.bucket}&path=${encodeURIComponent(path)}` } };
  }
  
  async remove(paths: string[]) {
    try {
      await apiClient.post('/vps_storage/remove', { bucket: this.bucket, paths });
      return { data: true, error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  }
  
  async list(prefix?: string, options?: any) {
    try {
      const res = await apiClient.get(`/vps_storage/list?bucket=${this.bucket}&prefix=${prefix || ''}`);
      return { data: res, error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  }
}

// ─── Main Mock Client ────────────────────────────────────────────────────────

export const supabase = {
  from: (table: string) => new MockQueryBuilder(table),
  
  auth: {
    getUser: async () => {
      try {
        const user = await apiClient.get('/auth/me');
        return { data: { user }, error: null };
      } catch (e) {
        return { data: { user: null }, error: e };
      }
    },
    getSession: async () => {
      const token = localStorage.getItem('access_token');
      if (!token) return { data: { session: null }, error: null };
      return { data: { session: { access_token: token } }, error: null };
    },
    setSession: async (session: { access_token: string; refresh_token?: string }) => {
      localStorage.setItem('access_token', session.access_token);
      if (session.refresh_token) {
        localStorage.setItem('refresh_token', session.refresh_token);
      }
      try {
        const user = await apiClient.get('/auth/me');
        return { data: { user, session }, error: null };
      } catch (e) {
        return { data: { user: { id: 'dummy' }, session }, error: null };
      }
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
          return {
            data: {
              session: { access_token: resp.data.access_token, refresh_token: resp.data.refresh_token },
              user: resp.data.user || { id: resp.data.user_id, email: resp.data.email }
            },
            error: null
          };
        }
        throw new Error('Authentication failed');
      } catch (e: any) {
        return { data: null, error: e };
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
      // Mock success for password updates
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
    from: (bucket: string) => new MockStorageBucket(bucket)
  },
  
  channel: (name: string) => {
    return {
      on: () => supabase.channel(name),
      subscribe: (cb?: any) => { if (cb) cb('SUBSCRIBED'); return supabase.channel(name); }
    };
  },
  
  removeChannel: async (channel: any) => {
    return true;
  }
};

export const rawSupabase = supabase;