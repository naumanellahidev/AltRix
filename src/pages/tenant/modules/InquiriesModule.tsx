import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  UserPlus, Search, Sliders, BarChart3, Inbox, Trash2, Edit, 
  ExternalLink, Copy, Check, Plus, Loader2, Sparkles, Mail, 
  Phone, Calendar, User, FileText, TrendingUp, HelpCircle, School 
} from "lucide-react";
import { usePermissions } from "@/lib/permissions";

type InquirySettings = {
  id?: string;
  school_id: string;
  form_title: string;
  show_logo: boolean;
  success_message: string;
  accent_color: string;
  fields_config: {
    parentName: boolean;
    email: boolean;
    phone: boolean;
    studentName: boolean;
    studentGrade: boolean;
    priorSchool: boolean;
    message: boolean;
  };
  required_config: {
    email: boolean;
    phone: boolean;
    studentName: boolean;
    studentGrade: boolean;
  };
};

type Lead = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string; // open, contacted, qualified, converted, lost
  score: number;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  counselor_name?: string;
};

type Counselor = {
  id: string;
  display_name: string;
};

const DEFAULT_SETTINGS = (schoolId: string): InquirySettings => ({
  school_id: schoolId,
  form_title: "Admissions & Inquiry Form",
  show_logo: true,
  success_message: "Thank you for inquiring! Our admissions counselor will get in touch with you shortly.",
  accent_color: "#3b82f6",
  fields_config: {
    parentName: true,
    email: true,
    phone: true,
    studentName: true,
    studentGrade: true,
    priorSchool: true,
    message: true,
  },
  required_config: {
    email: true,
    phone: true,
    studentName: true,
    studentGrade: false,
  },
});

