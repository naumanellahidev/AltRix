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
  Sliders,
  Terminal,
  Lock,
  ArrowUpRight,
  Zap,
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

interface StaffInvitation {
  id: string;
  email: string;
  role: string;
  displayName: string;
  status: string;
  schoolId?: string | null;
  campusId?: string | null;
  schoolName: string;
  campusName: string;
  token?: string | null;
  activationUrl?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  openedAt?: string | null;
  isExpired: boolean;
}

interface SystemWarning {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  recipient: string;
  sender: string;
  subject: string;
  timestamp?: string | null;
  details: string;
  action: string;
  invitationId?: string;
  logId?: string;
}

interface DispatchesEventSummary {
  eventName: string;
  count: number;
  successful: number;
  failed: number;
  lastDispatched?: string | null;
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

  // Clickable KPI & Diagnostic Modals
  const [dispatchesModalOpen, setDispatchesModalOpen] = useState(false);
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [pendingInvitesModalOpen, setPendingInvitesModalOpen] = useState(false);
  const [warningsModalOpen, setWarningsModalOpen] = useState(false);
  const [failedLogModalOpen, setFailedLogModalOpen] = useState(false);

  // Diagnostic & Breakdown Data
  const [pendingInvitations, setPendingInvitations] = useState<StaffInvitation[]>([]);
  const [loadingPendingInvites, setLoadingPendingInvites] = useState(false);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

  const [warnings, setWarnings] = useState<SystemWarning[]>([]);
  const [selectedWarning, setSelectedWarning] = useState<SystemWarning | null>(null);
  const [selectedFailedLog, setSelectedFailedLog] = useState<EmailLog | null>(null);

  const [dispatchesEvents, setDispatchesEvents] = useState<DispatchesEventSummary[]>([]);
  const [loadingDispatches, setLoadingDispatches] = useState(false);

