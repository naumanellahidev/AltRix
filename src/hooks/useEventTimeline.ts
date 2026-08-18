import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, USE_FASTAPI } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/hooks/useSession";
import { useRealtimeTable } from "@/hooks/useRealtime";

export interface ActivityTimelineItem {
  id: string;
  school_id: string | null;
  campus_id: string | null;
  user_id: string | null;
  event_name: string;
  title: string;
  description: string | null;
  category: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  actor_name?: string;
  actor_role?: string;
}

export function useEventTimeline(category?: string, page = 1, limit = 20) {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user?.id;

  const queryKey = ["event_timeline", category, page, limit, userId];

  // Fetch timeline feed
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!userId) return { data: [], total: 0 };

      // Resolve schoolId
      const { data: membership } = await api
        .from("school_memberships")
        .select("school_id, full_name, role_name")
        .eq("user_id", userId)
        .maybeSingle();

      const schoolId = membership?.school_id || localStorage.getItem("eduverse_active_school_id");

      // 1. Fetch via FastAPI if active
      if (USE_FASTAPI) {
        try {
          const res = await apiClient.get("/events/timeline", {
            params: {
              page,
              page_size: limit,
              category,
              school_id: schoolId,
            }
          });
          if (res?.data?.data && Array.isArray(res.data.data) && res.data.data.length > 0) {
            return {
              data: res.data.data as ActivityTimelineItem[],
              total: res.data.total as number
            };
          }
        } catch (apiErr) {
          console.warn("FastAPI timeline fallback to direct DB:", apiErr);
        }
      }

      if (!schoolId) return { data: [], total: 0 };

      // 2. Fetch direct activities from DB
      const collected: ActivityTimelineItem[] = [];

      try {
        let query = api
          .from("activity_timeline")
          .select("*")
          .eq("school_id", schoolId);

        if (category) {
          query = query.eq("category", category);
        }

        const { data: rows } = await query
          .order("created_at", { ascending: false })
          .limit(limit);

        if (rows && rows.length > 0) {
          rows.forEach((r) => collected.push(r as ActivityTimelineItem));
        }
      } catch {}

      // 3. Synthesize live activities if rows are sparse
      if (collected.length < 8) {
        try {
          const [payRes, stRes, attRes, leadRes] = await Promise.all([
            // Finance payments
            api
              .from("fee_payments")
              .select("id, amount, status, created_at, paid_at")
              .eq("school_id", schoolId)
              .order("created_at", { ascending: false })
              .limit(8),
            // Student enrollments
            api
              .from("students")
              .select("id, first_name, last_name, roll_number, admission_number, created_at")
              .eq("school_id", schoolId)
              .order("created_at", { ascending: false })
              .limit(6),
            // Attendance logs
            api
              .from("attendance_entries")
              .select("id, status, created_at")
              .eq("school_id", schoolId)
              .order("created_at", { ascending: false })
              .limit(4),
            // CRM Leads
            api
              .from("crm_leads")
              .select("id, student_name, parent_name, phone, created_at")
              .eq("school_id", schoolId)
              .order("created_at", { ascending: false })
              .limit(4),
          ]);

          (payRes.data || []).forEach((p: any) => {
            const amt = Number(p.amount) || 0;
            collected.push({
              id: `pay-${p.id}`,
              school_id: schoolId,
              campus_id: null,
              user_id: null,
              event_name: "fee_payment.collected",
              title: "Fee Payment Reconciled",
              description: `Payment of PKR ${amt.toLocaleString()} received (Status: ${p.status || "paid"}).`,
              category: "finance",
              entity_type: "fee_payments",
              entity_id: p.id,
              created_at: p.paid_at || p.created_at || new Date().toISOString(),
              actor_name: "Finance Desk",
              actor_role: "Accountant",
            });
          });

          (stRes.data || []).forEach((s: any) => {
            const name = `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Student";
            collected.push({
              id: `st-${s.id}`,
              school_id: schoolId,
              campus_id: null,
              user_id: null,
              event_name: "student.enrolled",
              title: `Admitted: ${name}`,
              description: `Student enrolled with Roll #${s.roll_number || s.admission_number || "N/A"} (Adm #${s.admission_number || "N/A"}).`,
              category: "academic",
              entity_type: "students",
              entity_id: s.id,
              created_at: s.created_at || new Date().toISOString(),
              actor_name: "Admissions Office",
              actor_role: "Registrar",
            });
          });

          (attRes.data || []).forEach((a: any) => {
            collected.push({
              id: `att-${a.id}`,
              school_id: schoolId,
              campus_id: null,
              user_id: null,
              event_name: "attendance.marked",
              title: "Class Attendance Logged",
              description: `Daily rollcall verified with status '${a.status || "present"}'.`,
              category: "attendance",
              entity_type: "attendance_entries",
              entity_id: a.id,
              created_at: a.created_at || new Date().toISOString(),
              actor_name: "Faculty Member",
              actor_role: "Teacher",
            });
          });

          (leadRes.data || []).forEach((l: any) => {
            collected.push({
              id: `lead-${l.id}`,
              school_id: schoolId,
              campus_id: null,
              user_id: null,
              event_name: "crm_lead.created",
              title: `Admission Inquiry: ${l.student_name || "Applicant"}`,
              description: `Inquiry recorded from parent ${l.parent_name || "Guardian"} (${l.phone || "Phone logged"}).`,
              category: "general",
              entity_type: "crm_leads",
              entity_id: l.id,
              created_at: l.created_at || new Date().toISOString(),
              actor_name: "Marketing Desk",
              actor_role: "Counselor",
            });
          });
        } catch {}
      }

      // Filter by category if selected
      let filtered = collected;
      if (category) {
        filtered = collected.filter((it) => it.category.toLowerCase() === category.toLowerCase());
      }

      // Deduplicate & sort
      const seen = new Set();
      const unique = filtered.filter((it) => {
        if (seen.has(it.id)) return false;
        seen.add(it.id);
        return true;
      });

      unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return {
        data: unique.slice(0, limit),
        total: unique.length,
      };
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  // Real-time listener: refresh queries when timeline changes
  const handleRealtimeChange = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["event_timeline"] });
  }, [queryClient]);

  useRealtimeTable({
    channel: "timeline_live_updates",
    table: "activity_timeline",
    enabled: !!userId,
    onChange: handleRealtimeChange,
  });

  useRealtimeTable({
    channel: "timeline_live_payments",
    table: "fee_payments",
    enabled: !!userId,
    onChange: handleRealtimeChange,
  });

  useRealtimeTable({
    channel: "timeline_live_students",
    table: "students",
    enabled: !!userId,
    onChange: handleRealtimeChange,
  });

  return {
    items: data?.data || [],
    total: data?.total || 0,
    isLoading,
    error,
  };
}
