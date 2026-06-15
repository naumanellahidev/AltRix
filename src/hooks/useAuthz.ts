import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import type { EduverseRole } from "@/lib/eduverse-roles";

interface AuthzResult {
  state: "checking" | "ok" | "denied";
  message: string | null;
  isPlatformAdmin: boolean;
  isMember: boolean;
  hasRole: boolean;
}

interface AuthzOptions {
  schoolId: string | null;
  userId: string | null;
  role?: EduverseRole | null;
  requiredRoles?: EduverseRole[];
}

// Cache key for storing auth results
const AUTHZ_CACHE_KEY = "eduverse_authz_cache_v2";

interface CachedAuthzEntry {
  schoolId: string;
  userId: string;
  roles: string[];
  result: AuthzResult;
  timestamp: number;
}

interface CachedAuthzStore {
  entries: CachedAuthzEntry[];
  version: number;
}

// Cache duration: 24 hours (auth doesn't change often)
const CACHE_DURATION = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 10;

function getCachedStore(): CachedAuthzStore {
  try {
    const cached = localStorage.getItem(AUTHZ_CACHE_KEY);
    if (!cached) return { entries: [], version: 1 };
    return JSON.parse(cached);
  } catch {
    return { entries: [], version: 1 };
  }
}

function saveCachedStore(store: CachedAuthzStore) {
  try {
    localStorage.setItem(AUTHZ_CACHE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage errors
  }
}

function getCachedAuthz(schoolId: string, userId: string, requiredRoles: string[]): AuthzResult | null {
  try {
    const store = getCachedStore();
    const rolesKey = JSON.stringify(requiredRoles.sort());
    
    const entry = store.entries.find(
      e => e.schoolId === schoolId && 
           e.userId === userId && 
           JSON.stringify(e.roles.sort()) === rolesKey &&
           Date.now() - e.timestamp < CACHE_DURATION
    );
    
    return entry?.result || null;
  } catch {
    return null;
  }
}

function setCachedAuthz(schoolId: string, userId: string, roles: string[], result: AuthzResult) {
  try {
    const store = getCachedStore();
    const rolesKey = JSON.stringify(roles.sort());
    
    // Remove old entry for same params
    store.entries = store.entries.filter(
      e => !(e.schoolId === schoolId && e.userId === userId && JSON.stringify(e.roles.sort()) === rolesKey)
    );
    
    // Add new entry
    store.entries.push({
      schoolId,
      userId,
      roles,
      result,
      timestamp: Date.now(),
    });
    
    // Keep only recent entries
    if (store.entries.length > MAX_CACHE_ENTRIES) {
      store.entries = store.entries
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_CACHE_ENTRIES);
    }
    
    saveCachedStore(store);
  } catch {
    // Ignore storage errors
  }
}

