import { useState, useCallback } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";

export interface StudentRow {
  student_id: string;
  first_name: string;
  last_name: string | null;
  status: "present" | "absent" | "late" | "excused";
}

export interface AttendanceSession {
  id: string;
  session_date: string;
  period_label: string;
  created_at: string;
}

export interface StudentAttendanceStats {
  student_id: string;
  first_name: string;
  last_name: string | null;
  total_sessions: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  attendance_percentage: number;
}

export function useAttendanceData(schoolId: string | null) {
  const [loading, setLoading] = useState(false);

  const loadSessionData = useCallback(
    async (
      sectionId: string,
      sessionDate: string,
      periodLabel: string,
      options?: { readOnly?: boolean }
    ): Promise<{ sessionId: string | null; rows: StudentRow[] } | null> => {
      if (!schoolId) return null;
      setLoading(true);

      try {
        if (USE_FASTAPI) {
          const resp = await apiClient.get("/attendance/get-or-create", {
            params: {
              section_id: sectionId,
              session_date: sessionDate,
              period_label: periodLabel,
              read_only: !!options?.readOnly,
            },
          });
          return resp.data;
        }

        // Get or create session
        const { data: existingSession } = await supabase
          .from("attendance_sessions")
          .select("id")
          .eq("school_id", schoolId)
          .eq("class_section_id", sectionId)
          .eq("session_date", sessionDate)
          .eq("period_label", periodLabel)
          .maybeSingle();

        let sid: string | null = existingSession?.id ?? null;

        if (!sid) {
          if (options?.readOnly) {
            // Viewer cannot create sessions — just return an empty roster
            const { data: enrollments } = await supabase
              .from("student_enrollments")
              .select("student_id")
              .eq("school_id", schoolId)
              .eq("class_section_id", sectionId);
            const studentIds = (enrollments ?? []).map((e) => e.student_id);
            const { data: students } = studentIds.length
              ? await supabase.from("students").select("id, first_name, last_name").in("id", studentIds)
              : { data: [] as any[] };
            const rows: StudentRow[] = (students ?? []).map((s: any) => ({
              student_id: s.id,
              first_name: s.first_name,
              last_name: s.last_name,
              status: "present",
            }));
            return { sessionId: null, rows };
          }

          const { data: user } = await supabase.auth.getUser();
          const { data: newSession, error } = await supabase
            .from("attendance_sessions")
            .insert({
              school_id: schoolId,
              class_section_id: sectionId,
              session_date: sessionDate,
              period_label: periodLabel,
              created_by: user.user?.id,
            })
            .select()
            .single();

          if (error) {
            toast({ title: "Failed to create session", description: error.message, variant: "destructive" });
            return null;
          }
          sid = newSession.id;
        }

        // Load students
        const { data: enrollments } = await supabase
          .from("student_enrollments")
          .select("student_id")
          .eq("school_id", schoolId)
          .eq("class_section_id", sectionId);

        if (!enrollments?.length) {
          return { sessionId: sid, rows: [] };
        }

        const studentIds = enrollments.map((e) => e.student_id);
        const { data: students } = await supabase
          .from("students")
          .select("id, first_name, last_name")
          .in("id", studentIds);

        // Load existing entries
        const { data: entries } = await supabase
          .from("attendance_entries")
          .select("student_id, status")
          .eq("session_id", sid);

        const statusMap = new Map(entries?.map((e) => [e.student_id, e.status as StudentRow["status"]]) || []);

        const studentRows: StudentRow[] = (students || []).map((s) => ({
          student_id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          status: statusMap.get(s.id) || "present",
        }));

        return { sessionId: sid, rows: studentRows };
      } finally {
        setLoading(false);
      }
    },
    [schoolId]
  );

  const saveAttendance = useCallback(
    async (sessionId: string, rows: StudentRow[]): Promise<boolean> => {
      if (!schoolId) return false;

      if (USE_FASTAPI) {
        try {
          await apiClient.post(`/attendance/sessions/${sessionId}/save`, rows);
          toast({ title: "Attendance saved successfully" });
          return true;
        } catch (err: any) {
          toast({ title: "Failed to save", description: err.message, variant: "destructive" });
          return false;
        }
      }

      const payload = rows.map((r) => ({
        session_id: sessionId,
        school_id: schoolId,
        student_id: r.student_id,
        status: r.status,
      }));

      const { error } = await supabase.from("attendance_entries").upsert(payload, {
        onConflict: "school_id,session_id,student_id",
      });

      if (error) {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
        return false;
      }

      toast({ title: "Attendance saved successfully" });
      return true;
    },
    [schoolId]
  );

  const loadSessionHistory = useCallback(
    async (sectionId: string, limit = 30): Promise<AttendanceSession[]> => {
      if (!schoolId) return [];

      if (USE_FASTAPI) {
        const resp = await apiClient.get(`/attendance/history/${sectionId}`, {
          params: { limit },
        });
        return resp.data;
      }

      const { data } = await supabase
        .from("attendance_sessions")
        .select("id, session_date, period_label, created_at")
        .eq("school_id", schoolId)
        .eq("class_section_id", sectionId)
        .order("session_date", { ascending: false })
        .order("period_label", { ascending: true })
        .limit(limit);

      return data || [];
    },
    [schoolId]
  );

  const loadStudentAttendanceStats = useCallback(
    async (sectionId: string): Promise<StudentAttendanceStats[]> => {
      if (!schoolId) return [];

      if (USE_FASTAPI) {
        const resp = await apiClient.get(`/attendance/stats/${sectionId}`);
        return resp.data;
      }

      // Get all sessions for this section
      const { data: sessions } = await supabase
        .from("attendance_sessions")
        .select("id")
        .eq("school_id", schoolId)
        .eq("class_section_id", sectionId);

      if (!sessions?.length) return [];

      const sessionIds = sessions.map((s) => s.id);

      // Get all entries for these sessions
      const { data: entries } = await supabase
        .from("attendance_entries")
        .select("student_id, status")
        .in("session_id", sessionIds);

      // Get enrolled students
      const { data: enrollments } = await supabase
        .from("student_enrollments")
        .select("student_id")
        .eq("school_id", schoolId)
        .eq("class_section_id", sectionId);

      if (!enrollments?.length) return [];

      const studentIds = enrollments.map((e) => e.student_id);
      const { data: students } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .in("id", studentIds);

      // Calculate stats per student
      const statsMap = new Map<
        string,
        { present: number; absent: number; late: number; excused: number }
      >();

      entries?.forEach((e) => {
        const current = statsMap.get(e.student_id) || { present: 0, absent: 0, late: 0, excused: 0 };
        if (e.status === "present") current.present++;
        else if (e.status === "absent") current.absent++;
        else if (e.status === "late") current.late++;
        else if (e.status === "excused") current.excused++;
        statsMap.set(e.student_id, current);
      });

      const totalSessions = sessions.length;

      return (students || []).map((s) => {
        const stats = statsMap.get(s.id) || { present: 0, absent: 0, late: 0, excused: 0 };
        const attendedSessions = stats.present + stats.late; // Late counts as attended
        const percentage = totalSessions > 0 ? (attendedSessions / totalSessions) * 100 : 100;

        return {
          student_id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          total_sessions: totalSessions,
          present_count: stats.present,
          absent_count: stats.absent,
          late_count: stats.late,
          excused_count: stats.excused,
          attendance_percentage: Math.round(percentage * 10) / 10,
        };
      });
    },
    [schoolId]
  );

  const loadSessionEntries = useCallback(
    async (sessionId: string): Promise<StudentRow[]> => {
      if (!schoolId) return [];

      if (USE_FASTAPI) {
        const resp = await apiClient.get(`/attendance/sessions/${sessionId}/roster`);
        return resp.data;
      }

      // Get session info to find the section
      const { data: session } = await supabase
        .from("attendance_sessions")
        .select("class_section_id")
        .eq("id", sessionId)
        .single();

      if (!session) return [];

      // Load students
      const { data: enrollments } = await supabase
        .from("student_enrollments")
        .select("student_id")
        .eq("school_id", schoolId)
        .eq("class_section_id", session.class_section_id);

      if (!enrollments?.length) return [];

      const studentIds = enrollments.map((e) => e.student_id);
      const { data: students } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .in("id", studentIds);

      // Load entries
      const { data: entries } = await supabase
        .from("attendance_entries")
        .select("student_id, status")
        .eq("session_id", sessionId);

      const statusMap = new Map(entries?.map((e) => [e.student_id, e.status as StudentRow["status"]]) || []);

      return (students || []).map((s) => ({
        student_id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        status: statusMap.get(s.id) || "present",
      }));
    },
    [schoolId]
  );

  return {
    loading,
    loadSessionData,
    saveAttendance,
    loadSessionHistory,
    loadStudentAttendanceStats,
    loadSessionEntries,
  };
}
