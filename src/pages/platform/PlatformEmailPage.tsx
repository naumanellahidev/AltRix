import React, { useEffect, useState } from "react";
import {
  Mail,
  Send,
  ShieldCheck,
  Server,
  Layers,
  FileCode2,
  ListFilter,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  Eye,
  Sparkles,
  Inbox,
  Clock,
  Search,
  Activity,
  ChevronRight,
  Globe,
  Radio,
  Image,
  Palette,
  RotateCcw,
  Smartphone,
  Monitor,
  Copy,
  Check,
  CheckCircle,
  HelpCircle,
  Upload,
} from "lucide-react";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

interface Telemetry {
  sent24h: number;
  successful24h: number;
  failed24h: number;
  successRate24h: number;
  totalAllTime: number;
  activeSenders: number;
  activeTemplates: number;
  pendingInvitations: number;
  mailServerHost: string;
  mailServerStatus: string;
}

interface BrandingConfig {
  brandName: string;
  primaryLogoUrl: string;
  secondaryLogoUrl?: string | null;
  brandIconUrl: string;
  headerLogoType: string;
  primaryColor: string;
  accentColor: string;
  secondaryColor: string;
  supportEmail: string;
  contactEmail: string;
  websiteUrl: string;
  footerText: string;
  legalDisclaimer?: string | null;
  socialLinks?: Record<string, string> | null;
}

interface EmailAsset {
  id: string;
  name: string;
  assetType: string;
  url: string;
  filename: string;
  mimeType?: string;
  fileSizeBytes?: number;
  dimensions?: string;
  isActive: boolean;
  updatedAt?: string | null;
}

interface SenderIdentity {
  id: string;
  key: string;
  name: string;
  email: string;
  replyTo?: string | null;
  isDefault: boolean;
  isActive: boolean;
  updatedAt?: string | null;
}

interface EmailTemplate {
  id: string;
  key: string;
  name: string;
  category: string;
  subject: string;
  senderIdentityKey?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  htmlContent: string;
  textContent?: string | null;
  ctaText?: string | null;
  ctaUrlVariable?: string | null;
  availableVariables: string[];
  version?: number;
  isSystem?: boolean;
  isActive: boolean;
  updatedAt?: string | null;
}

interface TemplateVersion {
  id: string;
  templateKey: string;
  version: number;
  subject: string;
  htmlContent: string;
  textContent?: string | null;
  createdAt: string;
}

interface EventMapping {
  eventName: string;
  senderIdentityKey: string;
  senderName?: string | null;
  senderEmail?: string | null;
  templateKey: string;
  templateName?: string | null;
  templateSubject?: string | null;
  description?: string | null;
  updatedAt?: string | null;
}

interface EmailLog {
  id: string;
  recipientEmail: string;
  senderEmail: string;
  senderName?: string | null;
  eventName: string;
  templateKey?: string | null;
  subject: string;
  status: string;
  errorDetails?: string | null;
  messageId?: string | null;
  sentAt?: string | null;
  metadata?: Record<string, any>;
}

interface MtaHealth {
  host: string;
  port: number;
  status: string;
  latencyMs: number;
  banner: string;
  domain: string;
  mailuHost: string;
  dnsRecords: Record<string, string>;
}

