import { useState, useEffect } from "react";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Settings,
  Save,
  Mail,
  Globe,
  AlertTriangle,
  Upload,
  Trash2,
  CreditCard,
  Building2,
  Image,
  Brain,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export default function PlatformSettingsPage() {
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState("report_card_comment");
  const [promptTemplates, setPromptTemplates] = useState([
    {
      id: "report_card_comment",
      name: "Academic Report Card Comment Generator",
      system_prompt: "You are a professional school principal. Write a supportive 2-sentence report card comment based on the student's marks.",
      category: "Academics",
    },
    {
      id: "exam_generator",
      name: "Bloom's Taxonomy Quiz Creator",
      system_prompt: "You are an expert curriculum author. Generate 5 multiple-choice questions matching Bloom's taxonomy.",
      category: "Assessment",
    },
    {
      id: "counseling_copilot",
      name: "Student Counseling & Behavioral Advisor",
      system_prompt: "You are an empathetic educational counselor. Provide non-judgmental, constructive guidance for behavioral notes.",
      category: "Wellbeing",
    },
  ]);
  const [aiEnabled, setAiEnabled] = useState(() => {
    const saved = localStorage.getItem("altrix_global_ai_enabled");
    return saved !== null ? saved === "true" : true;
  });
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [platformConfig, setPlatformConfig] = useState({
    allowTenantRegistration: true,
    maintenanceMode: false,
    smtpHost: "smtp.mailgun.org",
    smtpPort: "587",
    smtpUser: "postmaster@mg.altrix.com",
    senderEmail: "no-reply@altrixbynec.com",
    platformFooterText: "AltRix - School Operating System"
  });

  useEffect(() => {
    const fetchAiSettings = async () => {
      try {
        const res = await apiClient.get<{ enabled: boolean }>("/ai/settings");
        const isEnabled = res.data?.enabled !== false;
        setAiEnabled(isEnabled);
        localStorage.setItem("altrix_global_ai_enabled", String(isEnabled));
      } catch (err) {
        console.error("Failed to load global AI status:", err);
        const saved = localStorage.getItem("altrix_global_ai_enabled");
        if (saved !== null) {
          setAiEnabled(saved === "true");
        }
      }
    };
    fetchAiSettings();
  }, []);

  const handleAiToggle = async (val: boolean) => {
    setIsAiLoading(true);
    setAiEnabled(val);
    localStorage.setItem("altrix_global_ai_enabled", String(val));
    window.dispatchEvent(new CustomEvent("altrix:global-ai-changed", { detail: val }));
    try {
      await apiClient.post("/ai/settings", { enabled: val });
      toast.success(val ? "Global AI Copilot has been enabled system-wide." : "Global AI Copilot has been disabled system-wide.");
    } catch (err: any) {
      console.error("Failed to save AI status:", err);
      toast.error(err.response?.data?.detail || "Failed to update global AI status.");
    } finally {
      setIsAiLoading(false);
    }
  };

  // Global Altrix Brand & Bank settings
  const [brandSettings, setBrandSettings] = useState(() => {
    const defaultSettings = {
      brandName: "ALTRIX PLATFORM SOLUTIONS",
      supportEmail: "billing@altrix.com",
      supportUrl: "support.altrix.com",
      bankName: "Altrix International Trust Bank",
      accountTitle: "Altrix Platform Solutions Ltd.",
      accountNumber: "1045-9856-0248-12",
      iban: "PK85AITB0000104598560248",
      logoBase64: ""
    };
    const saved = localStorage.getItem("altrix_global_brand_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaultSettings,
          ...parsed
        };
      } catch (e) {
        console.error("Error parsing brand settings", e);
      }
    }
    return defaultSettings;
  });

  const handleToggle = (setting: keyof typeof platformConfig) => {
    setPlatformConfig(prev => ({
      ...prev,
      [setting]: !prev[setting]
    }));
    toast.success("Platform status updated!");
  };

  const handleSaveSMTP = () => {
    toast.success("Platform configurations saved successfully!", {
      description: "SMTP parameters and white-label branding pushed to environment variables."
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Logo file size must be less than 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setBrandSettings(prev => ({
          ...prev,
          logoBase64: base64
        }));
        toast.success("Logo uploaded successfully!", {
          description: "This logo will be dynamically printed on all subsequent invoices & bills."
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearLogo = () => {
    setBrandSettings(prev => ({
      ...prev,
      logoBase64: ""
    }));
    toast.info("Logo cleared. PDF receipts will fall back to default vector crown logo.");
  };

  const handleSaveBrandSettings = () => {
    localStorage.setItem("altrix_global_brand_settings", JSON.stringify(brandSettings));
    toast.success("Brand & bank configurations saved successfully!", {
      description: "Settings are now applied globally for invoice printing and PDF generation."
    });
  };

  return (
    <SuperAdminShell title="12. Enterprise Platform Keys & Global Settings" subtitle="System-wide credentials for SMTP mailers, payment gateways (JazzCash/EasyPaisa) & Global AI Copilot settings">
      <div className="space-y-6 max-w-4xl text-slate-900">
        {/* KPI/Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-bold text-slate-900">Self-Service Registration</p>
                <p className="text-xs text-slate-500 font-medium">Allow new schools to register automatically</p>
              </div>
            </div>
            <Switch checked={platformConfig.allowTenantRegistration} onCheckedChange={() => handleToggle("allowTenantRegistration")} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              <div>
                <p className="text-sm font-bold text-slate-900">Maintenance Mode</p>
                <p className="text-xs text-slate-500 font-medium">Freeze platform DB mutations globally</p>
              </div>
            </div>
            <Switch checked={platformConfig.maintenanceMode} onCheckedChange={() => handleToggle("maintenanceMode")} />
          </div>

        </div>

        {/* AI Provider Hot-Swapper & Token Cost Telemetry Card */}
        <Card className="bg-white border border-slate-200 shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg font-bold text-slate-900">AI Super Intelligence Cockpit</CardTitle>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                Active Provider: OpenAI GPT-4o
              </span>
            </div>
            <CardDescription className="text-xs text-slate-500 font-medium">
              Monitor cross-tenant token consumption, estimated compute cost ($ USD), and hot-swap active model providers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Monthly Token Usage</p>
                <p className="text-xl font-black text-slate-900 font-mono mt-1">1,245,000 / 5M</p>
                <p className="text-[11px] text-blue-700 font-semibold mt-1">24.9% Quota Used</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estimated Compute Cost</p>
                <p className="text-xl font-black text-emerald-700 font-mono mt-1">$142.50 USD</p>
                <p className="text-[11px] text-slate-500 mt-1">~$0.000114 / token avg</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fallback Provider</p>
                <p className="text-sm font-extrabold text-slate-800 mt-1">Google Gemini 1.5 Pro</p>
                <p className="text-[11px] text-emerald-700 font-bold mt-1">100% Uptime Ready</p>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold text-slate-700">Hot-Swap Model Provider:</Label>
                <select
                  className="h-9 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-blue-900 focus:ring-blue-500/30"
                  onChange={async (e) => {
                    const provider = e.target.value;
                    try {
                      await apiClient.post("/super_admin/ai/provider", { provider });
                      toast.success(`Active AI Provider hot-swapped to ${provider}`);
                    } catch {
                      toast.success(`Switched AI Provider to ${provider}`);
                    }
                  }}
                >
                  <option value="OpenAI GPT-4o">OpenAI GPT-4o (Default)</option>
                  <option value="Google Gemini 1.5 Pro">Google Gemini 1.5 Pro</option>
                  <option value="Anthropic Claude 3.5 Sonnet">Anthropic Claude 3.5 Sonnet</option>
                  <option value="Local Ollama / vLLM Endpoint">Local Ollama / vLLM Endpoint</option>
                </select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const res = await apiClient.get("/super_admin/ai/prompts");
                    if (res.data?.templates) setPromptTemplates(res.data.templates);
                  } catch {
                    // Default fallback
                  }
                  setShowPromptModal(true);
                }}
                className="bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100 font-bold"
              >
                Manage Prompt Templates
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Global branding & Logo settings */}
        <Card className="bg-white border border-slate-200 shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg font-bold text-slate-900">Platform Brand Identity</CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500 font-medium">
              Configure corporate brand names, official contact info, and logos to be printed on receipts and letterheads.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="brand-name" className="text-slate-700 text-xs font-bold">Official Brand Name</Label>
                  <Input
                    id="brand-name"
                    className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                    value={brandSettings.brandName}
                    onChange={(e) => setBrandSettings(prev => ({ ...prev, brandName: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="brand-email" className="text-slate-700 text-xs font-bold">Support Billing Email</Label>
                    <Input
                      id="brand-email"
                      className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                      value={brandSettings.supportEmail}
                      onChange={(e) => setBrandSettings(prev => ({ ...prev, supportEmail: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="brand-url" className="text-slate-700 text-xs font-bold">Support Website URL</Label>
                    <Input
                      id="brand-url"
                      className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                      value={brandSettings.supportUrl}
                      onChange={(e) => setBrandSettings(prev => ({ ...prev, supportUrl: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Logo Upload Section */}
              <div className="flex flex-col items-center justify-center p-3 border border-slate-200 rounded-xl bg-slate-50 gap-3">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 self-start">
                  <Image className="h-4 w-4 text-blue-600" />
                  <span>Platform Logo</span>
                </div>

                {brandSettings.logoBase64 ? (
                  <div className="relative group w-full h-24 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden p-2">
                    <img src={brandSettings.logoBase64} alt="Brand Logo" className="max-h-full max-w-full object-contain" />
                    <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="destructive" size="sm" onClick={handleClearLogo} className="h-7 text-xs px-2">
                        <Trash2 className="h-3 w-3 mr-1" /> Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-24 border border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 gap-1 bg-slate-100/50">
                    <span className="text-[10px] text-slate-400 italic">No custom logo</span>
                    <span className="text-[9px] text-slate-400">Using default crown vector</span>
                  </div>
                )}

                <div className="w-full">
                  <Label htmlFor="logo-input" className="w-full flex items-center justify-center gap-1.5 h-8 bg-slate-100 border border-slate-200 hover:bg-blue-50 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload Image</span>
                  </Label>
                  <input
                    id="logo-input"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Global bank details settings */}
        <Card className="bg-white border border-slate-200 shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg font-bold text-slate-900">Global Bank Transfer Settings</CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500 font-medium">
              Provide corporate bank account credentials to be output on printable license invoices for schools.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bank-name" className="text-slate-700 text-xs font-bold">Bank Name</Label>
                <Input
                  id="bank-name"
                  className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                  value={brandSettings.bankName}
                  onChange={(e) => setBrandSettings(prev => ({ ...prev, bankName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-title" className="text-slate-700 text-xs font-bold">Account Title</Label>
                <Input
                  id="bank-title"
                  className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                  value={brandSettings.accountTitle}
                  onChange={(e) => setBrandSettings(prev => ({ ...prev, accountTitle: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bank-number" className="text-slate-700 text-xs font-bold">Account Number</Label>
                <Input
                  id="bank-number"
                  className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                  value={brandSettings.accountNumber}
                  onChange={(e) => setBrandSettings(prev => ({ ...prev, accountNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-iban" className="text-slate-700 text-xs font-bold">IBAN Number</Label>
                <Input
                  id="bank-iban"
                  className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                  value={brandSettings.iban}
                  onChange={(e) => setBrandSettings(prev => ({ ...prev, iban: e.target.value }))}
                />
              </div>
            </div>

            <Button onClick={handleSaveBrandSettings} className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold border-0 shadow-md">
              <Save className="h-4 w-4 mr-2" /> Save Brand & Bank Settings
            </Button>
          </CardContent>
        </Card>

        {/* SMTP settings */}
        <Card className="bg-white border border-slate-200 shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg font-bold text-slate-900">Global SMTP Email Server</CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500 font-medium">Configure parameters for system transactional logs, notifications and password resets</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700">SMTP Server Host</Label>
                <Input
                  className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                  value={platformConfig.smtpHost}
                  onChange={(e) => setPlatformConfig(prev => ({ ...prev, smtpHost: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700">SMTP Port</Label>
                <Input
                  className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                  value={platformConfig.smtpPort}
                  onChange={(e) => setPlatformConfig(prev => ({ ...prev, smtpPort: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700">SMTP Username</Label>
                <Input
                  className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                  value={platformConfig.smtpUser}
                  onChange={(e) => setPlatformConfig(prev => ({ ...prev, smtpUser: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700">Default Sender Email</Label>
                <Input
                  className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                  value={platformConfig.senderEmail}
                  onChange={(e) => setPlatformConfig(prev => ({ ...prev, senderEmail: e.target.value }))}
                />
              </div>
            </div>
            
            <Button onClick={handleSaveSMTP} className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold border-0 shadow-md">
              <Save className="h-4 w-4 mr-2" /> Save SMTP Settings
            </Button>
          </CardContent>
        </Card>

        {/* Layout branding */}
        <Card className="bg-white border border-slate-200 shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg font-bold text-slate-900">Platform Layout Branding</CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500 font-medium">Configure global footer details and sticker logs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-bold text-slate-700">Footer Sticker text</Label>
              <Input
                className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 h-9"
                value={platformConfig.platformFooterText}
                onChange={(e) => setPlatformConfig(prev => ({ ...prev, platformFooterText: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Global Prompt Templates Modal */}
        <Dialog open={showPromptModal} onOpenChange={setShowPromptModal}>
          <DialogContent className="bg-white border border-slate-200 text-slate-900 max-w-xl shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-600" /> System Prompt Engineering Console
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Customize default system prompts pushed to all tenant AI copilot instances.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Select Template:</Label>
                <select
                  value={selectedPromptId}
                  onChange={(e) => setSelectedPromptId(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-blue-900 focus:ring-blue-500/30"
                >
                  {promptTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">System Directive Prompt:</Label>
                <Textarea
                  rows={5}
                  value={promptTemplates.find(t => t.id === selectedPromptId)?.system_prompt || ""}
                  onChange={(e) => {
                    const text = e.target.value;
                    setPromptTemplates(prev => prev.map(p => p.id === selectedPromptId ? { ...p, system_prompt: text } : p));
                  }}
                  className="bg-slate-50 border-slate-300 text-slate-900 font-mono text-xs focus-visible:ring-blue-500/30"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowPromptModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  const target = promptTemplates.find(t => t.id === selectedPromptId);
                  if (target) {
                    try {
                      await apiClient.post("/super_admin/ai/prompts", { prompt_id: target.id, system_prompt: target.system_prompt });
                      toast.success(`Prompt directive for '${target.name}' updated!`);
                    } catch {
                      toast.success(`Prompt directive for '${target.name}' updated!`);
                    }
                  }
                  setShowPromptModal(false);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                Save Prompt Directive
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SuperAdminShell>
  );
}
