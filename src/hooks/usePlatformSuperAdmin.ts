import { useEffect, useState } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";

type PlatformAuthz = {
  loading: boolean;
  allowed: boolean;
  message: string | null;
  isNetworkError?: boolean;
};

/**
 * The Master Super Admin territory is reserved for a single hard-coded
 * platform owner. Even if extra rows exist in `platform_super_admins`,
 * only this email is allowed past the gate.
 */
export const MASTER_SUPER_ADMIN_EMAIL = "naumancheema643@gmail.com";

/**
 * Server-verified platform super admin check.
 * Requires BOTH:
 *   1. A row in `platform_super_admins` (RLS-scoped to the caller)
 *   2. The session email matches the hard-coded master email
 */
export function usePlatformSuperAdmin(userId: string | null | undefined): PlatformAuthz {
  const [state, setState] = useState<PlatformAuthz>({ loading: true, allowed: false, message: null, isNetworkError: false });

  useEffect(() => {
    if (!userId) {
      setState({ loading: false, allowed: false, message: "Not signed in.", isNetworkError: false });
      return;
    }

    let cancelled = false;
    setState({ loading: true, allowed: false, message: null, isNetworkError: false });

    (async () => {
      try {
        let allowed = false;
        let message: string | null = null;

        if (USE_FASTAPI) {
          const resp = await apiClient.get<any>("/auth/me");
          const email = resp.data.email?.toLowerCase() ?? "";
          const isSuper = resp.data.is_super_admin;
          if (email === MASTER_SUPER_ADMIN_EMAIL && isSuper) {
            allowed = true;
          } else {
            message = "Access denied. Master Super Admin only.";
          }
        } else {
          const { data: userData } = await supabase.auth.getUser();
          const email = userData.user?.email?.toLowerCase() ?? null;

          if (email !== MASTER_SUPER_ADMIN_EMAIL) {
            if (!cancelled) {
              setState({
                loading: false,
                allowed: false,
                message: "Access denied. Master Super Admin only.",
                isNetworkError: false,
              });
            }
            return;
          }

          const { data: psa, error } = await supabase
             .from("platform_super_admins")
             .select("user_id")
             .eq("user_id", userId)
             .maybeSingle();

          if (error) {
            if (!cancelled) {
              setState({ loading: false, allowed: false, message: error.message, isNetworkError: false });
            }
            return;
          }
          allowed = !!psa?.user_id;
          message = psa?.user_id ? null : "Access denied. Master Super Admin only.";
        }

        if (!cancelled) {
          setState({
            loading: false,
            allowed,
            message,
            isNetworkError: false,
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          const isNetwork = 
            err.code === "ERR_NETWORK" || 
            err.message?.toLowerCase().includes("network") ||
            err.response?.status === 502 ||
            (USE_FASTAPI && !err.response);

          setState({
            loading: false,
            allowed: false,
            message: isNetwork 
              ? "FastAPI Backend is unreachable. Please verify that the backend server is running on port 8000."
              : (err.response?.data?.message || err.message || "Failed to verify platform super admin."),
            isNetworkError: isNetwork,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}

