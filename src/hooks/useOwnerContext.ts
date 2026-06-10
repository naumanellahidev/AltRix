import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/hooks/useSession";

export interface OwnerSchool {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
}

export interface OwnerCampus {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  principal_user_id: string | null;
}

const LS_KEY = "eduverse_owner_active_context";
export const ALL_CAMPUSES = "__all";

interface CachedCtx {
  schoolId: string | null;
  campusId: string | null;
}

function readCache(): CachedCtx {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { schoolId: null, campusId: null };
    return JSON.parse(raw);
  } catch {
    return { schoolId: null, campusId: null };
  }
}

function writeCache(ctx: CachedCtx) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ctx));
  } catch {
    // ignore
  }
}

/**
 * Active school + campus context for the School Owner shell.
 * - schools: all schools the current user owns (or all, for platform admins)
 * - campuses: campuses for the active school
 * - activeCampusId === null  =>  "All campuses"
 */
export function useOwnerContext(currentSchoolId: string | null) {
  const { user } = useSession();
  const [schools, setSchools] = useState<OwnerSchool[]>([]);
  const [campuses, setCampuses] = useState<OwnerCampus[]>([]);
  const [activeCampusId, setActiveCampusIdState] = useState<string | null>(
    () => readCache().campusId
  );
  const [loading, setLoading] = useState(true);

  // Load schools list
  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      try {
        if (USE_FASTAPI) {
          const resp = await apiClient.get<OwnerSchool[]>("/schools/owner/schools");
          if (cancel) return;
          setSchools(resp.data ?? []);
        } else {
          const { data, error } = await (supabase as any).rpc("owner_schools_strict");
          if (cancel) return;
          if (!error && Array.isArray(data)) setSchools(data as OwnerSchool[]);
        }
      } catch (e) {
        console.error("Failed to load owner schools", e);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user?.id]);

  // Load campuses for the active school
  useEffect(() => {
    if (!currentSchoolId) {
      setCampuses([]);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        if (USE_FASTAPI) {
          const resp = await apiClient.get<OwnerCampus[]>("/schools/owner/campuses", {
            params: { school_id: currentSchoolId },
          });
          if (cancel) return;
          setCampuses(resp.data ?? []);
        } else {
          const { data, error } = await (supabase as any).rpc("owner_campuses", {
            _school_id: currentSchoolId,
          });
          if (cancel) return;
          if (!error && Array.isArray(data)) setCampuses(data as OwnerCampus[]);
        }
      } catch (e) {
        console.error("Failed to load owner campuses", e);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [currentSchoolId]);

  // Hydrate persisted campus from server
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        let activeCampusIdVal: string | null = null;
        if (USE_FASTAPI) {
          const resp = await apiClient.get<{ active_school_id: string | null; active_campus_id: string | null }>("/schools/owner/active-context");
          activeCampusIdVal = resp.data?.active_campus_id ?? null;
        } else {
          const { data } = await (supabase as any)
            .from("owner_active_context")
            .select("active_school_id, active_campus_id")
            .eq("user_id", user.id)
            .maybeSingle();
          activeCampusIdVal = data?.active_campus_id ?? null;
        }
        if (activeCampusIdVal && currentSchoolId) {
          setActiveCampusIdState(activeCampusIdVal);
          writeCache({ schoolId: currentSchoolId, campusId: activeCampusIdVal });
        }
      } catch (e) {
        console.error("Failed to hydrate owner context", e);
      }
    })();
  }, [user?.id, currentSchoolId]);

  const setActiveCampus = useCallback(
    async (campusId: string | null) => {
      setActiveCampusIdState(campusId);
      writeCache({ schoolId: currentSchoolId, campusId });
      try {
        window.dispatchEvent(new Event("eduverse:owner-campus-change"));
      } catch {
        // ignore
      }
      if (!user) return;
      try {
        if (USE_FASTAPI) {
          await apiClient.post("/schools/owner/active-context", {
            active_school_id: currentSchoolId,
            active_campus_id: campusId,
          });
        } else {
          await (supabase as any)
            .from("owner_active_context")
            .upsert(
              {
                user_id: user.id,
                active_school_id: currentSchoolId,
                active_campus_id: campusId,
              },
              { onConflict: "user_id" }
            );
        }
      } catch (e) {
        console.error("Failed to set active campus", e);
      }
    },
    [user?.id, currentSchoolId]
  );

  const activeSchool = useMemo(
    () => schools.find((s) => s.id === currentSchoolId) ?? null,
    [schools, currentSchoolId]
  );
  const activeCampus = useMemo(
    () => campuses.find((c) => c.id === activeCampusId) ?? null,
    [campuses, activeCampusId]
  );

  return {
    loading,
    schools,
    campuses,
    activeSchool,
    activeCampus,
    activeCampusId,
    setActiveCampus,
  };
}
