import { useEffect, useMemo, useState } from "react";

import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";

type Permissions = {
  loading: boolean;
  error: string | null;
  isPlatformSuperAdmin: boolean;
  canManageStaff: boolean;
  canManageStudents: boolean;
  canWorkCrm: boolean;
  canManageFinance: boolean;
};

export function useSchoolPermissions(schoolId: string | null) {
  const [state, setState] = useState<Permissions>({
    loading: true,
    error: null,
    isPlatformSuperAdmin: false,
    canManageStaff: false,
    canManageStudents: false,
    canWorkCrm: false,
    canManageFinance: false,
  });

  const resolvedSchoolId = useMemo(() => schoolId ?? null, [schoolId]);

  useEffect(() => {
    if (!resolvedSchoolId) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      if (USE_FASTAPI) {
        try {
          const resp = await apiClient.get("/auth/permissions");
          if (!cancelled) {
            setState({
              loading: false,
              error: null,
              isPlatformSuperAdmin: resp.data.isPlatformSuperAdmin,
              canManageStaff: resp.data.canManageStaff,
              canManageStudents: resp.data.canManageStudents,
              canWorkCrm: resp.data.canWorkCrm,
              canManageFinance: resp.data.canManageFinance,
            });
          }
        } catch (err: any) {
          if (!cancelled) {
            setState((s) => ({ ...s, loading: false, error: err.message || "Failed to fetch permissions." }));
          }
        }
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? null;
      if (!userId) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: "Not signed in." }));
        return;
      }

      const { data: psa, error: psaErr } = await supabase
        .from("platform_super_admins")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (psaErr) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: psaErr.message }));
        return;
      }
      const isPlatformSuperAdmin = !!psa?.user_id;

      if (isPlatformSuperAdmin) {
        if (!cancelled)
          setState({
            loading: false,
            error: null,
            isPlatformSuperAdmin: true,
            canManageStaff: true,
            canManageStudents: true,
            canWorkCrm: true,
            canManageFinance: true,
          });
        return;
      }

      // Staff governance scope:
      // - can_manage_staff covers: super_admin, school_owner, principal, vice_principal
      // - HR Managers also need staff governance permissions (role stored in user_roles)
      const [staff, students, crm, hrRole, finance] = await Promise.all([
        (supabase as any).rpc("can_manage_staff", { _school_id: resolvedSchoolId }),
        (supabase as any).rpc("can_manage_students", { _school_id: resolvedSchoolId }),
        (supabase as any).rpc("can_work_crm", { _school_id: resolvedSchoolId }),
        (supabase as any).rpc("has_role", { _school_id: resolvedSchoolId, _role: "hr_manager" }),
        (supabase as any).rpc("can_manage_finance", { _school_id: resolvedSchoolId }),
      ]);

      const err = staff.error ?? students.error ?? crm.error ?? hrRole.error ?? finance.error;
      if (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }));
        return;
      }

      if (!cancelled)
        setState({
          loading: false,
          error: null,
          isPlatformSuperAdmin: false,
          canManageStaff: !!staff.data || !!hrRole.data,
          canManageStudents: !!students.data,
          canWorkCrm: !!crm.data,
          canManageFinance: !!finance.data,
        });
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedSchoolId]);

  return state;
}
