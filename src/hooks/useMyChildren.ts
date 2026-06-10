import { useEffect, useState, useCallback } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";

export interface ChildInfo {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  class_name: string | null;
  section_name: string | null;
  roll_number?: string | null;
  student_code?: string | null;
  profile_image_url?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  class_section_id?: string | null;
}

export function useMyChildren(schoolId: string | null) {
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChildren = useCallback(async () => {
    if (!schoolId) {
      setChildren([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let list: ChildInfo[] = [];
      if (USE_FASTAPI) {
        const resp = await apiClient.get<any[]>("/students/my-children");
        list = (resp.data ?? []).map((row: any) => ({
          student_id: row.student_id,
          first_name: row.first_name,
          last_name: row.last_name,
          class_name: row.class_name,
          section_name: row.section_name,
          roll_number: row.roll_number,
          student_code: row.student_code,
          profile_image_url: row.profile_image_url,
          date_of_birth: row.date_of_birth,
          gender: row.gender,
          class_section_id: row.class_section_id,
        }));
      } else {
        const { data, error: rpcError } = await (supabase as any).rpc(
          "my_children_detailed",
          { _school_id: schoolId },
        );
        if (rpcError) throw rpcError;

        list = (data ?? []).map((row: any) => ({
          student_id: row.student_id,
          first_name: row.first_name,
          last_name: row.last_name,
          class_name: row.class_name,
          section_name: row.section_name,
          roll_number: row.roll_number,
          student_code: row.student_code,
          profile_image_url: row.profile_image_url,
          date_of_birth: row.date_of_birth,
          gender: row.gender,
          class_section_id: row.class_section_id,
        }));
      }
      setChildren(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch children");
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void fetchChildren();
  }, [fetchChildren]);

  return { children, loading, error, refetch: fetchChildren };
}
