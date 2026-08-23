import { useEffect, useState } from "react";
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
  isActive: boolean;
  updatedAt?: string | null;
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
}

export default function PlatformEmailPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  // Data states
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [recentLogs, setRecentLogs] = useState<EmailLog[]>([]);
  const [senders, setSenders] = useState<SenderIdentity[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [mappings, setMappings] = useState<EventMapping[]>([]);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logSearch, setLogSearch] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState("all");

  // Template Editor State
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateEditSubject, setTemplateEditSubject] = useState("");
  const [templateEditHtml, setTemplateEditHtml] = useState("");
  const [templateEditSenderKey, setTemplateEditSenderKey] = useState("security");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewTab, setPreviewTab] = useState<"edit" | "preview">("edit");
  const [savingTemplate, setSavingTemplate] = useState(false);

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

  // Event Mapping Modal
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<EventMapping | null>(null);
  const [mappingFormSender, setMappingFormSender] = useState("security");
  const [mappingFormTemplate, setMappingFormTemplate] = useState("staff_invitation");
  const [savingMapping, setSavingMapping] = useState(false);

  // Test Send State
  const [testRecipient, setTestRecipient] = useState("naumancheema643@gmail.com");
  const [testSenderKey, setTestSenderKey] = useState("security");
  const [testSubject, setTestSubject] = useState("AltRix System Test Dispatch");
  const [testMessage, setTestMessage] = useState("This is a live transactional test email from AltRix Central Mail Engine.");
  const [testSending, setTestSending] = useState(false);

  // Fetch Overview Data
  const loadOverview = async () => {
    try {
      const res = await apiClient.get("/super_admin/email/overview");
      if (res.data) {
        setTelemetry(res.data.telemetry);
        setRecentLogs(res.data.recentLogs || []);
      }
    } catch (err) {
      console.error("Failed to load email overview:", err);
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
  const loadTemplates = async () => {
    try {
      const res = await apiClient.get("/super_admin/email/templates");
      if (res.data) {
        setTemplates(res.data);
        if (res.data.length > 0 && !selectedTemplate) {
          setSelectedTemplate(res.data[0]);
          setTemplateEditSubject(res.data[0].subject);
          setTemplateEditHtml(res.data[0].htmlContent);
          setTemplateEditSenderKey(res.data[0].senderIdentityKey || "security");
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

  // Load all data on mount
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadOverview(), loadSenders(), loadTemplates(), loadMappings(), loadLogs()]);
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
      toast.success(`Template '${selectedTemplate.name}' saved successfully!`);
      await loadTemplates();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  };

  // Insert variable tag into template
  const insertVariable = (varName: string) => {
    const tag = `{{${varName}}}`;
    setTemplateEditHtml((prev) => prev + tag);
    toast.info(`Inserted variable tag: ${tag}`);
  };

  // Open sender create/edit modal
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

  return (
    <SuperAdminShell
      title="Central Email Management HQ"
      subtitle="Configure AltRix sender identities, customize responsive templates, and monitor VPS mail delivery"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("https://mail.altrixcore.com/admin", "_blank")}
            className="text-xs border-slate-300 font-semibold bg-white hover:bg-slate-50 text-slate-800"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5 text-blue-600" /> Mailu Server Admin
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("https://mail.altrixcore.com/webmail", "_blank")}
            className="text-xs border-slate-300 font-semibold bg-white hover:bg-slate-50 text-slate-800"
          >
            <Inbox className="h-3.5 w-3.5 mr-1.5 text-indigo-600" /> Webmail Client
          </Button>
          <Button
            size="sm"
            onClick={() => {
              loadOverview();
              loadSenders();
              loadTemplates();
              loadMappings();
              loadLogs();
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
          <TabsList className="grid grid-cols-6 max-w-4xl bg-slate-100 p-1 rounded-xl">
            <TabsTrigger value="overview" className="text-xs font-bold gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="senders" className="text-xs font-bold gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Sender Identities
            </TabsTrigger>
            <TabsTrigger value="templates" className="text-xs font-bold gap-1.5">
              <FileCode2 className="h-3.5 w-3.5" /> Template Studio
            </TabsTrigger>
            <TabsTrigger value="routing" className="text-xs font-bold gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Event Routing
            </TabsTrigger>
            <TabsTrigger value="test_lab" className="text-xs font-bold gap-1.5">
              <Send className="h-3.5 w-3.5" /> Test Lab
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-xs font-bold gap-1.5">
              <ListFilter className="h-3.5 w-3.5" /> Delivery Logs
            </TabsTrigger>
          </TabsList>

          {/* 1. OVERVIEW TAB */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            {/* Telemetry Stat Cards */}
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
                    {telemetry?.activeSenders ?? 7}
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
                      <Radio className="h-3 w-3 mr-1 animate-pulse" /> Postfix SMTP Online
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
                  <span className="text-slate-400 font-medium">Webmail / Admin Routing</span>
                  <p className="font-bold text-white">mail.altrixcore.com/admin</p>
                </div>
              </CardContent>
            </Card>

            {/* Recent Delivery Stream Table */}
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
                      {recentLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No transactional emails logged yet.
                          </td>
                        </tr>
                      ) : (
                        recentLogs.map((item) => (
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
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. SENDER IDENTITIES TAB */}
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

          {/* 3. TEMPLATE STUDIO TAB */}
          <TabsContent value="templates" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Template Selection Cards */}
              <div className="lg:col-span-4 space-y-3">
                <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400 px-1">Transactional Templates</p>
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
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                            {tmpl.category}
                          </Badge>
                          <span className="text-[10px] font-mono text-slate-400">{tmpl.key}</span>
                        </div>
                        <CardTitle className="text-sm font-bold text-slate-900 mt-1">{tmpl.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <p className="text-xs text-slate-500 truncate">{tmpl.subject}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Right Column: Template Editor & Preview */}
              <div className="lg:col-span-8 space-y-4">
                {selectedTemplate ? (
                  <Card className="border-slate-200 shadow-xs bg-white">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <FileCode2 className="h-4 w-4 text-blue-600" /> {selectedTemplate.name}
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-500">
                            Key: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-bold">{selectedTemplate.key}</code>
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
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
                          {/* Subject & Sender Settings */}
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

                          {/* Variable Insertion Pills */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <Sparkles className="h-3.5 w-3.5 text-blue-600" /> Insert Dynamic Variable Tags
                            </Label>
                            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                              {(selectedTemplate.availableVariables.length > 0
                                ? selectedTemplate.availableVariables
                                : ["name", "email", "role", "tenant_name", "activation_link", "reset_link", "expires_in", "support_email", "year"]
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

                          {/* HTML Template Source Editor */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700">Responsive HTML Email Markup</Label>
                            <Textarea
                              rows={14}
                              value={templateEditHtml}
                              onChange={(e) => setTemplateEditHtml(e.target.value)}
                              className="font-mono text-xs leading-relaxed bg-slate-950 text-slate-100 border-slate-800 p-3 rounded-lg"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div className="p-3 bg-slate-100 rounded-lg text-xs flex items-center justify-between">
                            <span className="font-semibold text-slate-700">Subject Preview:</span>
                            <span className="font-bold text-slate-900">{templateEditSubject}</span>
                          </div>
                          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-inner bg-slate-900 p-4">
                            <iframe
                              title="Live Email Preview"
                              srcDoc={previewHtml}
                              className="w-full min-h-[500px] rounded-lg bg-white border-0 shadow-lg"
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

          {/* 4. EVENT ROUTING MATRIX TAB */}
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

          {/* 5. TEST SEND LAB TAB */}
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
                <CardContent className="p-5 space-y-4">
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
                    <Label className="text-xs font-bold text-slate-700">Test Subject</Label>
                    <Input
                      required
                      value={testSubject}
                      onChange={(e) => setTestSubject(e.target.value)}
                      className="text-xs bg-slate-50 border-slate-300"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Test Message Content</Label>
                    <Textarea
                      rows={4}
                      required
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

          {/* 6. DELIVERY LOGS TAB */}
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
    </SuperAdminShell>
  );
}
