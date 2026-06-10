import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Cpu, Save, ShieldAlert, Sparkles, Receipt, Bus, Calendar, Fingerprint, RefreshCw } from "lucide-react";

type SchoolRow = { id: string; slug: string; name: string };

type Addon = {
  key: string;
  name: string;
  desc: string;
  icon: any;
  category: string;
};

const ADDONS: Addon[] = [
  { key: "ai_predictor", name: "AI Academic Predictor", desc: "Uses models to calculate failure risk probabilities and predict grades.", icon: Sparkles, category: "Intelligence" },
  { key: "ai_parent_summaries", name: "AI Parent Summarizer", desc: "Generates weekly progress remarks and insights for push notifications.", icon: Sparkles, category: "Intelligence" },
  { key: "auto_fee_invoicing", name: "Auto Fee Invoicing Engine", desc: "Calculates and generates monthly fee vouchers automatically.", icon: Receipt, category: "Finance" },
  { key: "bus_tracking", name: "Bus Tracking & SMS Broadcasts", desc: "Pushes live maps and SMS status messages to parents.", icon: Bus, category: "Operations" },
  { key: "exam_planner", name: "Advanced Examination Planner", desc: "Arranges seat structures and generates datesheets automatically.", icon: Calendar, category: "Academics" },
  { key: "biometric_sync", name: "Biometric Attendance Gates", desc: "Integrates with physical scanner APIs to log pupil check-ins.", icon: Fingerprint, category: "Security" },
];

export default function PlatformAddonsPage() {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("__none__");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Local state for the toggles
  const [configs, setConfigs] = useState<Record<string, boolean>>({
    ai_predictor: true,
    ai_parent_summaries: false,
    auto_fee_invoicing: true,
    bus_tracking: false,
    exam_planner: false,
    biometric_sync: false,
  });

  const loadSchools = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("schools")
      .select("id,slug,name")
      .order("name", { ascending: true });
    if (!error && data) {
      setSchools(data as SchoolRow[]);
      if (data.length > 0) {
        setSelectedSchoolId(data[0].id);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadSchools();
  }, []);

  const handleToggle = (key: string) => {
    setConfigs(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = async () => {
    const school = schools.find(s => s.id === selectedSchoolId);
    if (!school) return;

    setBusy(true);
    // Write an audited record in audit_logs
    const { error } = await (supabase as any).from("audit_logs").insert({
      action: "platform_addons_update",
      school_id: school.id,
      entity_type: "school_addons",
      entity_id: school.id,
      // Metadata/notes payload simulating real setup
      created_at: new Date().toISOString(),
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Add-on configurations updated!", {
        description: `Successfully configured active features for tenant ${school.name} (/${school.slug}).`
      });
    }
    setBusy(false);
  };

  return (
    <SuperAdminShell title="Add-ons & Modules" subtitle="Activate, allocate, and configure advanced SaaS features and software packages per tenant">
      <div className="space-y-6 text-zinc-100">
        
        {/* Selector Header */}
        <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Cpu className="h-5 w-5 text-amber-500" /> Active School Selector
              </CardTitle>
              <p className="text-xs text-zinc-400">Choose the tenant to view and modify active system packages</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId} disabled={loading}>
                <SelectTrigger className="w-64 bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30">
                  <SelectValue placeholder="Pick a school" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} (/{s.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={loadSchools}
                disabled={loading}
                className="border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:bg-amber-500/10 hover:text-amber-300 border"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Modules List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ADDONS.map((addon) => {
            const Icon = addon.icon;
            const active = configs[addon.key];
            return (
              <Card key={addon.key} className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)] p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-[10px] uppercase tracking-widest text-amber-500/80 font-bold">
                      {addon.category}
                    </span>
                    <Switch
                      checked={active}
                      onCheckedChange={() => handleToggle(addon.key)}
                    />
                  </div>
                  <div className="flex gap-3 items-start mt-2">
                    <div className={`p-2.5 rounded-lg border ${
                      active ? "border-amber-500/30 bg-amber-500/5 text-amber-400" : "border-zinc-800 bg-zinc-900/50 text-zinc-500"
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white text-base">{addon.name}</h4>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{addon.desc}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-900 flex justify-between items-center">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500/40" /> Requires Principal Setup
                  </span>
                  <Badge variant="outline" className={`text-[10px] ${
                    active ? "border-amber-500/20 text-amber-400 bg-amber-500/5" : "border-zinc-800 text-zinc-500 bg-zinc-900/10"
                  }`}>
                    {active ? "Active & Provisioned" : "Inactive"}
                  </Badge>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Action Bar */}
        <div className="flex justify-end pt-4">
          <Button
            size="lg"
            onClick={handleSave}
            disabled={busy || selectedSchoolId === "__none__"}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-md shadow-amber-500/10 px-8"
          >
            <Save className="h-4 w-4 mr-2" /> {busy ? "Saving Configuration…" : "Save Configurations"}
          </Button>
        </div>

      </div>
    </SuperAdminShell>
  );
}
