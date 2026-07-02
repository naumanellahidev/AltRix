import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
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

      // 1. Fetch via FastAPI if active
      if (USE_FASTAPI) {
        try {
          const res = await apiClient.get("/events/timeline", {
            params: {
              page,
              page_size: limit,
              category
            }
          });
          return {
            data: res.data.data as ActivityTimelineItem[],
            total: res.data.total as number
          };
        } catch (apiErr) {
          console.warn("Failed to fetch timeline from FastAPI, falling back to Supabase DB:", apiErr);
        }
      }

      // 2. Fetch via Supabase direct fallback
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id, campus_id, roles")
        .eq("id", userId)
        .single();

      if (!profile || !profile.school_id) return { data: [], total: 0 };

      let query = supabase
        .from("activity_timeline")
        .select("*", { count: "exact" })
        .eq("school_id", profile.school_id);

      if (category) {
        query = query.eq("category", category);
      }

      // Scope to campus if user is not a school-wide admin
      const isSchoolAdmin = profile.roles?.some((r: any) =>
        ["super_admin", "school_owner", "principal", "vice_principal"].includes(r.role)
      );

      if (profile.campus_id && !isSchoolAdmin) {
        query = query.eq("campus_id", profile.campus_id);
      }

      const { data: rows, count, error: dbErr } = await query
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (dbErr) throw dbErr;

      return {
        data: (rows || []) as ActivityTimelineItem[],
        total: count || 0
      };
    },
    enabled: !!userId,
  });

  // Real-time listener: refresh queries when timeline changes in the database
  const handleRealtimeChange = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["event_timeline"] });
  }, [queryClient]);

  useRealtimeTable({
    channel: "timeline_live_updates",
    table: "activity_timeline",
    enabled: !!userId,
    onChange: handleRealtimeChange
  });

  return {
    items: data?.data || [],
    total: data?.total || 0,
    isLoading,
    error
  };
}
