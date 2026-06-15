import axios from "axios";
import { rawSupabase, setUseFastAPI, USE_FASTAPI } from "@/integrations/supabase/client";

export const apiClient = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

let reachabilityPromise: Promise<boolean> | null = null;

export function checkBackendReachability(): Promise<boolean> {
  if (reachabilityPromise) return reachabilityPromise;

  reachabilityPromise = fetch("/api/health")
    .then((res) => {
      // 502, 503, 504 are proxy errors indicating backend is offline
      if (!res.ok && [502, 503, 504].includes(res.status)) {
        return false;
      }
      return true;
    })
    .catch(() => {
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
        return Promise.reject({
          code: "ERR_NETWORK",
          message: "FastAPI Backend is not reachable (cancelled on startup check)",
          config,
          response: undefined,
        });
      }
    }

    // 1. Inject Supabase JWT access token
    try {
      const {
        data: { session },
      } = await rawSupabase.auth.getSession();
      
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch (e) {
      console.warn("Failed to retrieve Supabase session:", e);
    }

    // 2. Resolve and inject the X-School-Id header dynamically
    if (!config.headers["X-School-Id"]) {
      let schoolId: string | null = null;
      try {
        // First check current URL pathname for slug
        const pathParts = window.location.pathname.split("/").filter(Boolean);
        const possibleSlug = pathParts[0];
        if (possibleSlug && possibleSlug !== "platform" && possibleSlug !== "auth") {
          const item = localStorage.getItem(`eduverse_tenant_${possibleSlug}`);
          if (item) {
            const parsed = JSON.parse(item);
            if (parsed?.data?.id) {
              schoolId = parsed.data.id;
            }
          }
        }

        // Fallback: scan localStorage
        if (!schoolId) {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith("eduverse_tenant_basic_") || key.startsWith("eduverse_tenant_"))) {
              const item = localStorage.getItem(key);
              if (item) {
                const parsed = JSON.parse(item);
                if (parsed?.data?.id) {
                  schoolId = parsed.data.id;
                  break;
                }
              }
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

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export function isNetworkOrProxyError(error: any): boolean {
  if (!error) return false;
  return (
    !error.response ||
    error.code === "ERR_NETWORK" ||
    error.message === "Network Error" ||
    ([502, 503, 504].includes(error.response?.status) &&
     (!error.response.data || typeof error.response.data !== "object" || !("detail" in error.response.data)))
  );
}

// Response interceptor to handle authorization expiration (401)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (isNetworkOrProxyError(error)) {
      console.warn("FastAPI backend is unreachable, disabling USE_FASTAPI dynamically for fallback:", error);
      setUseFastAPI(false);
    }

    if (error.response?.status === 401) {
      console.warn("Unauthorized API call. Attempting token refresh...");
      try {
        // Triggering any auth operation on rawSupabase will auto-refresh if possible
        const { data } = await rawSupabase.auth.getSession();
        if (data.session?.access_token) {
          // Retry the failed request with the new token
          error.config.headers.Authorization = `Bearer ${data.session.access_token}`;
          return apiClient.request(error.config);
        }
      } catch (refreshError) {
        console.error("Token refresh failed, logging out:", refreshError);
        await rawSupabase.auth.signOut();
        window.location.href = "/auth";
      }
    }
    return Promise.reject(error);
  }
);
