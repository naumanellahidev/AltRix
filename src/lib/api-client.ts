import axios from "axios";
import { api, setUseFastAPI, USE_FASTAPI } from "@/lib/api";

const getApiBaseUrl = (): string => {
  let raw = (import.meta.env.VITE_API_URL || "/api").trim().replace(/\/+$/, "");
  if (!raw) return "/api";

  // Block any stale Render backend URLs — backend is now on Railway only
  if (raw.includes("onrender.com")) {
    console.warn("[api-client] Detected stale Render URL in VITE_API_URL, overriding to /api (Railway proxy)");
    return "/api";
  }

  // Ensure the URL always ends with /api
  if (raw !== "/api" && !raw.endsWith("/api")) {
    return `${raw}/api`;
  }
  return raw;
};

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    "Content-Type": "application/json",
  },
});

let reachabilityPromise: Promise<boolean> | null = null;

export function checkBackendReachability(): Promise<boolean> {
  if (reachabilityPromise) return reachabilityPromise;

  const baseUrl = apiClient.defaults.baseURL || "/api";
  const url = `${baseUrl}/health`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);

  reachabilityPromise = fetch(url, { signal: controller.signal })
    .then((res) => {
      clearTimeout(timeoutId);
      if (!res.ok) return false;
      
      // If we got HTML (e.g. Vercel fallback serving index.html), the backend is NOT reachable at this URL
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        console.warn("Backend health check returned HTML, indicating an SPA fallback/redirect. Disabling FastAPI.");
        return false;
      }
      
      return true;
    })
    .catch(() => {
      clearTimeout(timeoutId);
      return false;
    });

  return reachabilityPromise;
}

apiClient.interceptors.request.use(
  async (config) => {
    // If USE_FASTAPI is enabled, verify reachability first (only once per app load)
    if (USE_FASTAPI && !config.url?.includes("/health")) {
      const isReachable = await checkBackendReachability();
      if (!isReachable) {
        setUseFastAPI(false);
      }
    }

    // 1. Inject Supabase JWT access token
    try {
      const {
        data: { session },
      } = await api.auth.getSession();
      
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch (e) {
      console.warn("Failed to retrieve Supabase session:", e);
    }

    // 2. Resolve and inject the X-School-Id header dynamically for tenant routes only
    const pathSegments = window.location.pathname.split("/").filter(Boolean);
    const firstSegment = pathSegments[0] || "";
    const isSystemRoute = ["super_admin", "platform", "auth", "reset-password"].includes(firstSegment);

    if (!isSystemRoute && !config.headers["X-School-Id"]) {
      let schoolId: string | null = null;
      try {
        schoolId = localStorage.getItem("eduverse_active_school_id");
        
        // Check current URL pathname for slug-specific cached tenant
        if (!schoolId && firstSegment) {
          const item = localStorage.getItem(`eduverse_tenant_${firstSegment}`);
          if (item) {
            const parsed = JSON.parse(item);
            if (parsed?.data?.id) {
              schoolId = parsed.data.id;
            }
          }
        }
      } catch (e) {
        console.error("Error scanning localStorage for school context:", e);
      }

      if (schoolId) {
        config.headers["X-School-Id"] = schoolId;
      }
    }

    // 3. Resolve and inject the X-Campus-Id header if present in the owner context
    if (!isSystemRoute && !config.headers["X-Campus-Id"]) {
      try {
        const rawCtx = localStorage.getItem("eduverse_owner_active_context");
        if (rawCtx) {
          const parsed = JSON.parse(rawCtx);
          // Only send the campus ID if it belongs to the current active school
          if (parsed?.campusId && parsed?.schoolId === config.headers["X-School-Id"]) {
            config.headers["X-Campus-Id"] = parsed.campusId;
          }
        }
      } catch (e) {
        console.error("Error scanning localStorage for campus context:", e);
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export function isNetworkOrProxyError(error: any): boolean {
  if (!error) return false;
  const data = error.response?.data;
  const hasDetail = data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "detail");
  return (
    !error.response ||
    error.code === "ERR_NETWORK" ||
    error.message === "Network Error" ||
    ([502, 503, 504].includes(error.response?.status) && !hasDetail)
  );
}

let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null, error?: any) => void> = [];

function subscribeTokenRefresh(cb: (token: string | null, error?: any) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string | null, error?: any) {
  refreshSubscribers.forEach((cb) => cb(token, error));
  refreshSubscribers = [];
}

// Response interceptor to handle authorization expiration (401)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (isNetworkOrProxyError(error)) {
      console.warn("VPS API Proxy Warning:", error);
    }

    const originalRequest = error.config;
    const isAuthEndpoint = originalRequest?.url?.includes("/auth/login") ||
                           originalRequest?.url?.includes("/auth/refresh") ||
                           originalRequest?.url?.includes("/auth/logout");

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem("refresh_token");

      if (!refreshToken) {
        // No refresh token available, purge invalid session
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("eduverse_session_cache");
        localStorage.removeItem("eduverse_authz_cache_v2");
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("eduverse:auth-state-change", {
              detail: { event: "SIGNED_OUT", session: null },
            })
          );
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken: string | null, refreshErr?: any) => {
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(apiClient.request(originalRequest));
            } else {
              reject(refreshErr || error);
            }
          });
        });
      }

      isRefreshing = true;

      try {
        const baseUrl = apiClient.defaults.baseURL || "/api";
        const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!refreshRes.ok) {
          throw new Error(`Refresh failed with status ${refreshRes.status}`);
        }

        const data = await refreshRes.json();
        if (data?.access_token) {
          localStorage.setItem("access_token", data.access_token);
          if (data.refresh_token) {
            localStorage.setItem("refresh_token", data.refresh_token);
          }
          isRefreshing = false;
          onTokenRefreshed(data.access_token);
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          return apiClient.request(originalRequest);
        } else {
          throw new Error("Invalid refresh response");
        }
      } catch (refreshErr) {
        isRefreshing = false;
        onTokenRefreshed(null, refreshErr);
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("eduverse_session_cache");
        localStorage.removeItem("eduverse_authz_cache_v2");
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("eduverse:auth-state-change", {
              detail: { event: "SIGNED_OUT", session: null },
            })
          );
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);
