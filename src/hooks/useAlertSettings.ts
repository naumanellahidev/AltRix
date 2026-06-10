import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/components/ui/sonner";

export type AlertSettings = {
  school_id: string;
  attendance_warning_threshold: number;
  attendance_critical_threshold: number;
  pending_invoices_threshold: number;
  support_ticket_hours: number;
};

const DEFAULT_SETTINGS: Omit<AlertSettings, "school_id"> = {
  attendance_warning_threshold: 75,
  attendance_critical_threshold: 60,
  pending_invoices_threshold: 10,
  support_ticket_hours: 24,
};

export function useAlertSettings(schoolId: string | null) {
  const qc = useQueryClient();

  const queryKey = ["alert-settings", schoolId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!schoolId) return null;

      if (USE_FASTAPI) {
        const resp = await apiClient.get<AlertSettings>("/schools/alert-settings");
        return resp.data;
      } else {
        const { data, error } = await (supabase as any)
          .from("school_alert_settings")
          .select("*")
          .eq("school_id", schoolId)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          return {
            school_id: schoolId,
            ...DEFAULT_SETTINGS,
          } as AlertSettings;
        }

        return data as AlertSettings;
      }
    },
    enabled: !!schoolId,
  });

  const saveMutation = useMutation({
    mutationFn: async (settings: Partial<AlertSettings>) => {
      if (!schoolId) throw new Error("No school ID");

      const payload = {
        school_id: schoolId,
        attendance_warning_threshold: settings.attendance_warning_threshold ?? DEFAULT_SETTINGS.attendance_warning_threshold,
        attendance_critical_threshold: settings.attendance_critical_threshold ?? DEFAULT_SETTINGS.attendance_critical_threshold,
        pending_invoices_threshold: settings.pending_invoices_threshold ?? DEFAULT_SETTINGS.pending_invoices_threshold,
        support_ticket_hours: settings.support_ticket_hours ?? DEFAULT_SETTINGS.support_ticket_hours,
      };

      if (USE_FASTAPI) {
        await apiClient.post("/schools/alert-settings", payload);
      } else {
        const { error } = await (supabase as any)
          .from("school_alert_settings")
          .upsert(payload, { onConflict: "school_id" });

        if (error) throw error;
      }

      return payload;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Alert settings saved");
    },
    onError: (err: any) => {
      toast.error("Failed to save settings", { description: err.message });
    },
  });

  return {
    settings: data ?? { school_id: schoolId ?? "", ...DEFAULT_SETTINGS },
    isLoading,
    error,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
