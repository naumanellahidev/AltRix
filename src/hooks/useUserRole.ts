import { useEffect, useState } from "react";
import { api, USE_FASTAPI } from "@/lib/api";
import { type EduverseRole } from "@/lib/eduverse-roles";
import { apiClient } from "@/lib/api-client";

interface UseUserRoleResult {
  roles: EduverseRole[];
  primaryRole: EduverseRole | null;
  isStudent: boolean;
  isTeacher: boolean;
  isStaff: boolean;
  loading: boolean;
}

export function useUserRole(schoolId: string | null, userId: string | null): UseUserRoleResult {
  const [roles, setRoles] = useState<EduverseRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId || !userId) {
      setRoles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchRoles = async () => {
      setLoading(true);
      let fetchedRoles: EduverseRole[] = [];

      if (USE_FASTAPI) {
        try {
          const resp = await apiClient.get<Array<{ role: string }>>("/auth/user-roles", {
            params: { school_id: schoolId, user_id: userId }
          });
          if (resp?.data && Array.isArray(resp.data) && resp.data.length > 0) {
            fetchedRoles = resp.data.map((r) => r.role as EduverseRole);
          }
        } catch (err) {
          console.warn("FastAPI user-roles fallback to direct DB:", err);
        }
      }

      if (fetchedRoles.length === 0) {
        try {
          const { data } = await api
            .from("user_roles")
            .select("role")
            .eq("school_id", schoolId)
            .eq("user_id", userId);

          if (data && data.length > 0) {
            fetchedRoles = data.map((r) => r.role as EduverseRole);
          }
        } catch {}
      }

      if (!cancelled) {
        setRoles(fetchedRoles);
        setLoading(false);
      }
    };

    fetchRoles();
    return () => { cancelled = true; };
  }, [schoolId, userId]);

  // Calculate primary role based on hierarchy
  const getPrimaryRole = (): EduverseRole | null => {
    if (roles.length === 0) return null;
    
    const hierarchy: EduverseRole[] = [
      "super_admin",
      "school_owner",
      "principal",
      "vice_principal",
      "school_admin",
      "academic_coordinator",
      "teacher",
      "accountant",
      "hr_manager",
      "counselor",
      "marketing_staff",
      "parent",
      "student",
    ];

    for (const role of hierarchy) {
      if (roles.includes(role)) return role;
    }
    return roles[0];
  };

  const primaryRole = getPrimaryRole();
  const isStudent = roles.includes("student") && roles.length === 1;
  const isTeacher = roles.includes("teacher");
  const staffRoles: EduverseRole[] = [
    "super_admin",
    "school_owner",
    "principal",
    "vice_principal",
    "school_admin",
    "academic_coordinator",
    "teacher",
    "accountant",
    "hr_manager",
    "counselor",
    "marketing_staff",
  ];
  const isStaff = roles.some((r) => staffRoles.includes(r));

  return {
    roles,
    primaryRole,
    isStudent,
    isTeacher,
    isStaff,
    loading,
  };
}
