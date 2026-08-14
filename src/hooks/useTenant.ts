import { useEffect, useMemo, useState } from "react";
import { api, USE_FASTAPI, setUseFastAPI } from "@/lib/api";
import { apiClient, isNetworkOrProxyError } from "@/lib/api-client";

type TenantState =
  | { status: "idle" | "loading"; school: null; schoolId: null; error: null }
  | { status: "ready"; school: { id: string; slug: string; name: string }; schoolId: string; error: null }
  | { status: "error"; school: null; schoolId: null; error: string };

// LocalStorage cache key builder
const getTenantCacheKey = (slug: string) => `eduverse_tenant_basic_${slug}`;

function purgeTenantCache(slug: string) {
  try {
    localStorage.removeItem(getTenantCacheKey(slug));
    localStorage.removeItem(`eduverse_tenant_${slug}`);
    localStorage.removeItem(`eduverse_brand_color_${slug}`);
  } catch {
    // Ignore storage errors
  }
}

// Get cached tenant data from localStorage
function getCachedTenant(slug: string): { id: string; slug: string; name: string } | null {
  try {
    const cached = localStorage.getItem(getTenantCacheKey(slug));
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;
    
    // Cache valid for 24 hours
    if (age > 24 * 60 * 60 * 1000) {
      purgeTenantCache(slug);
      return null;
    }

    // Purge legacy hardcoded fallback entries where name was 'Beacon House' for non-beacon slugs
    if (parsed.data?.name === "Beacon House" && slug !== "beacon") {
      purgeTenantCache(slug);
      return null;
    }
    
    return parsed.data;
  } catch {
    return null;
  }
}

// Save tenant data to localStorage
function cacheTenant(slug: string, data: { id: string; slug: string; name: string }) {
  try {
    localStorage.setItem(
      getTenantCacheKey(slug),
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {
    // Ignore storage errors
  }
}

export function useTenant(schoolSlug: string | undefined) {
  const normalizedSlug = useMemo(
    () => (schoolSlug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, ""),
    [schoolSlug],
  );

  // Check for cached data for offline support only
  const cachedData = useMemo(() => {
    if (!normalizedSlug) return null;
    return getCachedTenant(normalizedSlug);
  }, [normalizedSlug]);

  const [state, setState] = useState<TenantState>(() => {
    // Only use cached data on initial render if OFFLINE
    if (!navigator.onLine && cachedData) {
      return {
        status: "ready",
        school: cachedData,
        schoolId: cachedData.id,
        error: null,
      };
    }
    return { status: "idle", school: null, schoolId: null, error: null };
  });

  useEffect(() => {
    if (!normalizedSlug) return;

    // If offline, use cached data immediately
    if (!navigator.onLine) {
      if (cachedData) {
        setState({
          status: "ready",
          school: cachedData,
          schoolId: cachedData.id,
          error: null,
        });
      } else {
        setState({ status: "error", school: null, schoolId: null, error: "Offline - no cached data" });
      }
      return;
    }

    let cancelled = false;
    setState({ status: "loading", school: null, schoolId: null, error: null });

    const runSupabaseTenant = () => {
      api
        .rpc("get_school_public_by_slug", { _slug: normalizedSlug })
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error || !data) {
            purgeTenantCache(normalizedSlug);
            setState({ status: "error", school: null, schoolId: null, error: error?.message || "School not found." });
            return;
          }
          const tenantData = { id: data.id, slug: data.slug, name: data.name };
          cacheTenant(normalizedSlug, tenantData);
          setState({ status: "ready", school: tenantData, schoolId: data.id, error: null });
        });
    };

    if (USE_FASTAPI) {
      apiClient
        .get(`/schools/by-slug/${normalizedSlug}`)
        .then((resp) => {
          if (cancelled) return;
          const data = resp.data;
          if (!data) {
            purgeTenantCache(normalizedSlug);
            setState({ status: "error", school: null, schoolId: null, error: "School not found." });
            return;
          }
          const tenantData = { id: data.id, slug: data.slug, name: data.name };
          cacheTenant(normalizedSlug, tenantData);
          setState({ status: "ready", school: tenantData, schoolId: data.id, error: null });
        })
        .catch((err) => {
          if (cancelled) return;
          if (isNetworkOrProxyError(err)) {
            console.warn("Tenant lookup via FastAPI failed, disabling FastAPI and falling back to Supabase", err);
            setUseFastAPI(false);
            runSupabaseTenant();
          } else {
            purgeTenantCache(normalizedSlug);
            setState({ status: "error", school: null, schoolId: null, error: err.response?.data?.detail || err.message || "School not found." });
          }
        });
    } else {
      runSupabaseTenant();
    }

    return () => {
      cancelled = true;
    };
  }, [normalizedSlug]);

  return { ...state, slug: normalizedSlug };
}
