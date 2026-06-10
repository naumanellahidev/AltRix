import { useEffect, useState } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";

type State =
  | { status: "idle" | "loading"; studentId: null; error: null }
  | { status: "ready"; studentId: string; error: null }
  | { status: "error"; studentId: null; error: string };

export function useMyStudentId(schoolId: string | null) {
  const [state, setState] = useState<State>({ status: "idle", studentId: null, error: null });

  useEffect(() => {
    if (!schoolId) {
      setState({ status: "idle", studentId: null, error: null });
      return;
    }

    let cancelled = false;
    setState({ status: "loading", studentId: null, error: null });

    (async () => {
      if (USE_FASTAPI) {
        try {
          const resp = await apiClient.get<{ student_id: string | null }>("/students/my-student-id", {
            params: { school_id: schoolId }
          });
          if (cancelled) return;
          const studentIdData = resp.data.student_id;
          if (!studentIdData) {
            setState({ status: "error", studentId: null, error: "No student profile is linked to this account." });
            return;
          }
          setState({ status: "ready", studentId: studentIdData, error: null });
        } catch (err: any) {
          if (cancelled) return;
          setState({ status: "error", studentId: null, error: err.message || "Failed to fetch student ID." });
        }
      } else {
        const { data, error } = await (supabase as any).rpc("my_student_id", { _school_id: schoolId });
        if (cancelled) return;
        if (error) {
          setState({ status: "error", studentId: null, error: error.message });
          return;
        }
        if (!data) {
          setState({ status: "error", studentId: null, error: "No student profile is linked to this account." });
          return;
        }
        setState({ status: "ready", studentId: data as unknown as string, error: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  return state;
}