  // Realtime Telemetry Sync State
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());
  const [isSyncing, setIsSyncing] = useState(false);

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
    footerText: "The AI-Powered Institute Operating System",
    legalDisclaimer: "This official communication was securely generated by Altrix Core on behalf of the registered institution.",
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
  const loadLogs = async (page = 1, silent = false) => {
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
      if (!silent) console.error("Failed to load email logs:", err);
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

  // Fetch Pending Staff Invitations
  const loadPendingInvitations = async () => {
    try {
      setLoadingPendingInvites(true);
      const res = await apiClient.get("/super_admin/email/pending-invitations");
      if (res.data?.invitations) {
        setPendingInvitations(res.data.invitations);
      }
    } catch (err) {
      console.error("Failed to load pending invitations:", err);
    } finally {
      setLoadingPendingInvites(false);
    }
  };

  // Resend Staff Invitation
  const handleResendStaffInvite = async (inviteId: string) => {
    try {
      setResendingInviteId(inviteId);
      const res = await apiClient.post(`/super_admin/email/pending-invitations/${inviteId}/resend`);
      toast.success(res.data?.message || "Invitation re-dispatched with fresh 48h activation token!");
      await Promise.all([loadPendingInvitations(), loadOverview(), loadLogs(1, true)]);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to resend invitation");
    } finally {
      setResendingInviteId(null);
    }
  };

  // Revoke Staff Invitation
  const handleRevokeStaffInvite = async (inviteId: string) => {
    try {
      setRevokingInviteId(inviteId);
      await apiClient.post(`/super_admin/email/pending-invitations/${inviteId}/revoke`);
      setPendingInvitations(prev => prev.filter(inv => inv.id !== inviteId));
      toast.success("Invitation token successfully revoked.");
      await Promise.all([loadPendingInvitations(), loadOverview()]);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to revoke token");
    } finally {
      setRevokingInviteId(null);
    }
  };

  // Fetch Live System Warnings
  const loadWarnings = async () => {
    try {
      const res = await apiClient.get("/super_admin/email/warnings");
      if (res.data?.warnings) {
        setWarnings(res.data.warnings);
      }
    } catch (err) {
      console.error("Failed to load warnings:", err);
    }
  };

  // Fetch Dispatches Breakdown
  const loadDispatchesBreakdown = async () => {
    try {
      setLoadingDispatches(true);
      const res = await apiClient.get("/super_admin/email/dispatches-breakdown");
      if (res.data?.events24h) {
        setDispatchesEvents(res.data.events24h);
      }
    } catch (err) {
      console.error("Failed to load dispatches breakdown:", err);
    } finally {
      setLoadingDispatches(false);
    }
  };

  // Trigger Dispatches Modal
  const openDispatchesModal = async () => {
    setDispatchesModalOpen(true);
    await loadDispatchesBreakdown();
  };

  // Trigger Pending Invites Modal
  const openPendingInvitesModal = async () => {
    setPendingInvitesModalOpen(true);
    await loadPendingInvitations();
  };

  // Open Log Failure Diagnostics Modal
  const openFailedLogModal = (log: EmailLog) => {
    setSelectedFailedLog(log);
    setFailedLogModalOpen(true);
  };

  // Realtime Silent Polling Sync
  const performSilentSync = async () => {
    try {
      setIsSyncing(true);
      await Promise.allSettled([
        loadOverview(),
        loadLogs(logsPage, true),
        loadWarnings(),
        loadMtaHealth(),
      ]);
      setLastSyncedAt(new Date());
    } finally {
      setIsSyncing(false);
    }
  };

  // Load all on mount & start 12s Realtime Polling Sync
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.allSettled([
        loadOverview(),
        loadBranding(),
        loadAssets(),
        loadSenders(),
        loadTemplates(),
        loadMappings(),
        loadLogs(),
        loadMtaHealth(),
        loadWarnings(),
        loadPendingInvitations(),
      ]);
      setLastSyncedAt(new Date());
      setLoading(false);
    };
    init();

    // 12-second background live sync loop
    const syncTimer = setInterval(() => {
      performSilentSync();
    }, 12000);

    return () => clearInterval(syncTimer);
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

  // Reset all templates to official AltRix defaults
  const handleResetTemplatesToDefaults = async () => {
    try {
      await apiClient.post("/super_admin/email/templates/reset-defaults");
      toast.success("All templates updated to latest official AltRix branding defaults!");
      await loadTemplates(selectedCategory);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to reset templates");
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
      subtitle="Configure AltRix brand identity, sender aliases, responsive HTML templates & monitor VPS delivery node"
      actions={
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
          {/* Realtime Live Sync Indicator Pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 text-[11px] font-medium text-slate-600 border border-slate-200/80 shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-slate-800">Realtime Synced</span>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-[10px] text-slate-500">
              {lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <a
            href="https://mail.altrixcore.com/login"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl text-xs font-bold h-8 sm:h-9 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 transition-all shadow-2xs hover:shadow-xs hover:border-blue-300"
            title="Open Mail Platform Admin Control Center (Domains, Mailboxes, DKIM, Anti-Spam)"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5 text-blue-600 shrink-0" /> Mail Server Admin
          </a>
          <a
            href="https://mail.altrixcore.com/webmail"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl text-xs font-bold h-8 sm:h-9 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 transition-all shadow-2xs hover:shadow-xs hover:border-indigo-300"
            title="Open Roundcube Webmail Inbox (Send & Receive institutional mail)"
          >
            <Inbox className="h-3.5 w-3.5 mr-1.5 text-indigo-600 shrink-0" /> Webmail Client
          </a>
          <Button
            size="sm"
            disabled={isSyncing}
            onClick={async () => {
              await Promise.allSettled([
                loadOverview(),
                loadBranding(),
                loadAssets(),
                loadSenders(),
                loadTemplates(selectedCategory),
                loadMappings(),
                loadLogs(),
                loadMtaHealth(),
                loadWarnings(),
                loadPendingInvitations(),
              ]);
              setLastSyncedAt(new Date());
              toast.success("Refreshed all email platform telemetry");
            }}
            className="text-xs h-8 sm:h-9 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-xs hover:shadow-md transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 shrink-0 ${isSyncing ? "animate-spin" : ""}`} /> Refresh Telemetry
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Responsive Navigation Tabs Bar */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="bg-white p-1 rounded-2xl border border-slate-200/80 shadow-2xs w-full overflow-hidden">
            <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] py-0.5">
              <TabsList className="flex items-center w-max min-w-full bg-slate-100/90 p-1 rounded-xl gap-1 h-auto flex-nowrap">
                <TabsTrigger
                  value="overview"
                  className="text-xs font-bold gap-1.5 rounded-lg py-2 px-3.5 shrink-0 whitespace-nowrap text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-xs transition-all"
                >
                  <Activity className="h-3.5 w-3.5 shrink-0" /> Overview
                </TabsTrigger>
                <TabsTrigger
                  value="branding"
                  className="text-xs font-bold gap-1.5 rounded-lg py-2 px-3.5 shrink-0 whitespace-nowrap text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-xs transition-all"
                >
                  <Palette className="h-3.5 w-3.5 shrink-0" /> Brand Identity
                </TabsTrigger>
                <TabsTrigger
                  value="senders"
                  className="text-xs font-bold gap-1.5 rounded-lg py-2 px-3.5 shrink-0 whitespace-nowrap text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-xs transition-all"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" /> Sender Profiles
                </TabsTrigger>
                <TabsTrigger
                  value="templates"
                  className="text-xs font-bold gap-1.5 rounded-lg py-2 px-3.5 shrink-0 whitespace-nowrap text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-xs transition-all"
                >
                  <FileCode2 className="h-3.5 w-3.5 shrink-0" /> Template Studio
                </TabsTrigger>
                <TabsTrigger
                  value="routing"
                  className="text-xs font-bold gap-1.5 rounded-lg py-2 px-3.5 shrink-0 whitespace-nowrap text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-xs transition-all"
                >
                  <Layers className="h-3.5 w-3.5 shrink-0" /> Event Routing
                </TabsTrigger>
                <TabsTrigger
                  value="test_lab"
                  className="text-xs font-bold gap-1.5 rounded-lg py-2 px-3.5 shrink-0 whitespace-nowrap text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-xs transition-all"
                >
                  <Send className="h-3.5 w-3.5 shrink-0" /> Live Test Lab
                </TabsTrigger>
                <TabsTrigger
                  value="logs"
                  className="text-xs font-bold gap-1.5 rounded-lg py-2 px-3.5 shrink-0 whitespace-nowrap text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-xs transition-all"
                >
                  <ListFilter className="h-3.5 w-3.5 shrink-0" /> Delivery Logs
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* 1. OVERVIEW TAB */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            {/* Clickable KPI Top Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Dispatched (Clickable -> Opens 24h Breakdown Modal) */}
              <Card
                onClick={openDispatchesModal}
                className="border border-slate-200/90 rounded-2xl bg-white shadow-xs hover:shadow-md hover:border-blue-400 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer group"
                title="Click to view 24-hour event breakdown and dispatches distribution"
              >
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">24h Dispatched</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center ring-4 ring-blue-500/5 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Send className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="pt-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-black text-slate-900 tracking-tight font-sans">
                      {telemetry?.sent24h ?? 0}
                    </span>
                    <span className="bg-blue-100 text-blue-800 font-bold text-[10px] uppercase border border-blue-200 px-2.5 py-0.5 rounded-full group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-colors">
                      Inspect ↗
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 font-medium">All transactional event triggers</p>
                </CardContent>
              </Card>

              {/* Card 2: Success Rate (Clickable -> Opens Health Analytics Modal) */}
              <Card
                onClick={() => setHealthModalOpen(true)}
                className="border border-slate-200/90 rounded-2xl bg-white shadow-xs hover:shadow-md hover:border-emerald-400 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer group"
                title="Click to view MTA node health & delivery success metrics"
              >
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">24h Success Rate</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center ring-4 ring-emerald-500/5 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="pt-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-black text-emerald-600 tracking-tight font-sans">
                      {telemetry?.successRate24h ?? 100}%
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase border border-emerald-200 px-2.5 py-0.5 rounded-full group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-colors">
                      Health ↗
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 font-medium">Successful relay through local MTA</p>
                </CardContent>
              </Card>

              {/* Card 3: Configured Senders (Clickable -> Jumps to Senders Tab) */}
              <Card
                onClick={() => {
                  setActiveTab("senders");
                  toast.info("Navigated to Sender Profiles (9 active aliases)");
                }}
                className="border border-slate-200/90 rounded-2xl bg-white shadow-xs hover:shadow-md hover:border-purple-400 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer group"
                title="Click to jump to Sender Profiles and manage alias identities"
              >
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Configured Senders</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="h-9 w-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center ring-4 ring-purple-500/5 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <Mail className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="pt-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-black text-purple-600 tracking-tight font-sans">
                      {telemetry?.activeSenders ?? senders.length}
                    </span>
                    <span className="bg-purple-100 text-purple-800 font-bold text-[10px] uppercase border border-purple-200 px-2.5 py-0.5 rounded-full group-hover:bg-purple-600 group-hover:text-white group-hover:border-purple-600 transition-colors">
                      Manage ↗
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 font-medium">Official AltRix brand aliases</p>
                </CardContent>
              </Card>

              {/* Card 4: Pending Invites (Clickable -> Opens Pending Tokens Modal) */}
              <Card
                onClick={openPendingInvitesModal}
                className="border border-slate-200/90 rounded-2xl bg-white shadow-xs hover:shadow-md hover:border-amber-400 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer group"
                title="Click to view and manage active staff invitation tokens"
              >
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Pending Staff Invites</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center ring-4 ring-amber-500/5 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Clock className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="pt-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-black text-amber-600 tracking-tight font-sans">
                      {telemetry?.pendingInvitations ?? pendingInvitations.length}
                    </span>
                    <span className="bg-amber-100 text-amber-800 font-bold text-[10px] uppercase border border-amber-200 px-2.5 py-0.5 rounded-full group-hover:bg-amber-600 group-hover:text-white group-hover:border-amber-600 transition-colors">
                      Tokens Active ↗
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 font-medium">Active single-use activation tokens</p>
                </CardContent>
              </Card>
            </div>

            {/* Active System Warnings & Diagnostic Details Banner */}
            {warnings.length > 0 && (
              <Card className="border border-amber-300/80 bg-gradient-to-r from-amber-50/90 via-amber-50/50 to-orange-50/80 rounded-2xl shadow-xs overflow-hidden">
                <CardHeader className="p-4 sm:p-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/60">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                      <AlertTriangle className="h-4 w-4 animate-bounce" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-amber-950 flex items-center gap-2">
                        Active Infrastructure Warnings ({warnings.length})
                      </CardTitle>
                      <CardDescription className="text-xs text-amber-800/90 mt-0.5">
                        Actionable diagnostic alerts detected across email delivery nodes and invitation tokens.
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setWarningsModalOpen(true)}
                    className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold h-8 rounded-xl shadow-xs self-start sm:self-auto shrink-0"
                  >
                    View All Diagnostic Details <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </CardHeader>
                <CardContent className="p-4 space-y-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {warnings.slice(0, 4).map((w) => (
                      <div
                        key={w.id}
                        onClick={() => {
                          setSelectedWarning(w);
                          setWarningsModalOpen(true);
                        }}
                        className="p-3 rounded-xl bg-white/90 border border-amber-200 hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${w.severity === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                            <p className="text-xs font-bold text-slate-900 truncate">{w.title}</p>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1 line-clamp-1 font-mono">{w.details}</p>
                        </div>
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full shrink-0">
                          Inspect ↗
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* VPS Infrastructure Node Card (Clean Brand-Matched Light Theme) */}
            <Card className="border border-slate-200/90 rounded-2xl bg-white shadow-xs overflow-hidden">
              <CardHeader className="p-5 pb-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shadow-2xs">
                    <Server className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                      VPS Mail Infrastructure Node (MTA Engine)
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-0.5">
                      Subdomain: <strong className="text-blue-600 font-mono font-bold">mail.altrixcore.com</strong> <span className="text-slate-300">•</span> Host IP: <span className="text-slate-600 font-mono font-semibold">169.58.111.159</span>
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold px-3.5 py-1.5 rounded-full flex items-center shadow-2xs">
                    <Radio className="h-3 w-3 mr-1.5 text-emerald-600 animate-pulse" /> Postfix SMTP Online ({mtaHealth?.latencyMs || 3.3}ms)
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Box 1: SSL */}
                  <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 hover:bg-white hover:shadow-xs transition-all space-y-1.5">
                    <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider block">SSL / TLS Certificate</span>
                    <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" /> Let's Encrypt Dedicated
                    </p>
                    <span className="text-[11px] text-emerald-700 font-semibold block">TLS 1.3 Strict HTTPS Protocol</span>
                  </div>

                  {/* Box 2: Outbound Relay */}
                  <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 hover:bg-white hover:shadow-xs transition-all space-y-1.5">
                    <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider block">Outbound Relay Port</span>
                    <p className="font-bold text-slate-900 text-sm font-mono flex items-center gap-1.5">
                      <Zap className="h-4 w-4 text-blue-600 shrink-0" /> 127.0.0.1:25
                    </p>
                    <span className="text-[11px] text-blue-700 font-semibold block">Docker RELAYNETS Authorized</span>
                  </div>

                  {/* Box 3: Admin Console */}
                  <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 hover:bg-white hover:shadow-xs transition-all space-y-1.5">
                    <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider block">Server Admin Console</span>
                    <a
                      href="https://mail.altrixcore.com/login"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1.5 transition-colors"
                    >
                      mail.altrixcore.com/login <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <span className="text-[11px] text-slate-500 font-medium block">Domains, Mailboxes & DKIM</span>
                  </div>

                  {/* Box 4: Webmail Gateway */}
                  <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 hover:bg-white hover:shadow-xs transition-all space-y-1.5">
                    <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider block">Webmail Client Gateway</span>
                    <a
                      href="https://mail.altrixcore.com/webmail"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1.5 transition-colors"
                    >
                      mail.altrixcore.com/webmail <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <span className="text-[11px] text-slate-500 font-medium block">Roundcube Webmail Inbox</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Transactional Deliveries Table */}
            <Card className="border border-slate-200/90 rounded-2xl bg-white shadow-xs overflow-hidden">
              <CardHeader className="p-4 sm:p-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ListFilter className="h-4 w-4 text-blue-600 shrink-0" /> Recent Transactional Deliveries
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">Live audit stream of outgoing platform communications</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("logs")}
                  className="text-xs h-8 font-bold text-blue-600 border-blue-200 hover:bg-blue-50 rounded-xl self-start sm:self-auto"
                >
                  View Full Audit Log <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-xs text-left min-w-[680px]">
                    <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 uppercase font-bold text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3.5 px-5 whitespace-nowrap">Status</th>
                        <th className="py-3.5 px-5 whitespace-nowrap">Event</th>
                        <th className="py-3.5 px-5">Recipient</th>
                        <th className="py-3.5 px-5">Sender Identity</th>
                        <th className="py-3.5 px-5">Subject</th>
                        <th className="py-3.5 px-5 text-right whitespace-nowrap">Dispatched At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            <div className="space-y-2">
                              <Inbox className="h-8 w-8 text-slate-300 mx-auto" />
                              <p className="font-semibold text-slate-600">No outgoing transactional emails logged yet</p>
                              <p className="text-xs text-slate-400">Use the Test Lab tab to send a live test dispatch.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        logs.slice(0, 8).map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              {item.status === "sent" || item.status === "delivered" ? (
                                <span className="inline-flex items-center bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase border border-emerald-300/80 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                                  Sent
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openFailedLogModal(item)}
                                  className="inline-flex items-center bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[10px] uppercase border border-rose-300 px-2.5 py-0.5 rounded-full whitespace-nowrap cursor-pointer transition-all hover:scale-105"
                                  title="Click to view failure error trace and diagnostic details"
                                >
                                  <AlertTriangle className="h-3 w-3 mr-1 text-rose-600" /> Failed ↗
                                </button>
                              )}
                            </td>
                            <td className="py-3.5 px-5 whitespace-nowrap font-bold text-slate-900">
                              <span className="inline-flex items-center whitespace-nowrap bg-slate-100 text-slate-800 border border-slate-200/90 px-3 py-1 rounded-full text-[11px] font-mono font-semibold tracking-wide shadow-2xs">
                                {item.eventName.replaceAll("_", " ").toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3.5 px-5 font-mono text-slate-800 font-semibold">{item.recipientEmail}</td>
                            <td className="py-3.5 px-5 font-mono text-slate-500">{item.senderEmail}</td>
                            <td className="py-3.5 px-5 text-slate-700 font-medium truncate max-w-xs">{item.subject}</td>
                            <td className="py-3.5 px-5 text-slate-500 text-right whitespace-nowrap font-mono text-[11px]">
                              {item.sentAt ? new Date(item.sentAt).toLocaleString() : "—"}
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

          {/* 2. BRANDING & ASSETS TAB */}
          <TabsContent value="branding" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Branding Config Form */}
              <div className="lg:col-span-7">
                <Card className="border border-slate-200/80 rounded-2xl bg-white shadow-xs">
                  <CardHeader className="p-5 pb-3 border-b border-slate-100">
                    <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Palette className="h-4 w-4 text-blue-600" /> Global Visual Identity & Email Branding
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-0.5">
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
                            className="text-xs bg-slate-50 border-slate-200 rounded-xl"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-700">Header Logo Layout</Label>
                          <Select
                            value={brandForm.headerLogoType}
                            onValueChange={(val) => setBrandForm({ ...brandForm, headerLogoType: val })}
                          >
                            <SelectTrigger className="text-xs bg-slate-50 border-slate-200 rounded-xl">
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
                          className="text-xs font-mono bg-slate-50 border-slate-200 rounded-xl"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">Brand Mark Icon URL (Square Icon)</Label>
                        <Input
                          value={brandForm.brandIconUrl}
                          onChange={(e) => setBrandForm({ ...brandForm, brandIconUrl: e.target.value })}
                          className="text-xs font-mono bg-slate-50 border-slate-200 rounded-xl"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-700">Primary Color</Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={brandForm.primaryColor}
                              onChange={(e) => setBrandForm({ ...brandForm, primaryColor: e.target.value })}
                              className="h-9 w-9 rounded-xl border border-slate-300 p-0.5 cursor-pointer shrink-0"
                            />
                            <Input
                              value={brandForm.primaryColor}
                              onChange={(e) => setBrandForm({ ...brandForm, primaryColor: e.target.value })}
                              className="text-xs font-mono rounded-xl w-full"
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
                              className="h-9 w-9 rounded-xl border border-slate-300 p-0.5 cursor-pointer shrink-0"
                            />
                            <Input
                              value={brandForm.accentColor}
                              onChange={(e) => setBrandForm({ ...brandForm, accentColor: e.target.value })}
                              className="text-xs font-mono rounded-xl w-full"
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
                              className="h-9 w-9 rounded-xl border border-slate-300 p-0.5 cursor-pointer shrink-0"
                            />
                            <Input
                              value={brandForm.secondaryColor}
                              onChange={(e) => setBrandForm({ ...brandForm, secondaryColor: e.target.value })}
                              className="text-xs font-mono rounded-xl w-full"
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
                            className="text-xs bg-slate-50 border-slate-200 rounded-xl font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-700">Website Portal URL</Label>
                          <Input
                            value={brandForm.websiteUrl}
                            onChange={(e) => setBrandForm({ ...brandForm, websiteUrl: e.target.value })}
                            className="text-xs bg-slate-50 border-slate-200 rounded-xl font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">Footer Tagline</Label>
                        <Input
                          value={brandForm.footerText}
                          onChange={(e) => setBrandForm({ ...brandForm, footerText: e.target.value })}
                          className="text-xs bg-slate-50 border-slate-200 rounded-xl"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">Legal Compliance Disclaimer</Label>
                        <Textarea
                          rows={2}
                          value={brandForm.legalDisclaimer || ""}
                          onChange={(e) => setBrandForm({ ...brandForm, legalDisclaimer: e.target.value })}
                          className="text-xs bg-slate-50 border-slate-200 rounded-xl"
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="bg-slate-50/80 border-t border-slate-100 p-4 flex justify-end">
                      <Button type="submit" disabled={savingBrand} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 rounded-xl shadow-xs w-full sm:w-auto">
                        {savingBrand ? "Saving Branding..." : "Save Branding Configuration"}
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              </div>

              {/* Brand Asset Library */}
              <div className="lg:col-span-5 space-y-4">
                <Card className="border border-slate-200/80 rounded-2xl bg-white shadow-xs">
                  <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Image className="h-4 w-4 text-indigo-600 shrink-0" /> Managed Brand Assets
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500 mt-0.5">Official images used in templates</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setAssetModalOpen(true)} className="text-xs bg-indigo-600 hover:bg-indigo-700 font-bold h-8 rounded-xl self-start sm:self-auto">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Asset
                    </Button>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {assets.map((ast) => (
                      <div key={ast.id} className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                        <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center p-1.5 overflow-hidden shrink-0 border border-slate-800 shadow-xs">
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
                          className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 rounded-lg shrink-0"
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
            <Card className="border border-slate-200/80 rounded-2xl bg-white shadow-xs overflow-hidden">
              <CardHeader className="p-4 sm:p-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-600 shrink-0" /> Official AltRix Sender Identities
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Configure authorized outgoing mail addresses mapped to mailboxes on <strong>mail.altrixcore.com</strong>
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => openSenderModal()} className="text-xs bg-blue-600 hover:bg-blue-700 font-bold rounded-xl h-8 self-start sm:self-auto">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Identity
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-xs text-left min-w-[700px]">
                    <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-5 whitespace-nowrap">Identifier Key</th>
                        <th className="py-3 px-5">Display Name</th>
                        <th className="py-3 px-5">Sender Email Address</th>
                        <th className="py-3 px-5">Reply-To Address</th>
                        <th className="py-3 px-5 whitespace-nowrap">Status</th>
                        <th className="py-3 px-5 text-right whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {senders.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-5 font-mono font-bold text-blue-700 whitespace-nowrap">
                            {s.key}
                            {s.isDefault && (
                              <Badge className="ml-2 bg-blue-50 text-blue-700 text-[9px] uppercase font-bold border border-blue-200 rounded-full px-2">
                                Default
                              </Badge>
                            )}
                          </td>
                          <td className="py-3.5 px-5 font-semibold text-slate-900">{s.name}</td>
                          <td className="py-3.5 px-5 font-mono text-slate-700">{s.email}</td>
                          <td className="py-3.5 px-5 font-mono text-slate-500">{s.replyTo || "—"}</td>
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            {s.isActive ? (
                              <Badge className="bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200/80 rounded-full px-2.5">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-400 text-[10px] rounded-full px-2.5">Disabled</Badge>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-right whitespace-nowrap space-x-1">
                            <Button variant="ghost" size="sm" onClick={() => openSenderModal(s)} className="h-7 px-2.5 text-xs rounded-lg">
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
            {/* Category Filter Bar & Defaults Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100/90 p-2 rounded-2xl border border-slate-200/60 shadow-2xs">
              <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] w-full sm:w-auto py-0.5">
                <div className="flex items-center gap-1.5 w-max sm:flex-wrap">
                  {categories.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat.key);
                        loadTemplates(cat.key);
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 whitespace-nowrap transition-all ${
                        selectedCategory === cat.key
                          ? "bg-white text-blue-700 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetTemplatesToDefaults}
                className="text-xs font-bold text-slate-700 bg-white border-slate-200 hover:bg-slate-50 rounded-xl h-8 shrink-0 self-start sm:self-auto shadow-2xs"
                title="Reset all email templates to the latest official AltRix brand defaults"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-blue-600 shrink-0" /> Re-sync Brand Defaults
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Template Selection Cards */}
              <div className="lg:col-span-4 space-y-2.5 max-h-[320px] lg:max-h-[780px] overflow-y-auto pr-1">
                {templates.map((tmpl) => {
                  const isSelected = selectedTemplate?.id === tmpl.id;
                  return (
                    <Card
                      key={tmpl.id}
                      onClick={() => handleSelectTemplate(tmpl)}
                      className={`cursor-pointer transition-all duration-200 border rounded-2xl ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/50 shadow-xs ring-2 ring-blue-600/20"
                          : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs"
                      }`}
                    >
                      <CardHeader className="p-4 pb-1.5">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-[10px] font-bold uppercase bg-slate-100 text-slate-700 rounded-md">
                            {tmpl.category}
                          </Badge>
                          <span className="text-[10px] font-mono text-slate-400">{tmpl.key}</span>
                        </div>
                        <CardTitle className="text-xs font-bold text-slate-900 mt-1">{tmpl.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <p className="text-[11px] text-slate-500 truncate">{tmpl.subject}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Right Column: Template Editor & Dual Preview */}
              <div className="lg:col-span-8 space-y-4">
                {selectedTemplate ? (
                  <Card className="border border-slate-200/80 rounded-2xl bg-white shadow-xs">
                    <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <FileCode2 className="h-4 w-4 text-blue-600 shrink-0" /> {selectedTemplate.name}
                            <Badge variant="outline" className="text-[10px] font-bold text-blue-700 border-blue-200 rounded-md">
                              v{selectedTemplate.version || 1}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-500 mt-0.5">
                            Identifier: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-bold">{selectedTemplate.key}</code>
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={openVersionHistory}
                            className="text-xs border-slate-300 font-semibold text-slate-700 rounded-xl h-8 shrink-0"
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Revisions
                          </Button>
                          <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-bold shrink-0">
                            <button
                              type="button"
                              onClick={() => setPreviewTab("edit")}
                              className={`px-3 py-1 rounded-lg transition-all ${
                                previewTab === "edit" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Editor
                            </button>
                            <button
                              type="button"
                              onClick={handlePreview}
                              className={`px-3 py-1 rounded-lg transition-all ${
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
                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl h-8 shrink-0 ml-auto sm:ml-0"
                          >
                            {savingTemplate ? "Saving..." : "Save Template"}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 sm:p-5 space-y-4">
                      {previewTab === "edit" ? (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-700">Email Subject Line</Label>
                              <Input
                                value={templateEditSubject}
                                onChange={(e) => setTemplateEditSubject(e.target.value)}
                                className="text-xs bg-slate-50 border-slate-200 rounded-xl"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-700">Default Sender Address</Label>
                              <Select value={templateEditSenderKey} onValueChange={setTemplateEditSenderKey}>
                                <SelectTrigger className="text-xs bg-slate-50 border-slate-200 rounded-xl">
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
                              <Sparkles className="h-3.5 w-3.5 text-blue-600 shrink-0" /> Insert Dynamic Variable Tags
                            </Label>
                            <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 max-h-[140px] overflow-y-auto">
                              {(selectedTemplate.availableVariables.length > 0
                                ? selectedTemplate.availableVariables
                                : ["name", "email", "role", "tenant.name", "activation_link", "reset_link", "expires_in", "support_email", "year"]
                              ).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => insertVariable(v)}
                                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-700 text-[11px] font-mono font-semibold transition-colors shadow-2xs"
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
                              className="font-mono text-xs leading-relaxed bg-slate-950 text-slate-100 border-slate-800 p-4 rounded-xl shadow-inner w-full"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div className="p-3 bg-slate-100/80 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-slate-200/60">
                            <div className="flex items-center gap-2 truncate">
                              <span className="font-semibold text-slate-600 shrink-0">Subject:</span>
                              <span className="font-bold text-slate-900 truncate">{templateEditSubject}</span>
                            </div>
                            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs self-start sm:self-auto shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPreviewDevice("desktop")}
                                className={`h-7 px-2.5 text-xs rounded-md ${previewDevice === "desktop" ? "bg-slate-100 text-blue-700 font-bold" : "text-slate-500"}`}
                              >
                                <Monitor className="h-3.5 w-3.5 mr-1" /> Desktop
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPreviewDevice("mobile")}
                                className={`h-7 px-2.5 text-xs rounded-md ${previewDevice === "mobile" ? "bg-slate-100 text-blue-700 font-bold" : "text-slate-500"}`}
                              >
                                <Smartphone className="h-3.5 w-3.5 mr-1" /> Mobile
                              </Button>
                            </div>
                          </div>
                          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-inner bg-slate-900 p-2 sm:p-4 flex justify-center w-full">
                            <iframe
                              title="Live Email Preview"
                              srcDoc={previewHtml}
                              className={`rounded-xl bg-white border-0 shadow-lg transition-all duration-300 ${
                                previewDevice === "mobile" ? "w-[340px] max-w-full min-h-[500px]" : "w-full min-h-[500px]"
                              }`}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border border-slate-200/80 rounded-2xl bg-white text-center py-16 shadow-xs">
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
            <Card className="border border-slate-200/80 rounded-2xl bg-white shadow-xs overflow-hidden">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600 shrink-0" /> System Event &rarr; Sender Routing Matrix
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Control which official AltRix sender address and template dynamically handles each application event.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-xs text-left min-w-[750px]">
                    <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-5 whitespace-nowrap">System Event</th>
                        <th className="py-3 px-5">Description</th>
                        <th className="py-3 px-5">Assigned Sender Identity</th>
                        <th className="py-3 px-5">Assigned Template</th>
                        <th className="py-3 px-5 text-right whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mappings.map((m) => (
                        <tr key={m.eventName} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-5 whitespace-nowrap font-bold text-slate-900">
                            <span className="inline-flex items-center whitespace-nowrap bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-mono text-[11px] font-semibold border border-blue-200/70 shadow-2xs">
                              {m.eventName}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-slate-500 max-w-xs">{m.description || "—"}</td>
                          <td className="py-3.5 px-5">
                            <div className="font-semibold text-slate-900">{m.senderName || m.senderIdentityKey}</div>
                            <div className="text-[11px] font-mono text-slate-400">{m.senderEmail}</div>
                          </td>
                          <td className="py-3.5 px-5">
                            <div className="font-semibold text-slate-900">{m.templateName || m.templateKey}</div>
                            <div className="text-[11px] text-slate-400 truncate max-w-xs">{m.templateSubject}</div>
                          </td>
                          <td className="py-3.5 px-5 text-right whitespace-nowrap">
                            <Button variant="outline" size="sm" onClick={() => openMappingModal(m)} className="h-7 text-xs font-semibold rounded-lg">
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
            <Card className="max-w-2xl w-full mx-auto border border-slate-200/80 rounded-2xl bg-white shadow-xs overflow-hidden">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Send className="h-4 w-4 text-blue-600 shrink-0" /> Super Master Admin Test Lab
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Safely test email delivery through local Mailu Postfix SMTP without modifying live user states.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSendTest}>
                <CardContent className="p-4 sm:p-5 space-y-4 text-xs">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Recipient Email Address</Label>
                    <Input
                      type="email"
                      required
                      placeholder="e.g. naumancheema643@gmail.com"
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      className="text-xs bg-slate-50 border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Select Sender Identity</Label>
                      <Select value={testSenderKey} onValueChange={setTestSenderKey}>
                        <SelectTrigger className="text-xs bg-slate-50 border-slate-200 rounded-xl">
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
                        <SelectTrigger className="text-xs bg-slate-50 border-slate-200 rounded-xl">
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
                      className="text-xs bg-slate-50 border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Custom Message Payload (Optional)</Label>
                    <Textarea
                      rows={3}
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      className="text-xs bg-slate-50 border-slate-200 rounded-xl leading-relaxed"
                    />
                  </div>
                </CardContent>
                <CardFooter className="bg-slate-50/80 border-t border-slate-100 p-4 flex justify-end">
                  <Button type="submit" disabled={testSending} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 rounded-xl shadow-xs w-full sm:w-auto">
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
            <Card className="border border-slate-200/80 rounded-2xl bg-white shadow-xs overflow-hidden">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <ListFilter className="h-4 w-4 text-blue-600 shrink-0" /> Email Delivery Audit Trail
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-0.5">
                      Total logged dispatches: <strong>{logsTotal}</strong> (All secret tokens/passwords strictly excluded)
                    </CardDescription>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        placeholder="Search recipient or subject..."
                        value={logSearch}
                        onChange={(e) => setLogSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && loadLogs(1)}
                        className="text-xs pl-8 bg-slate-50 border-slate-200 rounded-xl h-8 w-full"
                      />
                    </div>
                    <Select
                      value={logStatusFilter}
                      onValueChange={(val) => {
                        setLogStatusFilter(val);
                        setTimeout(() => loadLogs(1), 50);
                      }}
                    >
                      <SelectTrigger className="text-xs bg-slate-50 border-slate-200 rounded-xl h-8 w-full sm:w-32 font-medium">
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
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-xs text-left min-w-[850px]">
                    <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-5 whitespace-nowrap">Status</th>
                        <th className="py-3 px-5 whitespace-nowrap">Event Type</th>
                        <th className="py-3 px-5">Recipient</th>
                        <th className="py-3 px-5">Sender Address</th>
                        <th className="py-3 px-5">Subject</th>
                        <th className="py-3 px-5">Message ID</th>
                        <th className="py-3 px-5 text-right whitespace-nowrap">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            No delivery logs matching the current filter.
                          </td>
                        </tr>
                      ) : (
                        logs.map((l) => (
                          <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              {l.status === "sent" || l.status === "delivered" ? (
                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 text-[10px] uppercase font-bold border border-emerald-200/80 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                                  Sent
                                </Badge>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openFailedLogModal(l)}
                                  className="inline-flex items-center bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[10px] uppercase border border-rose-300 px-2.5 py-0.5 rounded-full whitespace-nowrap cursor-pointer transition-all hover:scale-105"
                                  title="Click to view failure error trace and diagnostic details"
                                >
                                  <AlertTriangle className="h-3 w-3 mr-1 text-rose-600" /> Failed ↗
                                </button>
                              )}
                            </td>
                            <td className="py-3.5 px-5 whitespace-nowrap font-bold text-slate-900">
                              <span className="inline-flex items-center whitespace-nowrap bg-slate-100 text-slate-800 border border-slate-200/90 px-3 py-1 rounded-full text-[11px] font-mono font-semibold tracking-wide shadow-2xs">
                                {l.eventName.replaceAll("_", " ").toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3.5 px-5 font-mono text-slate-800 font-semibold">{l.recipientEmail}</td>
                            <td className="py-3.5 px-5 font-mono text-slate-500">{l.senderEmail}</td>
                            <td className="py-3.5 px-5 text-slate-700 truncate max-w-xs">{l.subject}</td>
                            <td className="py-3.5 px-5 font-mono text-[10px] text-slate-400 truncate max-w-[120px]">
                              {l.messageId || "—"}
                            </td>
                            <td className="py-3.5 px-5 text-slate-400 text-right whitespace-nowrap font-mono text-[11px]">
                              {l.sentAt ? new Date(l.sentAt).toLocaleString() : "—"}
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
        <DialogContent className="sm:max-w-md max-w-[95vw] w-full bg-white text-slate-900 rounded-2xl max-h-[90vh] overflow-y-auto">
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
                className="text-xs font-mono rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Sender Display Name</Label>
              <Input
                required
                placeholder="e.g. AltRix Security HQ"
                value={senderFormName}
                onChange={(e) => setSenderFormName(e.target.value)}
                className="text-xs rounded-xl"
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
                className="text-xs font-mono rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Reply-To Address (Optional)</Label>
              <Input
                type="email"
                placeholder="e.g. support@altrixcore.com"
                value={senderFormReplyTo}
                onChange={(e) => setSenderFormReplyTo(e.target.value)}
                className="text-xs font-mono rounded-xl"
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
              <Button type="button" variant="outline" size="sm" onClick={() => setSenderModalOpen(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={savingSender} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl">
                {savingSender ? "Saving..." : "Save Identity"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ASSET CREATE MODAL */}
      <Dialog open={assetModalOpen} onOpenChange={setAssetModalOpen}>
        <DialogContent className="sm:max-w-md max-w-[95vw] w-full bg-white text-slate-900 rounded-2xl max-h-[90vh] overflow-y-auto">
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
                className="text-xs rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Asset Type</Label>
              <Select value={assetType} onValueChange={setAssetType}>
                <SelectTrigger className="text-xs rounded-xl">
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
                className="text-xs font-mono rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Dimensions (Optional)</Label>
              <Input
                placeholder="e.g. 512x140"
                value={assetDimensions}
                onChange={(e) => setAssetDimensions(e.target.value)}
                className="text-xs rounded-xl"
              />
            </div>
            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setAssetModalOpen(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={savingAsset} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl">
                {savingAsset ? "Registering..." : "Register Asset"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EVENT ROUTING MODAL */}
      <Dialog open={mappingModalOpen} onOpenChange={setMappingModalOpen}>
        <DialogContent className="sm:max-w-md max-w-[95vw] w-full bg-white text-slate-900 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Edit Event Mapping: <code className="text-blue-600 font-bold">{editingMapping?.eventName}</code>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Select which sender address and email template will be automatically used when this event occurs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Sender Identity</Label>
              <Select value={mappingFormSender} onValueChange={setMappingFormSender}>
                <SelectTrigger className="text-xs rounded-xl">
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
                <SelectTrigger className="text-xs rounded-xl">
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
            <Button type="button" variant="outline" size="sm" onClick={() => setMappingModalOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSaveMapping} disabled={savingMapping} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl">
              {savingMapping ? "Updating..." : "Update Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VERSION HISTORY MODAL */}
      <Dialog open={versionsModalOpen} onOpenChange={setVersionsModalOpen}>
        <DialogContent className="sm:max-w-xl max-w-[95vw] w-full bg-white text-slate-900 rounded-2xl max-h-[90vh] overflow-y-auto">
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
                <div key={v.id} className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-bold rounded-md">v{v.version}</Badge>
                      <span className="font-bold text-slate-900">{v.subject}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-mono">Archived at: {new Date(v.createdAt).toLocaleString()}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestoreVersion(v.id)}
                    className="text-xs font-bold text-blue-700 border-blue-200 hover:bg-blue-50 rounded-lg"
                  >
                    Restore
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setVersionsModalOpen(false)} className="rounded-xl">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 1. DISPATCHES BREAKDOWN MODAL (Triggered by Card 1: 24H Dispatched) */}
      <Dialog open={dispatchesModalOpen} onOpenChange={setDispatchesModalOpen}>
        <DialogContent className="sm:max-w-2xl max-w-[95vw] w-full bg-white text-slate-900 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center ring-4 ring-blue-500/10">
                <Send className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  24-Hour Transactional Dispatches Breakdown
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Detailed distribution of transactional triggers executed across all active school tenants.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Top Stat Summary Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Total 24h</span>
                <span className="text-2xl font-black text-slate-900">{telemetry?.sent24h ?? 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-700 block">Delivered</span>
                <span className="text-2xl font-black text-emerald-600">{telemetry?.successful24h ?? 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 text-center">
                <span className="text-[10px] uppercase font-bold text-rose-700 block">Failed / Bounced</span>
                <span className="text-2xl font-black text-rose-600">{telemetry?.failed24h ?? 0}</span>
              </div>
            </div>

            {/* Categorized Event Distribution List */}
            <div className="space-y-2">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center justify-between">
                <span>Dispatches by Event Trigger</span>
                <span className="text-[11px] font-mono text-slate-400 lowercase">{dispatchesEvents.length} events logged</span>
              </h4>

              {loadingDispatches ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading dispatches breakdown...</div>
              ) : dispatchesEvents.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Inbox className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-600">No event dispatches recorded in the last 24 hours.</p>
                  <p className="text-slate-400 mt-0.5">Use the Live Test Lab tab to trigger a test dispatch.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {dispatchesEvents.map((evt) => (
                    <div key={evt.eventName} className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-100/70 transition-all flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 uppercase text-[11px]">
                            {evt.eventName.replaceAll("_", " ")}
                          </span>
                          <span className="bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {evt.count} dispatches
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Last triggered: {evt.lastDispatched ? new Date(evt.lastDispatched).toLocaleTimeString() : "Recent"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px] font-bold">
                          {evt.successful} sent
                        </Badge>
                        {evt.failed > 0 && (
                          <Badge variant="destructive" className="text-[10px] font-bold">
                            {evt.failed} failed
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDispatchesModalOpen(false);
                setActiveTab("logs");
              }}
              className="text-xs font-bold text-blue-600 border-blue-200 hover:bg-blue-50 rounded-xl w-full sm:w-auto"
            >
              Open Full Delivery Logs <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDispatchesModalOpen(false)}
              className="rounded-xl w-full sm:w-auto"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. DELIVERY HEALTH & SUCCESS RATE MODAL (Triggered by Card 2: 24H Success Rate) */}
      <Dialog open={healthModalOpen} onOpenChange={setHealthModalOpen}>
        <DialogContent className="sm:max-w-xl max-w-[95vw] w-full bg-white text-slate-900 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center ring-4 ring-emerald-500/10">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Delivery Success & Health Diagnostics
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Realtime telemetry from Mail Transfer Agent (MTA) Postfix engine at <strong>mail.altrixcore.com</strong>.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Health Score Overview */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Overall Success Rate</span>
                <div className="text-3xl font-black text-emerald-700 font-sans mt-0.5">
                  {telemetry?.successRate24h ?? 100}%
                </div>
                <p className="text-[11px] text-emerald-800 font-medium mt-1">
                  {telemetry?.successful24h ?? 0} successful relays of {telemetry?.sent24h ?? 0} attempts in 24 hours
                </p>
              </div>
              <div className="h-14 w-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                <ShieldCheck className="h-8 w-8" />
              </div>
            </div>

            {/* Diagnostic Parameters Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1">
                <span className="text-slate-500 font-bold text-[10px] uppercase">Relay Latency</span>
                <p className="font-black text-slate-900 text-base font-mono">{mtaHealth?.latencyMs || 3.3} ms</p>
                <span className="text-[10px] text-emerald-600 font-bold">Optimal Response Time</span>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1">
                <span className="text-slate-500 font-bold text-[10px] uppercase">MTA Node Relay</span>
                <p className="font-black text-slate-900 text-base font-mono">127.0.0.1:25</p>
                <span className="text-[10px] text-blue-600 font-bold">Authorized Docker Subnet</span>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1">
                <span className="text-slate-500 font-bold text-[10px] uppercase">TLS Security</span>
                <p className="font-black text-slate-900 text-base">Let's Encrypt</p>
                <span className="text-[10px] text-emerald-600 font-bold">TLS 1.3 Active</span>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1">
                <span className="text-slate-500 font-bold text-[10px] uppercase">DKIM / SPF State</span>
                <p className="font-black text-slate-900 text-base">Configured</p>
                <span className="text-[10px] text-emerald-600 font-bold">mail.altrixcore.com</span>
              </div>
            </div>

            {/* Relay Status Note */}
            <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-[11px] leading-relaxed">
              <strong>Local Postfix Direct Relay:</strong> All institutional transactional dispatches route with zero roundtrip TLS overhead through our internal Docker bridge.
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setHealthModalOpen(false)} className="rounded-xl">
              Close Diagnostics
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. PENDING STAFF INVITATIONS MODAL (Triggered by Card 4: Pending Staff Invites) */}
      <Dialog open={pendingInvitesModalOpen} onOpenChange={setPendingInvitesModalOpen}>
        <DialogContent className="sm:max-w-3xl max-w-[95vw] w-full bg-white text-slate-900 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center ring-4 ring-amber-500/10">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-slate-900">
                    Active Staff Invitations & Token Management
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    Realtime management of single-use onboarding tokens sent to teachers, accountants, and campus staff.
                  </DialogDescription>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={loadPendingInvitations}
                disabled={loadingPendingInvites}
                className="text-xs h-8 font-bold text-amber-700 border-amber-300 hover:bg-amber-50 rounded-xl"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${loadingPendingInvites ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {loadingPendingInvites ? (
              <div className="py-16 text-center text-xs text-slate-400">Loading active invitation tokens...</div>
            ) : pendingInvitations.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-600">No active pending staff invitations found.</p>
                <p className="text-slate-400 mt-0.5">When school admins invite staff members, their activation tokens will appear here.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                {pendingInvitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-blue-300 hover:shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{inv.displayName}</span>
                        <Badge variant="outline" className="text-[10px] font-bold uppercase bg-slate-50">
                          {inv.role.replaceAll("_", " ")}
                        </Badge>
                        {inv.isExpired ? (
                          <span className="bg-rose-100 text-rose-800 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
                            Expired
                          </span>
                        ) : (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
                            {inv.status}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-mono">
                        <span className="font-semibold text-slate-700">{inv.email}</span>
                        <span>•</span>
                        <span>{inv.schoolName} ({inv.campusName})</span>
                        <span>•</span>
                        <span>Expires: {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "48h"}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      {inv.activationUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(inv.activationUrl!, `inv-${inv.id}`)}
                          className="text-xs h-8 font-bold rounded-lg"
                          title="Copy direct activation URL"
                        >
                          {copiedKey === `inv-${inv.id}` ? (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 mr-1" /> Copy Link
                            </>
                          )}
                        </Button>
                      )}

                      <Button
                        size="sm"
                        disabled={resendingInviteId === inv.id}
                        onClick={() => handleResendStaffInvite(inv.id)}
                        className="text-xs h-8 font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                        title="Re-issue a fresh 48-hour activation token & dispatch email"
                      >
                        {resendingInviteId === inv.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Send className="h-3 w-3 mr-1" /> Resend
                          </>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        disabled={revokingInviteId === inv.id}
                        onClick={() => handleRevokeStaffInvite(inv.id)}
                        className="text-xs h-8 font-bold text-rose-600 border-rose-200 hover:bg-rose-50 rounded-lg"
                        title="Immediately invalidate and revoke token"
                      >
                        {revokingInviteId === inv.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPendingInvitesModalOpen(false)} className="rounded-xl">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. ACTIVE SYSTEM WARNINGS MODAL */}
      <Dialog open={warningsModalOpen} onOpenChange={setWarningsModalOpen}>
        <DialogContent className="sm:max-w-2xl max-w-[95vw] w-full bg-white text-slate-900 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Active Email Infrastructure Warnings & Diagnostics
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Detailed inspection of failed deliveries, expired invitation tokens, and unmapped triggers.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {warnings.length === 0 ? (
              <div className="py-12 text-center text-xs text-emerald-600 bg-emerald-50/50 rounded-xl border border-emerald-200">
                <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-bold text-sm">All Email Delivery Systems Operational</p>
                <p className="text-xs text-emerald-700 mt-0.5">No active warnings, bounce alerts, or stale invitation tokens found.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {warnings.map((w) => (
                  <div
                    key={w.id}
                    className={`p-4 rounded-xl border transition-all space-y-2 ${
                      w.severity === "high"
                        ? "bg-rose-50/40 border-rose-200/80 hover:border-rose-300"
                        : "bg-amber-50/40 border-amber-200/80 hover:border-amber-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={w.severity === "high" ? "destructive" : "outline"}
                          className="text-[10px] font-bold uppercase"
                        >
                          {w.severity}
                        </Badge>
                        <h4 className="font-bold text-slate-900 text-xs">{w.title}</h4>
                      </div>
                      {w.timestamp && (
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(w.timestamp).toLocaleString()}
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-white/90 border border-slate-200/70 space-y-1 font-mono text-[11px]">
                      <div className="text-slate-700">
                        <strong className="text-slate-900 font-sans">Details: </strong>
                        {w.details}
                      </div>
                      {w.recipient && w.recipient !== "—" && (
                        <div className="text-slate-600">
                          <strong className="text-slate-900 font-sans">Recipient: </strong>
                          {w.recipient}
                        </div>
                      )}
                      {w.sender && (
                        <div className="text-slate-600">
                          <strong className="text-slate-900 font-sans">Sender: </strong>
                          {w.sender}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-600 italic">
                        <strong>Recommendation: </strong>{w.action}
                      </span>
                      {w.invitationId && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setWarningsModalOpen(false);
                            handleResendStaffInvite(w.invitationId!);
                          }}
                          className="text-xs h-7 font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shrink-0"
                        >
                          Re-issue Token ↗
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setWarningsModalOpen(false)} className="rounded-xl">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. DELIVERY FAILURE & ERROR TRACE DIAGNOSTICS MODAL */}
      <Dialog open={failedLogModalOpen} onOpenChange={setFailedLogModalOpen}>
        <DialogContent className="sm:max-w-xl max-w-[95vw] w-full bg-white text-slate-900 rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center ring-4 ring-rose-500/10">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Email Delivery Failure Diagnostics
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Detailed error trace, Postfix relay rejection codes, and root cause inspection.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedFailedLog && (
            <div className="space-y-4 py-2 text-xs">
              {/* Event & Target Meta */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Event Trigger</span>
                  <span className="font-mono font-bold text-slate-900 uppercase text-xs">
                    {selectedFailedLog.eventName.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Dispatched Timestamp</span>
                  <span className="font-mono text-slate-900 text-xs">
                    {selectedFailedLog.sentAt ? new Date(selectedFailedLog.sentAt).toLocaleString() : "—"}
                  </span>
                </div>
              </div>

              {/* Recipient & Subject info */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5 font-mono text-[11px]">
                <div>
                  <span className="font-sans font-bold text-slate-700">Recipient Email: </span>
                  <span className="text-slate-900 font-bold">{selectedFailedLog.recipientEmail}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-slate-700">Sender Identity: </span>
                  <span className="text-slate-900">{selectedFailedLog.senderEmail}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-slate-700">Subject: </span>
                  <span className="text-slate-800 font-sans">{selectedFailedLog.subject}</span>
                </div>
                {selectedFailedLog.messageId && (
                  <div>
                    <span className="font-sans font-bold text-slate-700">Message ID: </span>
                    <span className="text-slate-500 text-[10px]">{selectedFailedLog.messageId}</span>
                  </div>
                )}
              </div>

              {/* Error Trace Container */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-rose-800 flex items-center justify-between">
                  <span>Postfix Error Code & Diagnostic Trace</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedFailedLog.errorDetails || "No trace", "err-trace")}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-700 underline"
                  >
                    Copy Error Trace
                  </button>
                </Label>
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {selectedFailedLog.errorDetails || "Mail Transfer Agent (MTA) rejected recipient address or destination MX record was unreachable."}
                </div>
              </div>

              {/* Remediation Guide */}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                <strong>Remediation Tip:</strong> Verify the recipient's domain MX record, confirm the sender alias is active in the <em>Sender Profiles</em> tab, or dispatch a live test dispatch to this address from the <em>Live Test Lab</em>.
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedFailedLog) {
                  setTestRecipient(selectedFailedLog.recipientEmail);
                  setTestSubject(`[Retry] ${selectedFailedLog.subject}`);
                  setActiveTab("test_lab");
                }
                setFailedLogModalOpen(false);
              }}
              className="text-xs font-bold text-blue-600 border-blue-200 hover:bg-blue-50 rounded-xl w-full sm:w-auto"
            >
              Test in Test Lab <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setFailedLogModalOpen(false)}
              className="rounded-xl w-full sm:w-auto"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SuperAdminShell>
  );
}
