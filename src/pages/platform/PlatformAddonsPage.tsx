import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Cpu, Save, ShieldAlert, Sparkles, Bus, BookOpen, Smartphone, FileText, RefreshCw, HeartPulse, PackageCheck, GraduationCap, Globe } from "lucide-react";

type SchoolRow = { id: string; slug: string; name: string };

type AddonKey =
  | "transport_enabled"
  | "library_enabled"
  | "parent_app_enabled"
  | "document_cert_enabled"
  | "ai_features_enabled"
  | "wellbeing_enabled"
  | "inventory_enabled"
  | "alumni_enabled"
  | "public_admissions_enabled";

type Addon = {
  key: AddonKey;
  name: string;
  desc: string;
  icon: any;
  category: string;
};

const ADDONS: Addon[] = [
  { key: "transport_enabled", name: "Bus Tracking & Transport System", desc: "Enables fleet management, route sequence builder, and parent live GPS tracking.", icon: Bus, category: "Operations" },
  { key: "library_enabled", name: "Library Management System", desc: "Catalog books, process student/staff loans, barcode scanning, and calculate overdue fines.", icon: BookOpen, category: "Academics" },
  { key: "parent_app_enabled", name: "Enhanced Parent Mobile App", desc: "Mobile-optimized PWA feed with fee voucher checkout, PTM slot booking, and child updates.", icon: Smartphone, category: "Experience" },
  { key: "document_cert_enabled", name: "Document Vault & Certificate Engine", desc: "Document storage, Transfer/Character Certificate generator with public QR verification.", icon: FileText, category: "Governance" },
  { key: "ai_features_enabled", name: "AI Intelligence & Copilot Engine", desc: "Enables AI early warnings, student academic predictions, and intelligent assistance.", icon: Sparkles, category: "Intelligence" },
  { key: "wellbeing_enabled", name: "Student Health & Infirmary Desk", desc: "Clinic visit tracking, vaccination records, allergy alerts, and emergency parent notifications.", icon: HeartPulse, category: "Operations" },
  { key: "inventory_enabled", name: "Asset & School Inventory Management", desc: "IT hardware, lab gear, and furniture stock tracking with reorder alerts.", icon: PackageCheck, category: "Operations" },
  { key: "alumni_enabled", name: "Alumni Network & Placement Portal", desc: "Searchable alumni directory, reunion event management, and scholarship contribution ledger.", icon: GraduationCap, category: "Community" },
  { key: "public_admissions_enabled", name: "Public Online Admissions Portal", desc: "External applicant landing page, online document submission, and public status tracking.", icon: Globe, category: "Marketing" },
];

export default function PlatformAddonsPage() {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("__none__");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Local state for the feature flag toggles
  const [flags, setFlags] = useState<Record<AddonKey, boolean>>({
    transport_enabled: true,
    library_enabled: true,
    parent_app_enabled: true,
    document_cert_enabled: true,
    ai_features_enabled: true,
    wellbeing_enabled: true,
    inventory_enabled: true,
    alumni_enabled: true,
    public_admissions_enabled: true,
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

  const loadFlags = async (schoolId: string) => {
    if (!schoolId || schoolId === "__none__") return;
    try {
      const res = await apiClient.get(`/feature-flags/${schoolId}`);
      if (res.data) {
        setFlags({
          transport_enabled: res.data.transport_enabled ?? true,
          library_enabled: res.data.library_enabled ?? true,
          parent_app_enabled: res.data.parent_app_enabled ?? true,
          document_cert_enabled: res.data.document_cert_enabled ?? true,
          ai_features_enabled: res.data.ai_features_enabled ?? true,
          wellbeing_enabled: res.data.wellbeing_enabled ?? true,
          inventory_enabled: res.data.inventory_enabled ?? true,
          alumni_enabled: res.data.alumni_enabled ?? true,
          public_admissions_enabled: res.data.public_admissions_enabled ?? true,
        });
      }
    } catch (e) {
      // Fallback defaults
      setFlags({
        transport_enabled: true,
        library_enabled: true,
        parent_app_enabled: true,
        document_cert_enabled: true,
        ai_features_enabled: true,
        wellbeing_enabled: true,
        inventory_enabled: true,
        alumni_enabled: true,
        public_admissions_enabled: true,
      });
    }
  };

  useEffect(() => {
    void loadSchools();
  }, []);

  useEffect(() => {
    if (selectedSchoolId !== "__none__") {
      void loadFlags(selectedSchoolId);
    }
  }, [selectedSchoolId]);

  const handleToggle = (key: AddonKey) => {
    setFlags(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = async () => {
    const school = schools.find(s => s.id === selectedSchoolId);
    if (!school) return;

    setBusy(true);
    try {
      await apiClient.patch(`/feature-flags/${school.id}`, flags);
      toast.success("Add-on configurations updated!", {
        description: `Successfully configured feature flags for tenant ${school.name} (/${school.slug}).`
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to update feature flags");
    } finally {
      setBusy(false);
    }
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
                onClick={() => { loadSchools(); if (selectedSchoolId !== "__none__") loadFlags(selectedSchoolId); }}
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
            const active = flags[addon.key];
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
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500/40" /> Tenant Feature Flag Toggle
                  </span>
                  <Badge variant="outline" className={`text-[10px] ${
                    active ? "border-amber-500/20 text-amber-400 bg-amber-500/5" : "border-zinc-800 text-zinc-500 bg-zinc-900/10"
                  }`}>
                    {active ? "Active & Enabled" : "Disabled by Admin"}
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
            <Save className="h-4 w-4 mr-2" /> {busy ? "Saving Configuration…" : "Save Feature Flags"}
          </Button>
        </div>

      </div>
    </SuperAdminShell>
  );
}

