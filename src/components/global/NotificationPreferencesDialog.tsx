import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useWebPush } from "@/hooks/useWebPush";
import { apiClient } from "@/lib/api-client";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Bell, 
  Smartphone, 
  Settings2, 
  FileText, 
  Award, 
  Calendar, 
  CreditCard, 
  Megaphone, 
  MessageSquare, 
  Loader2
} from "lucide-react";

interface NotificationPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES = [
  { id: "exams", label: "Exams & Datesheets", desc: "Schedules, datesheets, and admit cards", icon: FileText },
  { id: "grades", label: "Grades & Report Cards", desc: "Published reports and grading updates", icon: Award },
  { id: "attendance", label: "Attendance Alerts", desc: "Daily check-in and checkout notifications", icon: Calendar },
  { id: "billing", label: "Fees & Billing", desc: "Vouchers, invoices, and payment receipts", icon: CreditCard },
  { id: "notices", label: "School Notices", desc: "General campus circulars and announcements", icon: Megaphone },
  { id: "messages", label: "Direct Messages", desc: "Private student/parent/teacher messages", icon: MessageSquare },
  { id: "general", label: "General Updates", desc: "Miscellaneous platform updates and logs", icon: Bell },
];

export default function NotificationPreferencesDialog({ open, onOpenChange }: NotificationPreferencesDialogProps) {
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe, loading: pushLoading } = useWebPush();
  const [preferences, setPreferences] = useState<Record<string, { in_app: boolean; push: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load preferences from backend
  useEffect(() => {
    if (!open) return;

    const loadPrefs = async () => {
      setLoading(true);
      try {
        if (USE_FASTAPI) {
          const res = await apiClient.get("/notifications/preferences");
          if (res.data && res.data.preferences) {
            setPreferences(res.data.preferences);
          }
        } else {
          // Supabase Fallback
          const { data, error } = await supabase
            .from("user_notification_preferences")
            .select("preferences")
            .single();
          
          if (error) {
            if (error.code === "PGRST116") {
              // No row found: default to empty/default settings
              setPreferences({});
            } else {
              throw error;
            }
          } else if (data && data.preferences) {
            setPreferences(data.preferences as any);
          }
        }
      } catch (e) {
        console.error("Failed to load preferences:", e);
        toast.error("Failed to load notification settings.");
      } finally {
        setLoading(false);
      }
    };

    void loadPrefs();
  }, [open]);

  const handleToggle = (categoryId: string, channel: "in_app" | "push", checked: boolean) => {
    setPreferences(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        [channel]: checked
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (USE_FASTAPI) {
        await apiClient.put("/notifications/preferences", { preferences });
      } else {
        // Supabase Fallback
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) throw new Error("No authenticated user session");

        // Resolve school_id from localStorage scan
        let schoolId: string | null = null;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith("eduverse_tenant_basic_") || key.startsWith("eduverse_tenant_"))) {
            const item = localStorage.getItem(key);
            if (item) {
              const parsed = JSON.parse(item);
              if (parsed?.data?.id) {
                schoolId = parsed.data.id;
                break;
              }
            }
          }
        }

        const { error } = await supabase
          .from("user_notification_preferences")
          .upsert({
            user_id: user.id,
            school_id: schoolId || undefined,
            preferences,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id" });

        if (error) throw error;
      }
      toast.success("Notification preferences saved successfully!");
      onOpenChange(false);
    } catch (e) {
      console.error("Failed to save preferences:", e);
      toast.error("Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full border-slate-100 shadow-xl rounded-3xl bg-white p-6 overflow-hidden">
        <DialogHeader className="pb-4 border-b border-slate-100">
          <DialogTitle className="flex items-center gap-2 font-display text-xl font-bold text-slate-800">
            <Settings2 className="h-5 w-5 text-blue-500" />
            Notification Preferences
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-450 mt-1">
            Choose what notifications you want to receive and how you want them delivered.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-xs font-semibold text-slate-500">Loading settings...</p>
          </div>
        ) : (
          <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto pr-1">
            {/* Native Web Push Device Status */}
            {isSupported && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
                    <Smartphone className="h-4 w-4 text-slate-550" />
                    PWA Push Notifications (This Device)
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {isSubscribed 
                      ? "This device is registered to receive browser push alerts."
                      : permission === "denied" 
                        ? "Notification permission is blocked. Reset browser site permissions to enable."
                        : "Enable OS-level alerts when the app is in the background."}
                  </p>
                </div>
                <Button 
                  variant={isSubscribed ? "outline" : "default"}
                  size="sm"
                  onClick={isSubscribed ? unsubscribe : subscribe}
                  disabled={pushLoading || permission === "denied"}
                  className="rounded-xl shrink-0 gap-1 font-bold text-xs"
                >
                  {pushLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  {isSubscribed ? "Disable Push Alerts" : "Enable Push Alerts"}
                </Button>
              </div>
            )}

            {/* Category Prefs Grid */}
            <div className="space-y-4">
              <div className="grid grid-cols-12 text-slate-400 font-bold uppercase tracking-wider text-[10px] pb-2 border-b border-slate-100">
                <div className="col-span-8">Category</div>
                <div className="col-span-2 text-center">In-App</div>
                <div className="col-span-2 text-center">PWA Push</div>
              </div>

              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const inAppVal = preferences[cat.id]?.in_app ?? true;
                const pushVal = preferences[cat.id]?.push ?? true;

                return (
                  <div key={cat.id} className="grid grid-cols-12 items-center py-2.5 hover:bg-slate-50/50 px-2 rounded-xl transition-colors">
                    <div className="col-span-8 flex items-start gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-slate-500 shrink-0">
                        <Icon className="h-4 w-4 text-slate-650" />
                      </div>
                      <div>
                        <h5 className="text-xs font-semibold text-slate-800 leading-tight">{cat.label}</h5>
                        <p className="text-[10px] text-slate-455 mt-0.5">{cat.desc}</p>
                      </div>
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <Switch 
                        checked={inAppVal}
                        onCheckedChange={(checked) => handleToggle(cat.id, "in_app", checked)}
                      />
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <Switch 
                        checked={pushVal}
                        disabled={!isSubscribed}
                        onCheckedChange={(checked) => handleToggle(cat.id, "push", checked)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="pt-4 border-t border-slate-100 gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl font-bold bg-blue-500 hover:bg-blue-600">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
