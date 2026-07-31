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
import {
  Cpu,
  Save,
  Sparkles,
  Bus,
  BookOpen,
  Smartphone,
  FileText,
  RefreshCw,
  HeartPulse,
  PackageCheck,
  GraduationCap,
  Globe,
  Home,
  Award,
  Grid,
  Shield,
  Languages,
  CheckCircle2,
  XCircle,
} from "lucide-react";

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
  | "public_admissions_enabled"
  | "hostel_enabled"
  | "appraisals_enabled"
  | "seating_plan_enabled"
  | "white_label_enabled"
  | "multilang_enabled";

type Addon = {
  key: AddonKey;
  name: string;
  desc: string;
  icon: any;
  category: string;
};

const ADDONS: Addon[] = [
  { key: "transport_enabled", name: "Bus Tracking & Transport System", desc: "Fleet management, route sequence builder, and parent live GPS tracking.", icon: Bus, category: "Operations" },
  { key: "library_enabled", name: "Library Management System", desc: "Book catalog, loans processing, barcode scanning, and fine calculations.", icon: BookOpen, category: "Academics" },
  { key: "parent_app_enabled", name: "Enhanced Parent Mobile App", desc: "Mobile PWA feed, fee voucher checkout, PTM slot booking, and child updates.", icon: Smartphone, category: "Experience" },
  { key: "document_cert_enabled", name: "Document Vault & Certificate Engine", desc: "Transfer/Character Certificate generator with public QR verification.", icon: FileText, category: "Governance" },
  { key: "ai_features_enabled", name: "AI Intelligence & Copilot Engine", desc: "Enables AI early warnings, student academic predictions, and copilot assistant.", icon: Sparkles, category: "Intelligence" },
  { key: "wellbeing_enabled", name: "Student Health & Infirmary Desk", desc: "Infirmary visit logs, vaccination records, allergy alerts, and emergency contact desk.", icon: HeartPulse, category: "Operations" },
  { key: "inventory_enabled", name: "Asset & School Inventory Management", desc: "IT hardware, lab gear, and furniture stock tracking with reorder threshold alerts.", icon: PackageCheck, category: "Operations" },
  { key: "alumni_enabled", name: "Alumni Network & Placement Portal", desc: "Searchable alumni directory, reunion events, and scholarship contribution ledger.", icon: GraduationCap, category: "Community" },
  { key: "public_admissions_enabled", name: "Public Online Admissions Portal", desc: "External applicant landing page, online document submission, and application tracking.", icon: Globe, category: "Marketing" },
  { key: "hostel_enabled", name: "Hostel & Boarding Facility Management", desc: "Room allocation grid, nightly boarding attendance, mess meal menu scheduling.", icon: Home, category: "Operations" },
  { key: "appraisals_enabled", name: "Staff Appraisal & 360° KPI System", desc: "Teacher self-appraisals, Principal reviews, and 360 anonymous student ratings.", icon: Award, category: "Governance" },
  { key: "seating_plan_enabled", name: "Exam Hall Seating Plan Generator", desc: "Auto-generator ensuring non-adjacent seating per class, room capacity, invigilator duties.", icon: Grid, category: "Academics" },
  { key: "white_label_enabled", name: "Full White-Label & Custom Domain Engine", desc: "Custom SMTP sending, white-label branding, custom splash screens, and brand color theme.", icon: Shield, category: "Enterprise" },
  { key: "multilang_enabled", name: "Multi-Language & RTL Layout Engine", desc: "Urdu (ur) + English (en) localization with automatic right-to-left layout switching.", icon: Languages, category: "Localization" },
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
    hostel_enabled: true,
    appraisals_enabled: true,
    seating_plan_enabled: true,
    white_label_enabled: true,
    multilang_enabled: true,
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
          hostel_enabled: res.data.hostel_enabled ?? true,
          appraisals_enabled: res.data.appraisals_enabled ?? true,
          seating_plan_enabled: res.data.seating_plan_enabled ?? true,
          white_label_enabled: res.data.white_label_enabled ?? true,
          multilang_enabled: res.data.multilang_enabled ?? true,
        });
      }
    } catch {
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
        hostel_enabled: true,
        appraisals_enabled: true,
        seating_plan_enabled: true,
        white_label_enabled: true,
        multilang_enabled: true,
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

  const handleBulkToggle = (status: boolean) => {
    const updated: Record<AddonKey, boolean> = { ...flags };
    ADDONS.forEach(a => {
      updated[a.key] = status;
    });
    setFlags(updated);
    toast.info(status ? "All 14 SaaS feature modules set to Enabled" : "All 14 SaaS feature modules set to Disabled");
  };

  const handleSave = async () => {
    const school = schools.find(s => s.id === selectedSchoolId);
    if (!school) return;

    setBusy(true);
    try {
      await apiClient.patch(`/feature-flags/${school.id}`, flags);
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || "";
      await apiClient.post(
        `/ai/settings/school/${school.id}`,
        { enabled: flags.ai_features_enabled },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      ).catch(() => {});

      toast.success("14-Module Feature Flags Saved!", {
        description: `Updated module permissions & AI Copilot settings for tenant ${school.name} (/${school.slug}).`
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to update feature flags");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SuperAdminShell
      title="06. Feature Flag Matrix & Add-On Control"
      subtitle="14-Module SaaS feature toggle matrix per tenant fleet with 1-click bulk master switches"
    >
      <div className="space-y-6 text-zinc-100">
        
        {/* Tenant Selector & Bulk Controls Header */}
        <Card className="bg-zinc-950/80 border-cyan-500/20 backdrop-blur-xl shadow-xl">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-900 pb-5">
            <div>
              <CardTitle className="text-lg font-black text-white flex items-center gap-2.5">
                <Cpu className="h-5 w-5 text-cyan-400" /> Active School Feature Matrix Hub
              </CardTitle>
              <p className="text-xs text-zinc-400 mt-1">Select a tenant campus to view and configure all 14 SaaS feature modules</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId} disabled={loading || schools.length === 0}>
                <SelectTrigger className="w-[280px] bg-zinc-900 border-zinc-800 text-cyan-300 font-bold focus:ring-cyan-500/30">
                  <SelectValue placeholder={loading ? "Loading campuses..." : "Select Campus Tenant"} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-200">
                  {schools.map(s => (
                    <SelectItem key={s.id} value={s.id} className="focus:bg-cyan-500/10 focus:text-cyan-300 font-medium">
                      {s.name} <span className="text-xs text-zinc-500 font-mono">({s.slug})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkToggle(true)}
                className="bg-emerald-950/30 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 font-bold"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Enable All
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkToggle(false)}
                className="bg-rose-950/30 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 font-bold"
              >
                <XCircle className="h-4 w-4 mr-1.5" /> Disable All
              </Button>

              <Button
                onClick={handleSave}
                disabled={busy || selectedSchoolId === "__none__"}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-zinc-950 font-black shadow-lg shadow-cyan-500/20 border border-cyan-400/30"
              >
                <Save className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} /> Save Feature Matrix
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/80">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                Active Campus: <strong className="text-white font-sans">{schools.find(s => s.id === selectedSchoolId)?.name || "None Selected"}</strong>
              </span>
              <span>14 Modules Registered</span>
            </div>
          </CardContent>
        </Card>

        {/* 14-Module Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {ADDONS.map((addon) => {
            const Icon = addon.icon;
            const isEnabled = flags[addon.key];
            return (
              <Card 
                key={addon.key} 
                className={`transition-all duration-300 border backdrop-blur-xl ${
                  isEnabled 
                    ? "bg-zinc-900/70 border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.08)]" 
                    : "bg-zinc-950/50 border-zinc-900 opacity-70 hover:opacity-100"
                }`}
              >
                <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl border ${
                      isEnabled 
                        ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]" 
                        : "bg-zinc-900 border-zinc-800 text-zinc-500"
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-white">{addon.name}</CardTitle>
                      <Badge variant="outline" className={`mt-1 text-[10px] uppercase font-mono ${
                        isEnabled ? "bg-cyan-950/40 text-cyan-400 border-cyan-500/30" : "bg-zinc-900 text-zinc-500 border-zinc-800"
                      }`}>
                        {addon.category}
                      </Badge>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => handleToggle(addon.key)}
                    className="data-[state=checked]:bg-cyan-500"
                  />
                </CardHeader>
                <CardContent className="pt-2">
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans min-h-[36px]">
                    {addon.desc}
                  </p>
                  <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-zinc-500">Module Status:</span>
                    <span className={`font-bold ${isEnabled ? "text-emerald-400" : "text-rose-400"}`}>
                      {isEnabled ? "ENABLED FOR TENANT" : "DISABLED"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

      </div>
    </SuperAdminShell>
  );
}
