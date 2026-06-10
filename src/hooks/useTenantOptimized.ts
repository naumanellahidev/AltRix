import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";

// LocalStorage cache key builder
const getTenantCacheKey = (slug: string) => `eduverse_tenant_${slug}`;

// Get cached tenant data from localStorage
function getCachedTenant(slug: string): TenantData | null {
  try {
    const cached = localStorage.getItem(getTenantCacheKey(slug));
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;
    
    // Cache valid for 24 hours
    if (age > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(getTenantCacheKey(slug));
      return null;
    }
    
    return parsed.data;
  } catch {
    return null;
  }
}

// Save tenant data to localStorage
function cacheTenant(slug: string, data: TenantData) {
  try {
    localStorage.setItem(
      getTenantCacheKey(slug),
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch (e) {
    console.warn("Failed to cache tenant data:", e);
  }
}

interface TenantData {
  id: string;
  slug: string;
  name: string;
  branding?: {
    accent_hue: number;
    accent_saturation: number;
    accent_lightness: number;
    radius_scale: number;
  } | null;
}

interface TenantResult {
  status: "idle" | "loading" | "ready" | "error";
  school: { id: string; slug: string; name: string } | null;
  schoolId: string | null;
  branding: TenantData["branding"];
  error: string | null;
  slug: string;
}

// Global cache for applied branding to avoid re-applying
const appliedBrandingCache = new Map<string, boolean>();

function applyBranding(schoolId: string, branding: TenantData["branding"]) {
  if (!branding || appliedBrandingCache.get(schoolId)) return;
  
  // Only apply if all color values are present and valid
  if (branding.accent_hue == null || branding.accent_saturation == null || branding.accent_lightness == null) return;
  
  const root = document.documentElement;
  root.style.setProperty("--brand", `${branding.accent_hue} ${branding.accent_saturation}% ${branding.accent_lightness}%`);
  root.style.setProperty("--radius", `${0.85 * (branding.radius_scale || 1)}rem`);
  appliedBrandingCache.set(schoolId, true);
}

export function useTenantOptimized(schoolSlug: string | undefined): TenantResult {
  const normalizedSlug = useMemo(
    () => (schoolSlug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, ""),
    [schoolSlug]
  );

  const { data, error, isLoading, isError } = useQuery({
    queryKey: ["tenant", normalizedSlug],
    queryFn: async (): Promise<TenantData | null> => {
      // Check if offline and return cached data immediately
      if (!navigator.onLine) {
        const cached = getCachedTenant(normalizedSlug);
        if (cached) return cached;
        throw new Error("No cached data available offline");
      }

      if (USE_FASTAPI) {
        const schoolResp = await apiClient.get(`/schools/by-slug/${normalizedSlug}`);
        const schoolData = schoolResp.data;
        if (!schoolData) return null;

        let branding = null;
        try {
          const brandingResp = await apiClient.get(`/schools/${schoolData.id}/branding`);
          branding = brandingResp.data;
        } catch (e) {
          console.warn("Failed to fetch school branding:", e);
        }

        const tenantData: TenantData = {
          id: schoolData.id,
          slug: schoolData.slug,
          name: schoolData.name,
          branding: branding || null,
        };

        cacheTenant(normalizedSlug, tenantData);
        return tenantData;
      }

      // Get school data
      const { data: schoolData, error: schoolError } = await supabase
        .rpc("get_school_public_by_slug", { _slug: normalizedSlug })
        .maybeSingle();

      if (schoolError) throw new Error(schoolError.message);
      if (!schoolData) return null;

      // Fetch branding in parallel - but don't block on it
      const { data: branding } = await supabase
        .from("school_branding")
        .select("accent_hue,accent_saturation,accent_lightness,radius_scale")
        .eq("school_id", schoolData.id)
        .maybeSingle();

      const tenantData: TenantData = {
        id: schoolData.id,
        slug: schoolData.slug,
        name: schoolData.name,
        branding: branding || null,
      };

      // Cache the result
      cacheTenant(normalizedSlug, tenantData);
      return tenantData;
    },
    enabled: !!normalizedSlug,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    initialData: () => {
      // Provide cached data as initial data to prevent loading state
      if (!normalizedSlug) return undefined;
      return getCachedTenant(normalizedSlug) || undefined;
    },
  });

  // Apply branding when data is available
  if (data?.id && data.branding) {
    applyBranding(data.id, data.branding);
  }

  if (!normalizedSlug) {
    return { status: "idle", school: null, schoolId: null, branding: null, error: null, slug: "" };
  }

  if (isLoading) {
    return { status: "loading", school: null, schoolId: null, branding: null, error: null, slug: normalizedSlug };
  }

  if (isError || !data) {
    return { 
      status: "error", 
      school: null, 
      schoolId: null, 
      branding: null, 
      error: error?.message || "School not found.", 
      slug: normalizedSlug 
    };
  }

  return {
    status: "ready",
    school: { id: data.id, slug: data.slug, name: data.name },
    schoolId: data.id,
    branding: data.branding,
    error: null,
    slug: normalizedSlug,
  };
}
