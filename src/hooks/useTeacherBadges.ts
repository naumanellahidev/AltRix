import { useEffect, useState, useCallback } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useRealtimeTable } from "@/hooks/useRealtime";

interface TeacherBadges {
  unreadMessages: number;
  pendingAssignments: number;
  loading: boolean;
}

export function useTeacherBadges(schoolId: string | null, userId: string | null): TeacherBadges {
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingAssignments, setPendingAssignments] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchBadges = useCallback(async () => {
    if (!schoolId || !userId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      if (USE_FASTAPI) {
        const resp = await apiClient.get<{ unreadMessages: number; pendingAssignments: number }>("/teachers/badges", {
          params: { teacher_user_id: userId },
        });
        setUnreadMessages(resp.data.unreadMessages || 0);
        setPendingAssignments(resp.data.pendingAssignments || 0);
      } else {
        // Get unread parent messages
        const { count: msgCount } = await supabase
          .from("parent_messages")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("recipient_user_id", userId)
          .eq("is_read", false);

        setUnreadMessages(msgCount || 0);

        // Get teacher's assigned sections
        const { data: assignments } = await supabase
          .from("teacher_assignments")
          .select("class_section_id")
          .eq("school_id", schoolId)
          .eq("teacher_user_id", userId);

        const sectionIds = (assignments ?? [])
          .map((a: { class_section_id: string | null }) => a.class_section_id)
          .filter((id): id is string => Boolean(id));

        // Get pending assignments to grade
        let pending = 0;
        if (sectionIds.length > 0) {
          // Get assignment IDs for teacher's sections using filter
          const sectionFilter = sectionIds.map(id => `class_section_id.eq.${id}`).join(",");
          const { data: assignmentsList } = await supabase
            .from("assignments")
            .select("id")
            .eq("school_id", schoolId)
            .or(sectionFilter);

          const assignmentIds = (assignmentsList ?? []).map((a: { id: string }) => a.id);

          if (assignmentIds.length > 0) {
            // Count submissions per assignment to avoid deep type issues
            // Submissions without graded_at are considered pending
            for (const assignmentId of assignmentIds.slice(0, 20)) { // Limit to avoid too many queries
              const result = await supabase
                .from("assignment_submissions")
                .select("id", { count: "exact", head: true })
                .eq("assignment_id", assignmentId)
                .is("graded_at", null);

              pending += result.count || 0;
            }
          }
        }

        setPendingAssignments(pending);
      }
    } catch (err) {
      console.error("Error fetching teacher badges:", err);
    }
    
    setLoading(false);
  }, [schoolId, userId]);

  useEffect(() => {
    void fetchBadges();
  }, [fetchBadges]);

  // Realtime subscriptions
  useRealtimeTable({
    channel: `teacher-badges-messages-${schoolId}`,
    table: "parent_messages",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId && !!userId,
    onChange: () => void fetchBadges(),
  });

  useRealtimeTable({
    channel: `teacher-badges-submissions-${schoolId}`,
    table: "assignment_submissions",
    enabled: !!schoolId && !!userId,
    onChange: () => void fetchBadges(),
  });

  return { unreadMessages, pendingAssignments, loading };
}
