import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const SESSION_CACHE_KEY = "eduverse_session_cache";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface CachedSession {
  user: {
    id: string;
    email: string | undefined;
    user_metadata: Record<string, unknown>;
  };
  timestamp: number;
}

function getCachedUser(): User | null {
  try {
    const cached = localStorage.getItem(SESSION_CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedSession = JSON.parse(cached);
    if (Date.now() - data.timestamp > CACHE_DURATION) {
      localStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
    
    // Return minimal user object for offline use
    return {
      id: data.user.id,
      email: data.user.email,
      user_metadata: data.user.user_metadata,
    } as User;
  } catch {
    return null;
  }
}

function cacheUser(user: User | null) {
  try {
    if (user) {
      const data: CachedSession = {
        user: {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata || {},
        },
        timestamp: Date.now(),
      };
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(SESSION_CACHE_KEY);
      localStorage.removeItem("eduverse_authz_cache_v2");
    }
  } catch {
    // Ignore storage errors
  }
}

export function useSession() {
  // Initialize with cached user for offline scenarios
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(() => getCachedUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      cacheUser(nextSession?.user ?? null);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: current } }) => {
        setSession(current);
        const currentUser = current?.user ?? null;
        setUser(currentUser);
        cacheUser(currentUser);
      })
      .catch(() => {
        // If offline, keep using cached user
        if (!navigator.onLine) {
          const cached = getCachedUser();
          if (cached) {
            setUser(cached);
          }
        }
      })
      .finally(() => setLoading(false));

    return () => data.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}