export default function PlatformEmailPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  // Data states
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [assets, setAssets] = useState<EmailAsset[]>([]);
  const [senders, setSenders] = useState<SenderIdentity[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [mappings, setMappings] = useState<EventMapping[]>([]);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logSearch, setLogSearch] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState("all");
  const [mtaHealth, setMtaHealth] = useState<MtaHealth | null>(null);

  // Template Studio State
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateEditSubject, setTemplateEditSubject] = useState("");
  const [templateEditHtml, setTemplateEditHtml] = useState("");
  const [templateEditSenderKey, setTemplateEditSenderKey] = useState("security");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewTab, setPreviewTab] = useState<"edit" | "preview">("edit");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateVersions, setTemplateVersions] = useState<TemplateVersion[]>([]);
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Branding Form State
  const [brandForm, setBrandForm] = useState<BrandingConfig>({
    brandName: "AltRix",
    primaryLogoUrl: "https://altrixcore.com/altrix-logo.png",
    brandIconUrl: "https://altrixcore.com/altrix-icon.png",
    headerLogoType: "primary",
    primaryColor: "#0f172a",
    accentColor: "#2563eb",
    secondaryColor: "#64748b",
    supportEmail: "support@altrixcore.com",
    contactEmail: "contact@altrixcore.com",
    websiteUrl: "https://altrixcore.com",
    footerText: "Enterprise Identity & Cloud Core Platform",
    legalDisclaimer: "This email was generated by AltRix Cloud OS on behalf of the registered institution.",
  });
  const [savingBrand, setSavingBrand] = useState(false);

  // Sender Modal State
  const [senderModalOpen, setSenderModalOpen] = useState(false);
  const [editingSender, setEditingSender] = useState<SenderIdentity | null>(null);
  const [senderFormKey, setSenderFormKey] = useState("");
  const [senderFormName, setSenderFormName] = useState("");
  const [senderFormEmail, setSenderFormEmail] = useState("");
  const [senderFormReplyTo, setSenderFormReplyTo] = useState("");
  const [senderFormIsDefault, setSenderFormIsDefault] = useState(false);
  const [senderFormIsActive, setSenderFormIsActive] = useState(true);
  const [savingSender, setSavingSender] = useState(false);

  // Asset Modal State
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("primary_logo");
  const [assetUrl, setAssetUrl] = useState("");
  const [assetFilename, setAssetFilename] = useState("");
  const [assetDimensions, setAssetDimensions] = useState("");
  const [savingAsset, setSavingAsset] = useState(false);

  // Event Mapping Modal
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<EventMapping | null>(null);
  const [mappingFormSender, setMappingFormSender] = useState("security");
  const [mappingFormTemplate, setMappingFormTemplate] = useState("staff_invitation");
  const [savingMapping, setSavingMapping] = useState(false);

  // Test Send State
  const [testRecipient, setTestRecipient] = useState("naumancheema643@gmail.com");
  const [testSenderKey, setTestSenderKey] = useState("security");
  const [testTemplateKey, setTestTemplateKey] = useState<string>("staff_invitation");
  const [testSubject, setTestSubject] = useState("AltRix System Test Dispatch");
  const [testMessage, setTestMessage] = useState("This is a live transactional test email from the AltRix Central Mail Engine.");
  const [testSending, setTestSending] = useState(false);

  // Copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (textVal: string, keyName: string) => {
    navigator.clipboard.writeText(textVal);
    setCopiedKey(keyName);
    toast.success(`Copied: ${textVal}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Fetch Overview Data
  const loadOverview = async () => {
    try {
      const res = await apiClient.get("/super_admin/email/overview");
      if (res.data) {
        setTelemetry(res.data.telemetry);
      }
    } catch (err) {
      console.error("Failed to load email overview:", err);
    }
  };

  // Fetch Branding
  const loadBranding = async () => {
    try {
      const res = await apiClient.get("/super_admin/email/branding");
      if (res.data?.branding) {
        setBranding(res.data.branding);
        setBrandForm(res.data.branding);
      }
    } catch (err) {
      console.error("Failed to load branding:", err);
    }
  };

  // Fetch Assets
  const loadAssets = async () => {
    try {
      const res = await apiClient.get("/super_admin/email/assets");
      if (res.data) {
        setAssets(res.data);
      }
    } catch (err) {
      console.error("Failed to load assets:", err);
    }
  };

  // Fetch Senders
  const loadSenders = async () => {
    try {
      const res = await apiClient.get("/super_admin/email/senders");
      if (res.data) {
        setSenders(res.data);
      }
    } catch (err) {
      console.error("Failed to load senders:", err);
    }
  };

  // Fetch Templates
  const loadTemplates = async (cat = "all") => {
    try {
      const params: any = {};
      if (cat !== "all") params.category = cat;
      const res = await apiClient.get("/super_admin/email/templates", { params });
      if (res.data) {
        setTemplates(res.data);
        if (res.data.length > 0 && (!selectedTemplate || !res.data.some((t: EmailTemplate) => t.id === selectedTemplate.id))) {
          const first = res.data[0];
          setSelectedTemplate(first);
          setTemplateEditSubject(first.subject);
          setTemplateEditHtml(first.htmlContent);
          setTemplateEditSenderKey(first.senderIdentityKey || "security");
        }
      }
    } catch (err) {
      console.error("Failed to load templates:", err);
    }
  };

  // Fetch Event Mappings
  const loadMappings = async () => {
    try {
      const res = await apiClient.get("/super_admin/email/mappings");
      if (res.data) {
        setMappings(res.data);
      }
    } catch (err) {
      console.error("Failed to load mappings:", err);
    }
  };

  // Fetch Delivery Logs
  const loadLogs = async (page = 1) => {
    try {
      const params: any = { page, limit: 25 };
      if (logStatusFilter !== "all") params.status = logStatusFilter;
      if (logSearch.trim()) params.search = logSearch.trim();

      const res = await apiClient.get("/super_admin/email/logs", { params });
      if (res.data) {
        setLogs(res.data.logs || []);
        setLogsTotal(res.data.total || 0);
        setLogsPage(res.data.page || 1);
      }
    } catch (err) {
      console.error("Failed to load email logs:", err);
    }
  };

  // Fetch MTA Health
  const loadMtaHealth = async () => {
    try {
      const res = await apiClient.get("/super_admin/email/health");
      if (res.data?.mta) {
        setMtaHealth(res.data.mta);
      }
    } catch (err) {
      console.error("Failed to load MTA health:", err);
    }
  };

  // Load all on mount
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([
        loadOverview(),
        loadBranding(),
        loadAssets(),
        loadSenders(),
        loadTemplates(),
        loadMappings(),
        loadLogs(),
        loadMtaHealth(),
      ]);
      setLoading(false);
    };
    init();
  }, []);

  // Update selected template inputs when selection changes
  const handleSelectTemplate = (tmpl: EmailTemplate) => {
    setSelectedTemplate(tmpl);
    setTemplateEditSubject(tmpl.subject);
    setTemplateEditHtml(tmpl.htmlContent);
    setTemplateEditSenderKey(tmpl.senderIdentityKey || "security");
    setPreviewTab("edit");
  };

  // Live render template preview
  const handlePreview = async () => {
    try {
      const res = await apiClient.post("/super_admin/email/templates/preview", {
        subject: templateEditSubject,
        htmlContent: templateEditHtml,
        variables: {},
      });
      if (res.data?.renderedHtml) {
        setPreviewHtml(res.data.renderedHtml);
        setPreviewTab("preview");
      }
    } catch (err) {
      toast.error("Failed to render preview");
    }
  };

  // Save template changes
  const handleSaveTemplate = async () => {
    if (!selectedTemplate) return;
    setSavingTemplate(true);
    try {
      await apiClient.post("/super_admin/email/templates", {
        key: selectedTemplate.key,
        name: selectedTemplate.name,
        category: selectedTemplate.category,
        subject: templateEditSubject,
        senderIdentityKey: templateEditSenderKey,
        htmlContent: templateEditHtml,
        textContent: selectedTemplate.textContent,
        ctaText: selectedTemplate.ctaText,
        ctaUrlVariable: selectedTemplate.ctaUrlVariable,
        availableVariables: selectedTemplate.availableVariables,
        isActive: selectedTemplate.isActive,
      });
      toast.success(`Template '${selectedTemplate.name}' saved with version history!`);
      await loadTemplates(selectedCategory);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  };

  // Open Template Version History
  const openVersionHistory = async () => {
    if (!selectedTemplate) return;
    setVersionsModalOpen(true);
    setLoadingVersions(true);
    try {
      const res = await apiClient.get(`/super_admin/email/templates/${selectedTemplate.key}/versions`);
      if (res.data) {
        setTemplateVersions(res.data);
      }
    } catch (err) {
      toast.error("Failed to load version history");
    } finally {
      setLoadingVersions(false);
    }
  };

  // Restore Template Version
  const handleRestoreVersion = async (versionId: string) => {
    if (!selectedTemplate) return;
    try {
      await apiClient.post(`/super_admin/email/templates/${selectedTemplate.key}/restore/${versionId}`);
      toast.success("Template version restored successfully!");
      setVersionsModalOpen(false);
      await loadTemplates(selectedCategory);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to restore version");
    }
  };

  // Insert variable tag into template
  const insertVariable = (varName: string) => {
    const tag = `{{${varName}}}`;
    setTemplateEditHtml((prev) => prev + tag);
    toast.info(`Inserted variable tag: ${tag}`);
  };

  // Save Branding
  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBrand(true);
    try {
      await apiClient.put("/super_admin/email/branding", brandForm);
      toast.success("Global email branding updated successfully!");
      await loadBranding();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to update branding");
    } finally {
      setSavingBrand(false);
    }
  };

  // Save Asset
  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAsset(true);
    try {
      await apiClient.post("/super_admin/email/assets", {
        name: assetName,
        assetType,
        url: assetUrl,
        filename: assetFilename || assetUrl.split("/").pop() || "asset.png",
        dimensions: assetDimensions,
      });
      toast.success("Brand asset registered successfully!");
      setAssetModalOpen(false);
      await loadAssets();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to save asset");
    } finally {
      setSavingAsset(false);
    }
  };

  // Open sender modal
  const openSenderModal = (sender?: SenderIdentity) => {
    if (sender) {
      setEditingSender(sender);
      setSenderFormKey(sender.key);
      setSenderFormName(sender.name);
      setSenderFormEmail(sender.email);
      setSenderFormReplyTo(sender.replyTo || "");
      setSenderFormIsDefault(sender.isDefault);
      setSenderFormIsActive(sender.isActive);
    } else {
      setEditingSender(null);
      setSenderFormKey("");
      setSenderFormName("");
      setSenderFormEmail("");
      setSenderFormReplyTo("");
      setSenderFormIsDefault(false);
      setSenderFormIsActive(true);
    }
    setSenderModalOpen(true);
  };

  // Save sender identity
  const handleSaveSender = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSender(true);
    try {
      const payload = {
        key: senderFormKey,
        name: senderFormName,
        email: senderFormEmail,
        replyTo: senderFormReplyTo || undefined,
        isDefault: senderFormIsDefault,
        isActive: senderFormIsActive,
      };

      if (editingSender) {
        await apiClient.put(`/super_admin/email/senders/${editingSender.id}`, payload);
      } else {
        await apiClient.post("/super_admin/email/senders", payload);
      }

      toast.success("Sender identity saved successfully!");
      setSenderModalOpen(false);
      await loadSenders();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to save sender");
    } finally {
      setSavingSender(false);
    }
  };

  // Open mapping modal
  const openMappingModal = (m: EventMapping) => {
    setEditingMapping(m);
    setMappingFormSender(m.senderIdentityKey);
    setMappingFormTemplate(m.templateKey);
    setMappingModalOpen(true);
  };

  // Save mapping
  const handleSaveMapping = async () => {
    if (!editingMapping) return;
    setSavingMapping(true);
    try {
      await apiClient.put(`/super_admin/email/mappings/${editingMapping.eventName}`, {
        senderIdentityKey: mappingFormSender,
        templateKey: mappingFormTemplate,
        description: editingMapping.description,
      });
      toast.success(`Event '${editingMapping.eventName}' mapped successfully!`);
      setMappingModalOpen(false);
      await loadMappings();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to update mapping");
    } finally {
      setSavingMapping(false);
    }
  };

  // Dispatch Test Email
  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient.trim()) return toast.error("Enter recipient email");

    setTestSending(true);
    try {
      await apiClient.post("/super_admin/email/test-send", {
        recipientEmail: testRecipient.trim(),
        senderIdentityKey: testSenderKey,
        templateKey: testTemplateKey || undefined,
        customSubject: testSubject,
        customMessage: testMessage,
      });

      toast.success(`Test email successfully sent to ${testRecipient}!`);
      await loadOverview();
      await loadLogs();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to dispatch test email");
    } finally {
      setTestSending(false);
    }
  };

  const categories = [
    { key: "all", label: "All Templates" },
    { key: "Authentication", label: "Authentication" },
    { key: "Staff/HR", label: "Staff & HR" },
    { key: "Finance", label: "Finance & Billing" },
    { key: "Academic", label: "Academic" },
    { key: "Communication", label: "Communication" },
    { key: "System", label: "System & Ops" },
  ];

  return (
    <SuperAdminShell
      title="Central Email Management HQ"
      subtitle="Configure AltRix branding, manage sender identities, design responsive templates, and monitor VPS delivery"
      actions={
        <div className="flex items-center gap-2">
          <a
            href="https://mail.altrixcore.com/admin"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md text-xs font-semibold h-8 px-3 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition-colors shadow-xs hover:border-slate-400"
            title="Open Mail Platform Admin Control Center (Domains, Mailboxes, DKIM, Anti-Spam)"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5 text-blue-600" /> Mail Server Admin
          </a>
          <a
            href="https://mail.altrixcore.com/webmail"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md text-xs font-semibold h-8 px-3 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition-colors shadow-xs hover:border-slate-400"
            title="Open Roundcube Webmail Inbox (Send & Receive institutional mail)"
          >
            <Inbox className="h-3.5 w-3.5 mr-1.5 text-indigo-600" /> Webmail Client
          </a>
          <Button
            size="sm"
            onClick={() => {
              loadOverview();
              loadBranding();
              loadAssets();
              loadSenders();
              loadTemplates(selectedCategory);
              loadMappings();
              loadLogs();
              loadMtaHealth();
              toast.success("Refreshed email platform telemetry");
            }}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-7 max-w-5xl bg-slate-100 p-1 rounded-xl">
            <TabsTrigger value="overview" className="text-xs font-bold gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="branding" className="text-xs font-bold gap-1.5">
              <Palette className="h-3.5 w-3.5" /> Branding
            </TabsTrigger>
            <TabsTrigger value="senders" className="text-xs font-bold gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Senders
            </TabsTrigger>
            <TabsTrigger value="templates" className="text-xs font-bold gap-1.5">
              <FileCode2 className="h-3.5 w-3.5" /> Templates
            </TabsTrigger>
            <TabsTrigger value="routing" className="text-xs font-bold gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Routing
            </TabsTrigger>
            <TabsTrigger value="test_lab" className="text-xs font-bold gap-1.5">
              <Send className="h-3.5 w-3.5" /> Test Lab
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-xs font-bold gap-1.5">
              <ListFilter className="h-3.5 w-3.5" /> Logs
            </TabsTrigger>
          </TabsList>

          {/* 1. OVERVIEW TAB */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-slate-200 shadow-xs bg-white">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[11px] uppercase font-bold text-slate-500">24h Dispatched</CardDescription>
                  <CardTitle className="text-2xl font-black text-slate-900 flex items-center justify-between">
                    {telemetry?.sent24h ?? 0}
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 font-bold text-xs">Live</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-500">All transactional event triggers</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-xs bg-white">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[11px] uppercase font-bold text-slate-500">24h Success Rate</CardDescription>
                  <CardTitle className="text-2xl font-black text-emerald-600 flex items-center justify-between">
                    {telemetry?.successRate24h ?? 100}%
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-500">Successful relay through local MTA</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-xs bg-white">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[11px] uppercase font-bold text-slate-500">Configured Senders</CardDescription>
                  <CardTitle className="text-2xl font-black text-indigo-600 flex items-center justify-between">
                    {telemetry?.activeSenders ?? senders.length}
                    <Mail className="h-5 w-5 text-indigo-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-500">Official AltRix brand aliases</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-xs bg-white">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[11px] uppercase font-bold text-slate-500">Pending Staff Invites</CardDescription>
                  <CardTitle className="text-2xl font-black text-amber-600 flex items-center justify-between">
                    {telemetry?.pendingInvitations ?? 0}
                    <Clock className="h-5 w-5 text-amber-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-500">Active single-use activation tokens</p>
                </CardContent>
              </Card>
            </div>

            {/* Mail Server Node Info Card */}
            <Card className="border-slate-200 shadow-xs bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 text-white">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                      <Server className="h-4 w-4 text-emerald-400" /> VPS Mail Infrastructure Node
                    </CardTitle>
                    <CardDescription className="text-slate-300 text-xs mt-0.5">
                      Subdomain: <strong className="text-emerald-400">mail.altrixcore.com</strong> (IP: 169.58.111.159)
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold px-3 py-1">
                      <Radio className="h-3 w-3 mr-1 animate-pulse" /> Postfix SMTP Online ({mtaHealth?.latencyMs || 2}ms)
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-xs">
                <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-1">
                  <span className="text-slate-400 font-medium">SSL / TLS Certificate</span>
                  <p className="font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Let's Encrypt (Dedicated)
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-1">
                  <span className="text-slate-400 font-medium">Outbound Relay Port</span>
                  <p className="font-bold text-white">127.0.0.1:25 (Docker RELAYNETS)</p>
                </div>
                <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-1">
                  <span className="text-slate-400 font-medium">Webmail & Admin Routing</span>
                  <div className="flex items-center gap-2 pt-0.5">
                    <a
                      href="https://mail.altrixcore.com/admin"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
                    >
                      Admin <ExternalLink className="h-3 w-3" />
                    </a>
                    <span className="text-slate-500">|</span>
                    <a
                      href="https://mail.altrixcore.com/webmail/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
                    >
                      Webmail <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Delivery Stream */}
            <Card className="border-slate-200 shadow-xs bg-white">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Recent Transactional Deliveries</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Live stream of outgoing email events</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab("logs")} className="text-xs text-blue-600 font-bold">
                  View All Logs <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-y border-slate-200 text-slate-600 uppercase font-bold text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4">Event</th>
                        <th className="py-2.5 px-4">Recipient</th>
                        <th className="py-2.5 px-4">Sender Address</th>
                        <th className="py-2.5 px-4">Subject</th>
                        <th className="py-2.5 px-4">Dispatched At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.slice(0, 8).map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-semibold">
                            {item.status === "sent" || item.status === "delivered" ? (
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] uppercase font-bold border-0">
                                Sent
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                                Failed
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {item.eventName.replace("_", " ").toUpperCase()}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">{item.recipientEmail}</td>
                          <td className="py-3 px-4 font-mono text-slate-600">{item.senderEmail}</td>
                          <td className="py-3 px-4 text-slate-700 truncate max-w-xs">{item.subject}</td>
                          <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                            {item.sentAt ? new Date(item.sentAt).toLocaleString() : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. BRANDING & ASSETS TAB */}
          <TabsContent value="branding" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Branding Config Form */}
              <div className="lg:col-span-7">
                <Card className="border-slate-200 shadow-xs bg-white">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Palette className="h-4 w-4 text-blue-600" /> Global Visual Identity & Email Branding
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Standardize colors, hosted logo assets, legal disclaimers, and footers across all outgoing transactional emails.
                    </CardDescription>
                  </CardHeader>
                  <form onSubmit={handleSaveBranding}>
                    <CardContent className="p-5 space-y-4 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-700">Platform Brand Name</Label>
                          <Input
                            value={brandForm.brandName}
                            onChange={(e) => setBrandForm({ ...brandForm, brandName: e.target.value })}
                            className="text-xs bg-slate-50"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-700">Header Logo Layout</Label>
                          <Select
                            value={brandForm.headerLogoType}
                            onValueChange={(val) => setBrandForm({ ...brandForm, headerLogoType: val })}
                          >
                            <SelectTrigger className="text-xs bg-slate-50">
                              <SelectValue placeholder="Logo Type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="primary" className="text-xs">Primary Banner Logo</SelectItem>
                              <SelectItem value="icon_text" className="text-xs">Icon + Brand Text</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">Primary Brand Logo URL (Hosted PNG/SVG)</Label>
                        <Input
                          value={brandForm.primaryLogoUrl}
                          onChange={(e) => setBrandForm({ ...brandForm, primaryLogoUrl: e.target.value })}
                          className="text-xs font-mono bg-slate-50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">Brand Mark Icon URL (Square Icon)</Label>
                        <Input
                          value={brandForm.brandIconUrl}
                          onChange={(e) => setBrandForm({ ...brandForm, brandIconUrl: e.target.value })}
                          className="text-xs font-mono bg-slate-50"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-700">Primary Color</Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={brandForm.primaryColor}
                              onChange={(e) => setBrandForm({ ...brandForm, primaryColor: e.target.value })}
                              className="h-8 w-8 rounded border border-slate-300 p-0 cursor-pointer"
                            />
                            <Input
                              value={brandForm.primaryColor}
                              onChange={(e) => setBrandForm({ ...brandForm, primaryColor: e.target.value })}
                              className="text-xs font-mono"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-700">Accent Color</Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={brandForm.accentColor}
                              onChange={(e) => setBrandForm({ ...brandForm, accentColor: e.target.value })}
                              className="h-8 w-8 rounded border border-slate-300 p-0 cursor-pointer"
                            />
                            <Input
                              value={brandForm.accentColor}
                              onChange={(e) => setBrandForm({ ...brandForm, accentColor: e.target.value })}
                              className="text-xs font-mono"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-700">Secondary Color</Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={brandForm.secondaryColor}
                              onChange={(e) => setBrandForm({ ...brandForm, secondaryColor: e.target.value })}
                              className="h-8 w-8 rounded border border-slate-300 p-0 cursor-pointer"
                            />
                            <Input
                              value={brandForm.secondaryColor}
                              onChange={(e) => setBrandForm({ ...brandForm, secondaryColor: e.target.value })}
                              className="text-xs font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-700">Support Desk Email</Label>
                          <Input
                            type="email"
                            value={brandForm.supportEmail}
                            onChange={(e) => setBrandForm({ ...brandForm, supportEmail: e.target.value })}
                            className="text-xs bg-slate-50 font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-700">Website Portal URL</Label>
                          <Input
                            value={brandForm.websiteUrl}
                            onChange={(e) => setBrandForm({ ...brandForm, websiteUrl: e.target.value })}
                            className="text-xs bg-slate-50 font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">Footer Tagline</Label>
                        <Input
                          value={brandForm.footerText}
                          onChange={(e) => setBrandForm({ ...brandForm, footerText: e.target.value })}
                          className="text-xs bg-slate-50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">Legal Compliance Disclaimer</Label>
                        <Textarea
                          rows={2}
                          value={brandForm.legalDisclaimer || ""}
                          onChange={(e) => setBrandForm({ ...brandForm, legalDisclaimer: e.target.value })}
                          className="text-xs bg-slate-50"
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="bg-slate-50 border-t border-slate-100 py-3 flex justify-end">
                      <Button type="submit" disabled={savingBrand} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-5">
                        {savingBrand ? "Saving Branding..." : "Save Branding Configuration"}
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              </div>

              {/* Brand Asset Library */}
              <div className="lg:col-span-5 space-y-4">
                <Card className="border-slate-200 shadow-xs bg-white">
                  <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Image className="h-4 w-4 text-indigo-600" /> Managed Brand Assets
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">Official images used in templates</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setAssetModalOpen(true)} className="text-xs bg-indigo-600 hover:bg-indigo-700 font-semibold h-8">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Asset
                    </Button>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {assets.map((ast) => (
                      <div key={ast.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center gap-3">
                        <div className="h-12 w-12 rounded-md bg-slate-900 flex items-center justify-center p-1 overflow-hidden shrink-0 border border-slate-800">
                          <img src={ast.url} alt={ast.name} className="max-h-full max-w-full object-contain" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{ast.name}</p>
                          <p className="text-[11px] font-mono text-slate-500 truncate">{ast.url}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[9px] uppercase font-bold">{ast.assetType}</Badge>
                            {ast.dimensions && <span className="text-[10px] text-slate-400 font-mono">{ast.dimensions}</span>}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(ast.url, ast.id)}
                          className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600"
                        >
                          {copiedKey === ast.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* 3. SENDER IDENTITIES TAB */}
          <TabsContent value="senders" className="mt-6 space-y-6">
            <Card className="border-slate-200 shadow-xs bg-white">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Official AltRix Sender Identities</CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Configure authorized outgoing mail addresses mapped to mailboxes on <strong>mail.altrixcore.com</strong>
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => openSenderModal()} className="text-xs bg-blue-600 hover:bg-blue-700 font-semibold">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Identity
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-y border-slate-200 text-slate-600 uppercase font-bold text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4">Identifier Key</th>
                        <th className="py-2.5 px-4">Display Name</th>
                        <th className="py-2.5 px-4">Sender Email Address</th>
                        <th className="py-2.5 px-4">Reply-To Address</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {senders.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-blue-700">
                            {s.key}
                            {s.isDefault && (
                              <Badge className="ml-2 bg-blue-50 text-blue-700 text-[9px] uppercase font-bold border border-blue-200">
                                Default
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">{s.name}</td>
                          <td className="py-3 px-4 font-mono text-slate-700">{s.email}</td>
                          <td className="py-3 px-4 font-mono text-slate-500">{s.replyTo || "—"}</td>
                          <td className="py-3 px-4">
                            {s.isActive ? (
                              <Badge className="bg-emerald-100 text-emerald-700 text-[10px] font-bold border-0">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-400 text-[10px]">Disabled</Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right space-x-1">
                            <Button variant="ghost" size="sm" onClick={() => openSenderModal(s)} className="h-7 px-2 text-xs">
                              <Edit2 className="h-3.5 w-3.5 text-slate-600" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 4. TEMPLATE STUDIO TAB */}
          <TabsContent value="templates" className="mt-6 space-y-6">
            {/* Category Filter Bar */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl">
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.key);
                    loadTemplates(cat.key);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedCategory === cat.key
                      ? "bg-white text-blue-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Template Selection Cards */}
              <div className="lg:col-span-4 space-y-2.5 max-h-[780px] overflow-y-auto pr-1">
                {templates.map((tmpl) => {
                  const isSelected = selectedTemplate?.id === tmpl.id;
                  return (
                    <Card
                      key={tmpl.id}
                      onClick={() => handleSelectTemplate(tmpl)}
                      className={`cursor-pointer transition-all duration-200 border ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/50 shadow-xs ring-1 ring-blue-600/30"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                      }`}
                    >
                      <CardHeader className="p-3.5 pb-1.5">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                            {tmpl.category}
                          </Badge>
                          <span className="text-[10px] font-mono text-slate-400">{tmpl.key}</span>
                        </div>
                        <CardTitle className="text-xs font-bold text-slate-900 mt-1">{tmpl.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3.5 pt-0">
                        <p className="text-[11px] text-slate-500 truncate">{tmpl.subject}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Right Column: Template Editor & Dual Preview */}
              <div className="lg:col-span-8 space-y-4">
                {selectedTemplate ? (
                  <Card className="border-slate-200 shadow-xs bg-white">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <FileCode2 className="h-4 w-4 text-blue-600" /> {selectedTemplate.name}
                            <Badge variant="outline" className="text-[10px] font-bold text-blue-700 border-blue-200">
                              v{selectedTemplate.version || 1}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-500">
                            Identifier: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-bold">{selectedTemplate.key}</code>
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={openVersionHistory}
                            className="text-xs border-slate-300 font-semibold text-slate-700"
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Revisions
                          </Button>
                          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
                            <button
                              type="button"
                              onClick={() => setPreviewTab("edit")}
                              className={`px-3 py-1 rounded-md transition-all ${
                                previewTab === "edit" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Editor
                            </button>
                            <button
                              type="button"
                              onClick={handlePreview}
                              className={`px-3 py-1 rounded-md transition-all ${
                                previewTab === "preview" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Live Preview
                            </button>
                          </div>
                          <Button
                            size="sm"
                            onClick={handleSaveTemplate}
                            disabled={savingTemplate}
                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold"
                          >
                            {savingTemplate ? "Saving..." : "Save Template"}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-4">
                      {previewTab === "edit" ? (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-700">Email Subject Line</Label>
                              <Input
                                value={templateEditSubject}
                                onChange={(e) => setTemplateEditSubject(e.target.value)}
                                className="text-xs bg-slate-50 border-slate-300"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-700">Default Sender Address</Label>
                              <Select value={templateEditSenderKey} onValueChange={setTemplateEditSenderKey}>
                                <SelectTrigger className="text-xs bg-slate-50 border-slate-300">
                                  <SelectValue placeholder="Select Sender" />
                                </SelectTrigger>
                                <SelectContent>
                                  {senders.map((s) => (
                                    <SelectItem key={s.key} value={s.key} className="text-xs font-medium">
                                      {s.name} ({s.email})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Variable Tag Chips */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <Sparkles className="h-3.5 w-3.5 text-blue-600" /> Insert Dynamic Variable Tags
                            </Label>
                            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                              {(selectedTemplate.availableVariables.length > 0
                                ? selectedTemplate.availableVariables
                                : ["name", "email", "role", "tenant.name", "activation_link", "reset_link", "expires_in", "support_email", "year"]
                              ).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => insertVariable(v)}
                                  className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-700 text-[11px] font-mono font-semibold transition-colors shadow-2xs"
                                >
                                  + &#123;&#123;{v}&#125;&#125;
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* HTML Markup Editor */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700">Responsive HTML Email Markup</Label>
                            <Textarea
                              rows={15}
                              value={templateEditHtml}
                              onChange={(e) => setTemplateEditHtml(e.target.value)}
                              className="font-mono text-xs leading-relaxed bg-slate-950 text-slate-100 border-slate-800 p-3 rounded-lg"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div className="p-3 bg-slate-100 rounded-lg text-xs flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-700">Subject Preview:</span>
                              <span className="font-bold text-slate-900">{templateEditSubject}</span>
                            </div>
                            <div className="flex items-center gap-1 bg-white p-0.5 rounded-md border border-slate-200">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPreviewDevice("desktop")}
                                className={`h-7 px-2 text-xs ${previewDevice === "desktop" ? "bg-slate-100 text-blue-700 font-bold" : "text-slate-500"}`}
                              >
                                <Monitor className="h-3.5 w-3.5 mr-1" /> Desktop
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPreviewDevice("mobile")}
                                className={`h-7 px-2 text-xs ${previewDevice === "mobile" ? "bg-slate-100 text-blue-700 font-bold" : "text-slate-500"}`}
                              >
                                <Smartphone className="h-3.5 w-3.5 mr-1" /> Mobile
                              </Button>
                            </div>
                          </div>
                          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-inner bg-slate-900 p-4 flex justify-center">
                            <iframe
                              title="Live Email Preview"
                              srcDoc={previewHtml}
                              className={`rounded-lg bg-white border-0 shadow-lg transition-all duration-300 ${
                                previewDevice === "mobile" ? "w-[380px] min-h-[600px]" : "w-full min-h-[550px]"
                              }`}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-slate-200 shadow-xs bg-white text-center py-16">
                    <CardContent className="space-y-3">
                      <FileCode2 className="h-10 w-10 text-slate-300 mx-auto" />
                      <p className="font-bold text-slate-700">Select a template on the left to edit and preview</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* 5. EVENT ROUTING MATRIX TAB */}
          <TabsContent value="routing" className="mt-6 space-y-6">
            <Card className="border-slate-200 shadow-xs bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-slate-900">System Event &rarr; Sender Routing Matrix</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Control which official AltRix sender address and template dynamically handles each application event.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-y border-slate-200 text-slate-600 uppercase font-bold text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4">System Event</th>
                        <th className="py-2.5 px-4">Description</th>
                        <th className="py-2.5 px-4">Assigned Sender Identity</th>
                        <th className="py-2.5 px-4">Assigned Template</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mappings.map((m) => (
                        <tr key={m.eventName} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono text-[11px]">
                              {m.eventName}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 max-w-xs">{m.description || "—"}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{m.senderName || m.senderIdentityKey}</div>
                            <div className="text-[11px] font-mono text-slate-400">{m.senderEmail}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{m.templateName || m.templateKey}</div>
                            <div className="text-[11px] text-slate-400 truncate max-w-xs">{m.templateSubject}</div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button variant="outline" size="sm" onClick={() => openMappingModal(m)} className="h-7 text-xs font-semibold">
                              Change Mapping
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 6. TEST SEND LAB TAB */}
          <TabsContent value="test_lab" className="mt-6 space-y-6">
            <Card className="max-w-2xl mx-auto border-slate-200 shadow-xs bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Send className="h-4 w-4 text-blue-600" /> Super Master Admin Test Lab
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Safely test email delivery through local Mailu Postfix SMTP without modifying live user states.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSendTest}>
                <CardContent className="p-5 space-y-4 text-xs">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Recipient Email Address</Label>
                    <Input
                      type="email"
                      required
                      placeholder="e.g. naumancheema643@gmail.com"
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      className="text-xs bg-slate-50 border-slate-300"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Select Sender Identity</Label>
                      <Select value={testSenderKey} onValueChange={setTestSenderKey}>
                        <SelectTrigger className="text-xs bg-slate-50 border-slate-300">
                          <SelectValue placeholder="Select Sender" />
                        </SelectTrigger>
                        <SelectContent>
                          {senders.map((s) => (
                            <SelectItem key={s.key} value={s.key} className="text-xs font-medium">
                              {s.name} ({s.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Template to Test</Label>
                      <Select value={testTemplateKey} onValueChange={setTestTemplateKey}>
                        <SelectTrigger className="text-xs bg-slate-50 border-slate-300">
                          <SelectValue placeholder="Select Template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((t) => (
                            <SelectItem key={t.key} value={t.key} className="text-xs font-medium">
                              {t.name} ({t.key})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Custom Test Subject (Optional)</Label>
                    <Input
                      value={testSubject}
                      onChange={(e) => setTestSubject(e.target.value)}
                      className="text-xs bg-slate-50 border-slate-300"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Custom Message Payload (Optional)</Label>
                    <Textarea
                      rows={3}
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      className="text-xs bg-slate-50 border-slate-300 leading-relaxed"
                    />
                  </div>
                </CardContent>
                <CardFooter className="bg-slate-50 border-t border-slate-100 py-3 flex justify-end">
                  <Button type="submit" disabled={testSending} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-5">
                    {testSending ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Dispatching via Mailu...
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5 mr-2" /> Send Test Email
                      </>
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          {/* 7. DELIVERY LOGS TAB */}
          <TabsContent value="logs" className="mt-6 space-y-6">
            <Card className="border-slate-200 shadow-xs bg-white">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900">Email Delivery Audit Trail</CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Total logged dispatches: <strong>{logsTotal}</strong> (All secret tokens/passwords strictly excluded)
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-64">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        placeholder="Search recipient or subject..."
                        value={logSearch}
                        onChange={(e) => setLogSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && loadLogs(1)}
                        className="text-xs pl-8 bg-slate-50 border-slate-300 h-8"
                      />
                    </div>
                    <Select
                      value={logStatusFilter}
                      onValueChange={(val) => {
                        setLogStatusFilter(val);
                        setTimeout(() => loadLogs(1), 50);
                      }}
                    >
                      <SelectTrigger className="text-xs bg-slate-50 border-slate-300 h-8 w-28 font-medium">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                        <SelectItem value="sent" className="text-xs">Sent / Delivered</SelectItem>
                        <SelectItem value="failed" className="text-xs">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-y border-slate-200 text-slate-600 uppercase font-bold text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4">Event Type</th>
                        <th className="py-2.5 px-4">Recipient</th>
                        <th className="py-2.5 px-4">Sender Address</th>
                        <th className="py-2.5 px-4">Subject</th>
                        <th className="py-2.5 px-4">Message ID</th>
                        <th className="py-2.5 px-4">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-slate-400">
                            No delivery logs matching the current filter.
                          </td>
                        </tr>
                      ) : (
                        logs.map((l) => (
                          <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4">
                              {l.status === "sent" || l.status === "delivered" ? (
                                <Badge className="bg-emerald-100 text-emerald-700 text-[10px] uppercase font-bold border-0">
                                  Sent
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                                  Failed
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800">
                              {l.eventName.replace("_", " ").toUpperCase()}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-700">{l.recipientEmail}</td>
                            <td className="py-3 px-4 font-mono text-slate-600">{l.senderEmail}</td>
                            <td className="py-3 px-4 text-slate-700 truncate max-w-xs">{l.subject}</td>
                            <td className="py-3 px-4 font-mono text-[10px] text-slate-400 truncate max-w-[120px]">
                              {l.messageId || "—"}
                            </td>
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                              {l.sentAt ? new Date(l.sentAt).toLocaleString() : "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* SENDER CREATE / EDIT MODAL */}
      <Dialog open={senderModalOpen} onOpenChange={setSenderModalOpen}>
        <DialogContent className="sm:max-w-md bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingSender ? "Edit Sender Identity" : "Add Sender Identity"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Configure an official sender identity mapped to your mail server at <strong>mail.altrixcore.com</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSender} className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Identifier Key</Label>
              <Input
                required
                disabled={!!editingSender}
                placeholder="e.g. security, support, billing"
                value={senderFormKey}
                onChange={(e) => setSenderFormKey(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Sender Display Name</Label>
              <Input
                required
                placeholder="e.g. AltRix Security HQ"
                value={senderFormName}
                onChange={(e) => setSenderFormName(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Sender Email Address</Label>
              <Input
                type="email"
                required
                placeholder="e.g. security@altrixcore.com"
                value={senderFormEmail}
                onChange={(e) => setSenderFormEmail(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Reply-To Address (Optional)</Label>
              <Input
                type="email"
                placeholder="e.g. support@altrixcore.com"
                value={senderFormReplyTo}
                onChange={(e) => setSenderFormReplyTo(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Label className="text-xs font-bold">Set as Default Sender</Label>
              <Switch checked={senderFormIsDefault} onCheckedChange={setSenderFormIsDefault} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">Active Identity</Label>
              <Switch checked={senderFormIsActive} onCheckedChange={setSenderFormIsActive} />
            </div>
            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setSenderModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={savingSender} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                {savingSender ? "Saving..." : "Save Identity"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ASSET CREATE MODAL */}
      <Dialog open={assetModalOpen} onOpenChange={setAssetModalOpen}>
        <DialogContent className="sm:max-w-md bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Register Brand Asset</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Add a hosted brand logo, icon, or badge for use in email headers and footers.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveAsset} className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Asset Label Name</Label>
              <Input
                required
                placeholder="e.g. AltRix Primary Dark Logo"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Asset Type</Label>
              <Select value={assetType} onValueChange={setAssetType}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary_logo" className="text-xs">Primary Logo</SelectItem>
                  <SelectItem value="secondary_logo" className="text-xs">Secondary Logo</SelectItem>
                  <SelectItem value="brand_icon" className="text-xs">Brand Icon Mark</SelectItem>
                  <SelectItem value="custom_badge" className="text-xs">Custom Badge / Seal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Hosted URL</Label>
              <Input
                required
                placeholder="https://altrixcore.com/altrix-logo.png"
                value={assetUrl}
                onChange={(e) => setAssetUrl(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Dimensions (Optional)</Label>
              <Input
                placeholder="e.g. 512x140"
                value={assetDimensions}
                onChange={(e) => setAssetDimensions(e.target.value)}
                className="text-xs"
              />
            </div>
            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setAssetModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={savingAsset} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                {savingAsset ? "Registering..." : "Register Asset"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EVENT ROUTING MODAL */}
      <Dialog open={mappingModalOpen} onOpenChange={setMappingModalOpen}>
        <DialogContent className="sm:max-w-md bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Edit Event Mapping: <code className="text-blue-600">{editingMapping?.eventName}</code>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Select which sender address and email template will be automatically used when this event occurs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Sender Identity</Label>
              <Select value={mappingFormSender} onValueChange={setMappingFormSender}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select Sender" />
                </SelectTrigger>
                <SelectContent>
                  {senders.map((s) => (
                    <SelectItem key={s.key} value={s.key} className="text-xs font-medium">
                      {s.name} ({s.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Email Template</Label>
              <Select value={mappingFormTemplate} onValueChange={setMappingFormTemplate}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select Template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.key} value={t.key} className="text-xs font-medium">
                      {t.name} ({t.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setMappingModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSaveMapping} disabled={savingMapping} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
              {savingMapping ? "Updating..." : "Update Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VERSION HISTORY MODAL */}
      <Dialog open={versionsModalOpen} onOpenChange={setVersionsModalOpen}>
        <DialogContent className="sm:max-w-xl bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-blue-600" /> Revision History: {selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Restore previously saved revisions of this transactional email template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[420px] overflow-y-auto pr-1">
            {loadingVersions ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading revisions...</div>
            ) : templateVersions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No archived previous versions found for this template yet.
              </div>
            ) : (
              templateVersions.map((v) => (
                <div key={v.id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-bold">v{v.version}</Badge>
                      <span className="font-semibold text-slate-900">{v.subject}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Archived at: {new Date(v.createdAt).toLocaleString()}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestoreVersion(v.id)}
                    className="text-xs font-bold text-blue-700 border-blue-200 hover:bg-blue-50"
                  >
                    Restore
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setVersionsModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SuperAdminShell>
  );
}