export function InquiriesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const schoolLogo = useMemo(() => (tenant.status === "ready" ? tenant.logoUrl : null), [tenant.status, tenant.logoUrl]);
  const schoolName = useMemo(() => (tenant.status === "ready" ? tenant.name : "Our School"), [tenant.status, tenant.name]);

  const perms = usePermissions(schoolId);
  const canManage = useMemo(() => {
    return perms.roles.some(r => ["super_admin", "school_owner", "principal", "vice_principal", "school_admin"].includes(r));
  }, [perms.roles]);

  const [settings, setSettings] = useState<InquirySettings | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedSource, setSelectedSource] = useState("all");

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newLead, setNewLead] = useState({
    full_name: "",
    email: "",
    phone: "",
    source: "Walk-in",
    notes: "",
    score: 5,
  });
  const [creatingLead, setCreatingLead] = useState(false);

  // Edit Modal State
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [savingLead, setSavingLead] = useState(false);

  // Load configuration & inquiries
  const loadData = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      // 1. Load settings
      const { data: settingsData, error: settingsErr } = await supabase
        .from("school_inquiry_settings")
        .select("*")
        .eq("school_id", schoolId)
        .maybeSingle();

      if (settingsErr) throw settingsErr;
      setSettings(settingsData ? (settingsData as any) : DEFAULT_SETTINGS(schoolId));

      // 2. Load CRM leads (inquiries)
      const { data: leadsData, error: leadsErr } = await supabase
        .from("crm_leads")
        .select("*")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });

      if (leadsErr) throw leadsErr;

      // 3. Load active counselors / staff members
      const { data: counselorData } = await supabase
        .from("user_roles")
        .select("user_id, profiles(full_name)")
        .eq("school_id", schoolId)
        .in("role", ["counselor", "principal", "vice_principal", "school_admin"]);

      const mappedCounselors: Counselor[] = (counselorData || [])
        .map(c => ({
          id: c.user_id,
          display_name: (c.profiles as any)?.full_name || "Staff Member",
        }));
      setCounselors(mappedCounselors);

      // Map counselor names to leads
      const counselorMap = new Map(mappedCounselors.map(c => [c.id, c.display_name]));
      const mappedLeads: Lead[] = (leadsData || []).map((l: any) => ({
        ...l,
        counselor_name: l.assigned_to ? counselorMap.get(l.assigned_to) || "Assigned" : "Unassigned",
      }));
      setLeads(mappedLeads);
    } catch (err: any) {
      toast.error("Failed to load admissions inquiries: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (schoolId) {
      loadData();
    }
  }, [schoolId]);

  // Real-time synchronization subscriptions
  useEffect(() => {
    if (!schoolId) return;

    // Realtime channel for settings
    const settingsChannel = supabase
      .channel("inquiry-settings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "school_inquiry_settings", filter: `school_id=eq.${schoolId}` },
        (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            setSettings(payload.new as any);
            toast.info("Inquiry form setup updated in real-time", { id: "realtime-inquiry-settings" });
          }
        }
      )
      .subscribe();

    // Realtime channel for leads
    const leadsChannel = supabase
      .channel("crm-leads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_leads", filter: `school_id=eq.${schoolId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            toast.success("New admissions inquiry received!", { duration: 5000 });
          }
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(leadsChannel);
    };
  }, [schoolId]);

  // Save Settings
  const saveSettings = async (updatedSettings: InquirySettings) => {
    if (!schoolId) return;
    setSavingSettings(true);
    try {
      const payload = {
        ...updatedSettings,
        updated_at: new Date().toISOString(),
      };

      let err = null;
      if (updatedSettings.id) {
        const { error } = await supabase
          .from("school_inquiry_settings")
          .update(payload)
          .eq("id", updatedSettings.id);
        err = error;
      } else {
        const { error } = await supabase
          .from("school_inquiry_settings")
          .insert(payload);
        err = error;
      }

      if (err) throw err;
      setSettings(updatedSettings);
      toast.success("Inquiry Form branding setup saved & synchronized!");
      loadData();
    } catch (err: any) {
      toast.error("Failed to save settings: " + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Create Manual Lead
  const handleCreateLead = async () => {
    if (!schoolId) return;
    if (!newLead.full_name.trim()) {
      toast.error("Contact name is required");
      return;
    }
    setCreatingLead(true);
    try {
      const { error } = await supabase
        .from("crm_leads")
        .insert({
          school_id: schoolId,
          full_name: newLead.full_name.trim(),
          email: newLead.email.trim() || null,
          phone: newLead.phone.trim() || null,
          source: newLead.source,
          notes: newLead.notes.trim() || null,
          score: newLead.score,
          status: "open",
        });

      if (error) throw error;
      toast.success("Admissions inquiry manually logged!");
      setIsCreateOpen(false);
      setNewLead({
        full_name: "",
        email: "",
        phone: "",
        source: "Walk-in",
        notes: "",
        score: 5,
      });
      loadData();
    } catch (err: any) {
      toast.error("Failed to log inquiry: " + err.message);
    } finally {
      setCreatingLead(false);
    }
  };

  // Save Lead details
  const handleSaveLead = async () => {
    if (!editingLead || !schoolId) return;
    setSavingLead(true);
    try {
      const { error } = await supabase
        .from("crm_leads")
        .update({
          full_name: editingLead.full_name,
          email: editingLead.email || null,
          phone: editingLead.phone || null,
          source: editingLead.source,
          status: editingLead.status,
          score: editingLead.score,
          notes: editingLead.notes || null,
          assigned_to: editingLead.assigned_to === "unassigned" ? null : editingLead.assigned_to,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingLead.id);

      if (error) throw error;
      toast.success("Inquiry details updated successfully!");
      setIsEditOpen(false);
      loadData();
    } catch (err: any) {
      toast.error("Failed to update details: " + err.message);
    } finally {
      setSavingLead(false);
    }
  };

  // Delete Lead
  const handleDeleteLead = async (id: string) => {
    if (!confirm("Are you sure you want to delete this admissions lead/inquiry?")) return;
    try {
      const { error } = await supabase
        .from("crm_leads")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Inquiry deleted successfully.");
      loadData();
    } catch (err: any) {
      toast.error("Failed to delete inquiry: " + err.message);
    }
  };

  // Copy Link
  const handleCopyLink = () => {
    const link = `${window.location.origin}/${schoolSlug}/inquiry`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Public Form link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  // Filters & Search logic
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const name = lead.full_name.toLowerCase();
      const notes = (lead.notes || "").toLowerCase();
      const email = (lead.email || "").toLowerCase();
      const phone = (lead.phone || "").toLowerCase();
      const search = searchQuery.toLowerCase();

      const matchesSearch = name.includes(search) || notes.includes(search) || email.includes(search) || phone.includes(search);
      const matchesStatus = selectedStatus === "all" || lead.status === selectedStatus;
      const matchesSource = selectedSource === "all" || lead.source === selectedSource;

      return matchesSearch && matchesStatus && matchesSource;
    });
  }, [leads, searchQuery, selectedStatus, selectedSource]);

  // Analytics Calculations
  const stats = useMemo(() => {
    const total = leads.length;
    const active = leads.filter(l => ["open", "contacted", "qualified"].includes(l.status)).length;
    const enrolled = leads.filter(l => l.status === "converted").length;
    const lost = leads.filter(l => l.status === "lost").length;

    const conversionRate = total > 0 ? Math.round((enrolled / total) * 100) : 0;
    const lostRate = total > 0 ? Math.round((lost / total) * 100) : 0;

    // Sources breakdown
    const sources: Record<string, number> = {};
    leads.forEach(l => {
      const s = l.source || "Unknown";
      sources[s] = (sources[s] || 0) + 1;
    });

    // Status breakdown
    const statusMap: Record<string, number> = {
      open: 0,
      contacted: 0,
      qualified: 0,
      converted: 0,
      lost: 0,
    };
    leads.forEach(l => {
      if (l.status in statusMap) statusMap[l.status]++;
    });

    return {
      total,
      active,
      enrolled,
      conversionRate,
      lostRate,
      sources: Object.entries(sources).map(([name, count]) => ({ name, count })),
      statusMap,
    };
  }, [leads]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-primary/20 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-primary tracking-tight flex items-center gap-2">
            <Inbox className="h-8 w-8 text-primary" />
            Admissions Inquiry Center
          </h1>
          <p className="text-muted-foreground text-sm">
            Track inquiries, update conversion pipelines, configure the public intake form, and sync data in real-time.
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline"
            className="flex items-center gap-2 border-primary/20 text-primary hover:bg-primary/5"
            onClick={loadData}
          >
            Refresh
          </Button>
          <Button 
            className="bg-primary hover:bg-primary/95 text-white flex items-center gap-2"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Log Inquiry
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-[60vh] flex flex-col justify-center items-center gap-2">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm font-medium">Loading Inquiries Workspace...</p>
        </div>
      ) : (
        <Tabs defaultValue="inbox" className="w-full">
          <TabsList className="bg-muted/40 p-1 rounded-xl mb-6">
            <TabsTrigger value="inbox" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">
              <Inbox className="h-4 w-4 mr-2" />
              Inquiry Inbox ({filteredLeads.length})
            </TabsTrigger>
            <TabsTrigger value="setup" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">
              <Sliders className="h-4 w-4 mr-2" />
              Public Intake Setup
            </TabsTrigger>
            <TabsTrigger value="analytics" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics & Conversion
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: INBOX */}
          <TabsContent value="inbox" className="space-y-6">
            {/* Search and Filters */}
            <Card className="border-primary/10 shadow-sm bg-white">
              <CardContent className="p-4 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by parent/child name, email or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 border-primary/20 focus-visible:ring-primary"
                  />
                </div>
                
                <div className="w-full md:w-48">
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="border-primary/20">
                      <SelectValue placeholder="Filter by Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="open">New / Open</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="converted">Enrolled</SelectItem>
                      <SelectItem value="lost">Lost / Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full md:w-48">
                  <Select value={selectedSource} onValueChange={setSelectedSource}>
                    <SelectTrigger className="border-primary/20">
                      <SelectValue placeholder="Filter by Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="Website Inquiry Form">Website</SelectItem>
                      <SelectItem value="Walk-in">Walk-in</SelectItem>
                      <SelectItem value="Phone call">Phone Call</SelectItem>
                      <SelectItem value="Reference">Reference</SelectItem>
                      <SelectItem value="Social Media">Social Media</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Leads Table */}
            <Card className="border-primary/10 shadow-sm overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-muted/10 border-b border-border/40 text-primary text-xs font-semibold uppercase tracking-wider">
                      <th className="px-6 py-4">Parent Name</th>
                      <th className="px-6 py-4">Contact Info</th>
                      <th className="px-6 py-4">Details / Message</th>
                      <th className="px-6 py-4">Source</th>
                      <th className="px-6 py-4">Score</th>
                      <th className="px-6 py-4">Assignee</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                          No inquiries found matching selected filters.
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => {
                        const statusColors: Record<string, string> = {
                          open: "bg-primary/10 text-primary border-primary/20",
                          contacted: "bg-amber-50 text-amber-700 border-amber-100",
                          qualified: "bg-indigo-50 text-indigo-700 border-indigo-100",
                          converted: "bg-green-50 text-green-700 border-green-100",
                          lost: "bg-slate-50 text-slate-600 border-slate-100",
                        };

                        return (
                          <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-semibold text-slate-900">
                              {lead.full_name}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-0.5 text-xs text-slate-600">
                                {lead.email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3 text-slate-400" />
                                    {lead.email}
                                  </span>
                                )}
                                {lead.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3 text-slate-400" />
                                    {lead.phone}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 max-w-xs truncate text-xs text-slate-600">
                              {lead.notes || "—"}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-600">
                              {lead.source || "Unknown"}
                            </td>
                            <td className="px-6 py-4">
                              <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded text-xs">
                                {lead.score} / 10
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs font-medium text-slate-700">
                              {lead.counselor_name}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold uppercase ${statusColors[lead.status] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                                {lead.status === "converted" ? "Enrolled" : lead.status === "lost" ? "Lost" : lead.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-500 hover:text-primary hover:bg-slate-100"
                                  onClick={() => {
                                    setEditingLead({ ...lead });
                                    setIsEditOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-slate-100"
                                  onClick={() => handleDeleteLead(lead.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* TAB 2: PUBLIC FORM SETUP */}
          <TabsContent value="setup" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Form Customizer Editor */}
              <div className="lg:col-span-5 space-y-6">
                <Card className="border-primary/10 shadow-sm bg-white">
                  <CardHeader className="bg-muted/10 border-b border-border/40">
                    <CardTitle className="text-primary text-lg flex items-center gap-2">
                      <Sliders className="h-5 w-5 text-primary" />
                      Configure Public Form
                    </CardTitle>
                    <CardDescription>
                      Branding, required fields, and colors update instantly on the public URL.
                    </CardDescription>
                  </CardHeader>
                  
                  {settings && (
                    <CardContent className="p-6 space-y-5">
                      
                      {/* Copy Link Button */}
                      <div className="p-4 bg-muted/10 border border-border/40 rounded-xl space-y-2">
                        <Label className="text-primary font-bold text-xs uppercase tracking-wider block">Public Intake Link</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={`${window.location.origin}/${schoolSlug}/inquiry`}
                            className="bg-white border-primary/20 font-mono text-xs"
                          />
                          <Button 
                            variant="outline" 
                            className="border-primary/20 text-primary hover:bg-primary/5 shrink-0"
                            onClick={handleCopyLink}
                          >
                            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                          </Button>
                          <a 
                            href={`/${schoolSlug}/inquiry`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center p-2.5 bg-primary hover:bg-primary/95 text-white rounded-lg"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>

                      {/* Header Title */}
                      <div className="space-y-1.5">
                        <Label htmlFor="form-title">Form Header Title</Label>
                        <Input
                          id="form-title"
                          value={settings.form_title}
                          onChange={(e) => setSettings({ ...settings, form_title: e.target.value })}
                        />
                      </div>

                      {/* Accent Color */}
                      <div className="space-y-3">
                        <Label>Accent / Theme Color</Label>
                        <div className="flex gap-2 items-center">
                          <Input
                            type="color"
                            className="w-10 h-10 p-0 border border-slate-200 rounded-md cursor-pointer shrink-0"
                            value={settings.accent_color}
                            onChange={(e) => setSettings({ ...settings, accent_color: e.target.value })}
                          />
                          <Input
                            type="text"
                            className="border-slate-200 text-sm font-mono"
                            placeholder="#HEX"
                            value={settings.accent_color}
                            onChange={(e) => setSettings({ ...settings, accent_color: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Logo Switch */}
                      <div className="flex items-center justify-between py-2 border-b border-slate-50">
                        <Label htmlFor="setup-logo" className="cursor-pointer">Show School Logo</Label>
                        <Switch 
                          id="setup-logo"
                          checked={settings.show_logo}
                          onCheckedChange={(checked) => setSettings({ ...settings, show_logo: checked })}
                        />
                      </div>

                      {/* Form Fields Switches */}
                      <div className="space-y-3 pt-2 border-t border-slate-100">
                        <h4 className="text-slate-800 font-semibold text-xs uppercase tracking-wider">Form Fields & Requirements</h4>
                        
                        {/* Fields Selector */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 font-medium">Field Visibility</span>
                            <span className="text-slate-500 font-medium">Required</span>
                          </div>
                          
                          {/* Parent Name (Required) */}
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                            <span className="text-slate-700 font-medium text-sm">Parent Full Name</span>
                            <span className="text-slate-400 text-xs font-semibold">Always Required</span>
                          </div>

                          {/* Email */}
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                            <div className="flex items-center gap-2">
                              <Switch 
                                checked={settings.fields_config.email}
                                onCheckedChange={(v) => setSettings({
                                  ...settings,
                                  fields_config: { ...settings.fields_config, email: v }
                                })}
                              />
                              <span className="text-slate-700 text-sm">Email Address</span>
                            </div>
                            {settings.fields_config.email && (
                              <Switch 
                                checked={settings.required_config.email}
                                onCheckedChange={(v) => setSettings({
                                  ...settings,
                                  required_config: { ...settings.required_config, email: v }
                                })}
                              />
                            )}
                          </div>

                          {/* Phone */}
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                            <div className="flex items-center gap-2">
                              <Switch 
                                checked={settings.fields_config.phone}
                                onCheckedChange={(v) => setSettings({
                                  ...settings,
                                  fields_config: { ...settings.fields_config, phone: v }
                                })}
                              />
                              <span className="text-slate-700 text-sm">Phone Number</span>
                            </div>
                            {settings.fields_config.phone && (
                              <Switch 
                                checked={settings.required_config.phone}
                                onCheckedChange={(v) => setSettings({
                                  ...settings,
                                  required_config: { ...settings.required_config, phone: v }
                                })}
                              />
                            )}
                          </div>

                          {/* Child Name */}
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                            <div className="flex items-center gap-2">
                              <Switch 
                                checked={settings.fields_config.studentName}
                                onCheckedChange={(v) => setSettings({
                                  ...settings,
                                  fields_config: { ...settings.fields_config, studentName: v }
                                })}
                              />
                              <span className="text-slate-700 text-sm">Child Full Name</span>
                            </div>
                            {settings.fields_config.studentName && (
                              <Switch 
                                checked={settings.required_config.studentName}
                                onCheckedChange={(v) => setSettings({
                                  ...settings,
                                  required_config: { ...settings.required_config, studentName: v }
                                })}
                              />
                            )}
                          </div>

                          {/* Grade Level */}
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                            <div className="flex items-center gap-2">
                              <Switch 
                                checked={settings.fields_config.studentGrade}
                                onCheckedChange={(v) => setSettings({
                                  ...settings,
                                  fields_config: { ...settings.fields_config, studentGrade: v }
                                })}
                              />
                              <span className="text-slate-700 text-sm">Grade Level Seeking</span>
                            </div>
                            {settings.fields_config.studentGrade && (
                              <Switch 
                                checked={settings.required_config.studentGrade}
                                onCheckedChange={(v) => setSettings({
                                  ...settings,
                                  required_config: { ...settings.required_config, studentGrade: v }
                                })}
                              />
                            )}
                          </div>

                          {/* Prior School */}
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                            <div className="flex gap-2 items-center">
                              <Switch 
                                checked={settings.fields_config.priorSchool}
                                onCheckedChange={(v) => setSettings({
                                  ...settings,
                                  fields_config: { ...settings.fields_config, priorSchool: v }
                                })}
                              />
                              <span className="text-slate-700 text-sm">Prior School attended</span>
                            </div>
                            <span className="text-slate-400 text-xs">Optional</span>
                          </div>

                          {/* Message */}
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                            <div className="flex gap-2 items-center">
                              <Switch 
                                checked={settings.fields_config.message}
                                onCheckedChange={(v) => setSettings({
                                  ...settings,
                                  fields_config: { ...settings.fields_config, message: v }
                                })}
                              />
                              <span className="text-slate-700 text-sm">Message / Notes field</span>
                            </div>
                            <span className="text-slate-400 text-xs">Optional</span>
                          </div>

                        </div>
                      </div>

                      {/* Success message */}
                      <div className="space-y-1.5">
                        <Label htmlFor="success-msg">Success / Confirmation Message</Label>
                        <Textarea
                          id="success-msg"
                          rows={3}
                          value={settings.success_message}
                          onChange={(e) => setSettings({ ...settings, success_message: e.target.value })}
                        />
                      </div>

                      {/* Save Button */}
                      <Button 
                        onClick={() => settings && saveSettings(settings)}
                        disabled={savingSettings}
                        className="w-full bg-primary hover:bg-primary/95 text-white mt-4"
                      >
                        {savingSettings ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                          </>
                        ) : "Save Intake Settings"}
                      </Button>
                    </CardContent>
                  )}
                </Card>
              </div>

              {/* Form Live Preview */}
              <div className="lg:col-span-7 flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-2xl min-h-[500px]">
                <h3 className="text-slate-900 font-bold mb-6 text-sm flex items-center gap-1.5 uppercase tracking-wider">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Website Form Preview
                </h3>
                
                {settings && (
                  <Card className="w-full max-w-md bg-white border border-slate-200 shadow-md rounded-2xl overflow-hidden">
                    <div 
                      className="p-6 text-center text-white flex flex-col items-center justify-center"
                      style={{ backgroundColor: settings.accent_color }}
                    >
                      {settings.show_logo && schoolLogo ? (
                        <img src={schoolLogo} alt="Logo" className="h-10 mb-2 object-contain" />
                      ) : (
                        <School className="h-10 w-10 mb-2" />
                      )}
                      <h4 className="text-base font-bold uppercase tracking-wide">
                        {settings.form_title}
                      </h4>
                      <p className="text-xs text-white/80 mt-1">{schoolName}</p>
                    </div>
                    
                    <CardContent className="p-6 space-y-4">
                      {/* Parent name */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Parent Name *</Label>
                        <Input placeholder="Enter your full name" disabled className="h-9 bg-slate-50 border-slate-200 text-xs" />
                      </div>

                      {/* Email */}
                      {settings.fields_config.email && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-700">
                            Email Address {settings.required_config.email && "*"}
                          </Label>
                          <Input placeholder="parent@example.com" disabled className="h-9 bg-slate-50 border-slate-200 text-xs" />
                        </div>
                      )}

                      {/* Phone */}
                      {settings.fields_config.phone && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-700">
                            Phone Number {settings.required_config.phone && "*"}
                          </Label>
                          <Input placeholder="Enter contact phone" disabled className="h-9 bg-slate-50 border-slate-200 text-xs" />
                        </div>
                      )}

                      {/* Child name */}
                      {settings.fields_config.studentName && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-700">
                            Child Full Name {settings.required_config.studentName && "*"}
                          </Label>
                          <Input placeholder="Enter child's full name" disabled className="h-9 bg-slate-50 border-slate-200 text-xs" />
                        </div>
                      )}

                      {/* Grade */}
                      {settings.fields_config.studentGrade && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-700">
                            Grade Seeking {settings.required_config.studentGrade && "*"}
                          </Label>
                          <Input placeholder="e.g. Kindergarten, Grade 1" disabled className="h-9 bg-slate-50 border-slate-200 text-xs" />
                        </div>
                      )}

                      {/* Prior School */}
                      {settings.fields_config.priorSchool && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-700">Prior School attended</Label>
                          <Input placeholder="Name of previous school" disabled className="h-9 bg-slate-50 border-slate-200 text-xs" />
                        </div>
                      )}

                      {/* Message */}
                      {settings.fields_config.message && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-700">Additional Message</Label>
                          <Textarea placeholder="Any questions or remarks..." disabled className="h-16 bg-slate-50 border-slate-200 text-xs" />
                        </div>
                      )}

                      <Button 
                        disabled 
                        className="w-full text-white text-xs mt-2" 
                        style={{ backgroundColor: settings.accent_color }}
                      >
                        Submit Admissions Inquiry
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

            </div>
          </TabsContent>

          {/* TAB 3: ANALYTICS & INSIGHTS */}
          <TabsContent value="analytics" className="space-y-6">
            
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="border-primary/10 shadow-sm bg-white">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Inquiries</CardDescription>
                  <CardTitle className="text-3xl font-extrabold text-primary">{stats.total}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Log of all inquiry conversions</p>
                </CardContent>
              </Card>

              <Card className="border-primary/10 shadow-sm bg-white">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-medium uppercase tracking-wider text-slate-400">Active Pipeline</CardDescription>
                  <CardTitle className="text-3xl font-extrabold text-primary">{stats.active}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Leads currently in progress</p>
                </CardContent>
              </Card>

              <Card className="border-primary/10 shadow-sm bg-white">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-medium uppercase tracking-wider text-slate-400">Enrolled (Converted)</CardDescription>
                  <CardTitle className="text-3xl font-extrabold text-green-600">{stats.enrolled}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Converted into students</p>
                </CardContent>
              </Card>

              <Card className="border-primary/10 shadow-sm bg-white">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-medium uppercase tracking-wider text-slate-400">Conversion Rate</CardDescription>
                  <CardTitle className="text-3xl font-extrabold text-primary flex items-center gap-1.5">
                    {stats.conversionRate}%
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Total percentage converted</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Funnel Pipeline Stages */}
              <Card className="border-primary/10 shadow-sm bg-white">
                <CardHeader className="bg-muted/5 border-b border-border/40">
                  <CardTitle className="text-primary text-base">Pipeline Funnel Distribution</CardTitle>
                  <CardDescription>Number of inquiries at each pipeline stage.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {Object.entries({
                    "New Leads / Open": stats.statusMap.open,
                    "Contacted / Follow-up": stats.statusMap.contacted,
                    "Qualified Leads": stats.statusMap.qualified,
                    "Converted (Enrolled)": stats.statusMap.converted,
                    "Lost / Disqualified": stats.statusMap.lost,
                  }).map(([label, count]) => {
                    const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                    return (
                      <div key={label} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span>{label}</span>
                          <span>{count} ({Math.round(pct)}%)</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all duration-500" 
                            style={{ width: `${pct}%` }} 
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Inquiry Sources */}
              <Card className="border-primary/10 shadow-sm bg-white">
                <CardHeader className="bg-muted/5 border-b border-border/40">
                  <CardTitle className="text-primary text-base">Lead Channel Acquisition</CardTitle>
                  <CardDescription>How inquiries discover your school.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {stats.sources.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-muted-foreground text-xs">
                      No lead sources recorded yet.
                    </div>
                  ) : (
                    stats.sources.map(src => {
                      const pct = stats.total > 0 ? (src.count / stats.total) * 100 : 0;
                      return (
                        <div key={src.name} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-slate-700">
                            <span>{src.name}</span>
                            <span>{src.count} inquiries</span>
                          </div>
                          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 rounded-full" 
                              style={{ width: `${pct}%` }} 
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

          </TabsContent>
        </Tabs>
      )}

      {/* Manual Inquiry logger Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md bg-white border border-primary/20 rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-primary font-bold flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Log Admissions Inquiry
            </DialogTitle>
            <DialogDescription>
              Log inquiries received via phone calls, references, or walk-ins.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Contact Full Name *</Label>
              <Input
                id="lead-name"
                placeholder="Parent/Guardian Full Name"
                value={newLead.full_name}
                onChange={(e) => setNewLead({ ...newLead, full_name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lead-email">Email Address</Label>
                <Input
                  id="lead-email"
                  type="email"
                  placeholder="parent@example.com"
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone">Phone Number</Label>
                <Input
                  id="lead-phone"
                  placeholder="Contact phone number"
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lead-source">Lead Source</Label>
                <Select 
                  value={newLead.source} 
                  onValueChange={(v) => setNewLead({ ...newLead, source: v })}
                >
                  <SelectTrigger id="lead-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Walk-in">Walk-in</SelectItem>
                    <SelectItem value="Phone call">Phone Call</SelectItem>
                    <SelectItem value="Reference">Reference</SelectItem>
                    <SelectItem value="Social Media">Social Media</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="lead-score">Lead Score (1-10)</Label>
                <Select 
                  value={newLead.score.toString()} 
                  onValueChange={(v) => setNewLead({ ...newLead, score: parseInt(v) })}
                >
                  <SelectTrigger id="lead-score">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                      <SelectItem key={s} value={s.toString()}>{s} / 10</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-notes">Inquiry Notes / Student details</Label>
              <Textarea
                id="lead-notes"
                placeholder="Child's name, grade seeking, prior school details..."
                rows={3}
                value={newLead.notes}
                onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-primary hover:bg-primary/95 text-white" 
              onClick={handleCreateLead}
              disabled={creatingLead}
            >
              {creatingLead ? "Logging..." : "Log Inquiry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Inquiry Details Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md bg-white border border-primary/20 rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-primary font-bold flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Edit Inquiry Details
            </DialogTitle>
            <DialogDescription>
              Update follow-ups, statuses, scores, and owner assignments.
            </DialogDescription>
          </DialogHeader>

          {editingLead && (
            <div className="space-y-4 my-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-lead-name">Contact Full Name</Label>
                <Input
                  id="edit-lead-name"
                  value={editingLead.full_name}
                  onChange={(e) => setEditingLead({ ...editingLead, full_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lead-email">Email Address</Label>
                  <Input
                    id="edit-lead-email"
                    value={editingLead.email || ""}
                    onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lead-phone">Phone Number</Label>
                  <Input
                    id="edit-lead-phone"
                    value={editingLead.phone || ""}
                    onChange={(e) => setEditingLead({ ...editingLead, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lead-source">Lead Source</Label>
                  <Select 
                    value={editingLead.source || "Walk-in"} 
                    onValueChange={(v) => setEditingLead({ ...editingLead, source: v })}
                  >
                    <SelectTrigger id="edit-lead-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Website Inquiry Form">Website</SelectItem>
                      <SelectItem value="Walk-in">Walk-in</SelectItem>
                      <SelectItem value="Phone call">Phone Call</SelectItem>
                      <SelectItem value="Reference">Reference</SelectItem>
                      <SelectItem value="Social Media">Social Media</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lead-status">Inquiry Status</Label>
                  <Select 
                    value={editingLead.status} 
                    onValueChange={(v) => setEditingLead({ ...editingLead, status: v })}
                  >
                    <SelectTrigger id="edit-lead-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open / New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="converted">Enrolled (Converted)</SelectItem>
                      <SelectItem value="lost">Lost / Disqualified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lead-score">Lead Score (1-10)</Label>
                  <Select 
                    value={(editingLead.score || 5).toString()} 
                    onValueChange={(v) => setEditingLead({ ...editingLead, score: parseInt(v) })}
                  >
                    <SelectTrigger id="edit-lead-score">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                        <SelectItem key={s} value={s.toString()}>{s} / 10</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-lead-assignee">Assigned Counselor</Label>
                  <Select 
                    value={editingLead.assigned_to || "unassigned"} 
                    onValueChange={(v) => setEditingLead({ ...editingLead, assigned_to: v })}
                  >
                    <SelectTrigger id="edit-lead-assignee">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {counselors.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-lead-notes">Internal Inquiry Notes / Student Details</Label>
                <Textarea
                  id="edit-lead-notes"
                  rows={3}
                  value={editingLead.notes || ""}
                  onChange={(e) => setEditingLead({ ...editingLead, notes: e.target.value })}
                />
              </div>
            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-primary hover:bg-primary/95 text-white" 
              onClick={handleSaveLead}
              disabled={savingLead}
            >
              {savingLead ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