export function useAuthz({ schoolId, userId, role, requiredRoles }: AuthzOptions): AuthzResult {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const rolesArray = requiredRoles || (role ? [role] : []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Get cached result immediately (synchronously) for offline/refresh scenarios
  const cachedResult = useMemo(() => {
    if (!schoolId || !userId) return null;
    return getCachedAuthz(schoolId, userId, rolesArray);
  }, [schoolId, userId, rolesArray.join(",")]);

  // If offline and we have cached data, return it immediately without query
  const shouldSkipQuery = !isOnline && !!cachedResult;

  const { data, isLoading } = useQuery({
    queryKey: ["authz", schoolId, userId, role, requiredRoles],
    queryFn: async (): Promise<AuthzResult> => {
      if (!userId) {
        return { state: "denied", message: "Not authenticated", isPlatformAdmin: false, isMember: false, hasRole: false };
      }

      // If offline and we have cached data, use it
      if (!navigator.onLine && cachedResult) {
        return cachedResult;
      }

      if (USE_FASTAPI) {
        try {
          const resp = await apiClient.get("/auth/me", {
            headers: {
              "X-School-Id": schoolId || undefined,
            },
          });
          const userData = resp.data;
          
          const isPlatformAdmin = !!userData.is_super_admin;
          const userRoles: string[] = userData.roles || [];
          const isMember = userRoles.length > 0;
          const hasRole = rolesArray.some(r => userRoles.includes(r));

          let result: AuthzResult;
          if (isPlatformAdmin) {
            result = { state: "ok", message: null, isPlatformAdmin: true, isMember: true, hasRole: true };
          } else if (schoolId && !isMember) {
            result = { state: "denied", message: "You are not a member of this school.", isPlatformAdmin: false, isMember: false, hasRole: false };
          } else if ((role || requiredRoles?.length) && !hasRole) {
            result = { 
              state: "denied", 
              message: `You do not have the required role in this school.`, 
              isPlatformAdmin: false, 
              isMember, 
              hasRole: false 
            };
          } else {
            result = { state: "ok", message: null, isPlatformAdmin: false, isMember, hasRole };
          }

          if (schoolId && userId) {
            setCachedAuthz(schoolId, userId, rolesArray, result);
          }
          return result;
        } catch (e: any) {
          console.error("Authz check via FastAPI failed:", e);
          return { state: "denied", message: e.message || "Failed to retrieve authorizations", isPlatformAdmin: false, isMember: false, hasRole: false };
        }
      }

      // Run all checks in parallel for speed
      const [psaResult, membershipResult, roleResult] = await Promise.all([
        // Check platform super admin
        supabase
          .from("platform_super_admins")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle(),
        
        // Check school membership
        schoolId
          ? supabase
              .from("school_memberships")
              .select("id")
              .eq("school_id", schoolId)
              .eq("user_id", userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        
        // Check specific role or any of required roles
        schoolId && (role || requiredRoles?.length)
          ? supabase
              .from("user_roles")
              .select("role")
              .eq("school_id", schoolId)
              .eq("user_id", userId)
              .in("role", rolesArray)
          : Promise.resolve({ data: null, error: null }),
      ]);

      const isPlatformAdmin = !!psaResult.data?.user_id;
      const isMember = !!membershipResult.data?.id;
      const hasRole = (roleResult.data?.length ?? 0) > 0;

      let result: AuthzResult;

      // Platform admins bypass all checks
      if (isPlatformAdmin) {
        result = { state: "ok", message: null, isPlatformAdmin: true, isMember: true, hasRole: true };
      } else if (schoolId && !isMember) {
        // Check membership
        result = { state: "denied", message: "You are not a member of this school.", isPlatformAdmin: false, isMember: false, hasRole: false };
      } else if ((role || requiredRoles?.length) && !hasRole) {
        // Check role if required
        result = { 
          state: "denied", 
          message: `You do not have the required role in this school.`, 
          isPlatformAdmin: false, 
          isMember, 
          hasRole: false 
        };
      } else {
        result = { state: "ok", message: null, isPlatformAdmin: false, isMember, hasRole };
      }

      // Cache all results (not just OK) for offline access
      if (schoolId && userId) {
        setCachedAuthz(schoolId, userId, rolesArray, result);
      }

      return result;
    },
    enabled: !!userId && !shouldSkipQuery,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: isOnline ? 3 : 0, // Don't retry when offline
    retryDelay: 1000,
  });

  if (!userId) {
    return { state: "denied", message: "Not authenticated", isPlatformAdmin: false, isMember: false, hasRole: false };
  }

  // CRITICAL: If offline with cached data, use cache immediately (no "checking" state)
  if (!isOnline && cachedResult) {
    return cachedResult;
  }

  // If we have cached data, use it while loading (prevents "checking" flash on refresh)
  if (isLoading && cachedResult) {
    return cachedResult;
  }

  if (isLoading) {
    return { state: "checking", message: null, isPlatformAdmin: false, isMember: false, hasRole: false };
  }

  return data || { state: "denied", message: "Unknown error", isPlatformAdmin: false, isMember: false, hasRole: false };
}
