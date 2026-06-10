import axios from "axios";
import { rawSupabase } from "@/integrations/supabase/client";

export const apiClient = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  async (config) => {
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
    let schoolId: string | null = null;
    try {
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
    } catch (e) {
      console.error("Error scanning localStorage for school context:", e);
    }

    if (schoolId) {
      config.headers["X-School-Id"] = schoolId;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle authorization expiration (401)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
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
