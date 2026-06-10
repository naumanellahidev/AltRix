import { useEffect, useState } from "react";

const LS_KEY = "eduverse_owner_active_context";
export const OWNER_CAMPUS_EVENT = "eduverse:owner-campus-change";

interface CachedCtx {
  schoolId: string | null;
  campusId: string | null;
}

function read(): CachedCtx {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { schoolId: null, campusId: null };
    return JSON.parse(raw);
  } catch {
    return { schoolId: null, campusId: null };
  }
}

/**
 * Lightweight read-only subscription to the owner's active campus.
 * Returns null when "All campuses" is selected.
 * Modules use this to scope queries: `.eq("campus_id", activeCampusId)` when not null.
 */
export function useActiveCampus(schoolId: string | null): string | null {
  const [campusId, setCampusId] = useState<string | null>(() => {
    const c = read();
    return c.schoolId === schoolId ? c.campusId : null;
  });

  useEffect(() => {
    const sync = () => {
      const c = read();
      setCampusId(c.schoolId === schoolId ? c.campusId : null);
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(OWNER_CAMPUS_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(OWNER_CAMPUS_EVENT, sync);
    };
  }, [schoolId]);

  return campusId;
}

/** Helper to apply campus filter to a Supabase query builder. */
export function applyCampusFilter<T extends { eq: (...args: any[]) => T }>(
  query: T,
  campusId: string | null
): T {
  return campusId ? query.eq("campus_id", campusId) : query;
}
