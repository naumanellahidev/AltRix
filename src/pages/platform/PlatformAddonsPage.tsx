import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
    const { data, error } = await api
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
      const session = await api.auth.getSession();
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
      <div className="space-y-6 text-slate-900">
        
        {/* Tenant Selector & Bulk Controls Header */}
        <Card className="bg-white border-slate-200 shadow-md">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2.5">
                <Cpu className="h-5 w-5 text-blue-600" /> Active School Feature Matrix Hub
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1 font-medium">Select a tenant campus to view and configure all 14 SaaS feature modules</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId} disabled={loading || schools.length === 0}>
                <SelectTrigger className="w-[280px] bg-slate-50 border-slate-200 text-blue-900 font-bold focus:ring-blue-500/30">
                  <SelectValue placeholder={loading ? "Loading campuses..." : "Select Campus Tenant"} />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800">
                  {schools.map(s => (
                    <SelectItem key={s.id} value={s.id} className="focus:bg-blue-50 focus:text-blue-900 font-medium">
                      {s.name} <span className="text-xs text-slate-400 font-mono">({s.slug})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkToggle(true)}
                className="bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-bold"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Enable All
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkToggle(false)}
                className="bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100 font-bold"
              >
                <XCircle className="h-4 w-4 mr-1.5" /> Disable All
              </Button>

              <Button
                onClick={handleSave}
                disabled={busy || selectedSchoolId === "__none__"}
                className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-indigo-500 text-slate-900 font-black shadow-md shadow-blue-500/20 border-0"
              >
                <Save className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} /> Save Feature Matrix
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-xs text-slate-600 font-mono bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              <span className="flex items-center gap-2 font-sans font-medium">
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                Active Campus: <strong className="text-slate-900 font-bold">{schools.find(s => s.id === selectedSchoolId)?.name || "None Selected"}</strong>
              </span>
              <span className="font-bold text-blue-800">14 Modules Registered</span>
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
                className={`transition-all duration-300 border ${
                  isEnabled 
                    ? "bg-white border-blue-300 shadow-md shadow-blue-500/5" 
                    : "bg-slate-50/70 border-slate-200 opacity-75 hover:opacity-100"
                }`}
              >
                <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl border ${
                      isEnabled 
                        ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm" 
                        : "bg-slate-100 border-slate-200 text-slate-400"
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-slate-900">{addon.name}</CardTitle>
                      <Badge variant="outline" className={`mt-1 text-[10px] uppercase font-mono ${
                        isEnabled ? "bg-blue-50 text-blue-800 border-blue-200 font-bold" : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}>
                        {addon.category}
                      </Badge>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => handleToggle(addon.key)}
                    className="data-[state=checked]:bg-blue-600"
                  />
                </CardHeader>
                <CardContent className="pt-2">
                  <p className="text-xs text-slate-600 leading-relaxed font-sans font-medium min-h-[36px]">
                    {addon.desc}
                  </p>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400 font-medium">Module Status:</span>
                    <span className={`font-bold ${isEnabled ? "text-emerald-700" : "text-rose-600"}`}>
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
