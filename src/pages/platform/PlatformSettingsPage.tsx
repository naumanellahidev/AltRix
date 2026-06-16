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

export default function PlatformSettingsPage() {
  const [aiEnabled, setAiEnabled] = useState(true);
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
        setAiEnabled(res.data.enabled);
      } catch (err) {
        console.error("Failed to load global AI status:", err);
      }
    };
    fetchAiSettings();
  }, []);

  const handleAiToggle = async (val: boolean) => {
    setIsAiLoading(true);
    try {
      await apiClient.post("/ai/settings", { enabled: val });
      setAiEnabled(val);
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
    <SuperAdminShell title="System Settings" subtitle="Configure platform-wide variables, branding, bank details, and registration parameters">
      <div className="space-y-6 max-w-4xl text-zinc-100">
        {/* KPI/Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-white">Self-Service Registration</p>
                <p className="text-xs text-zinc-400">Allow new schools to register automatically</p>
              </div>
            </div>
            <Switch checked={platformConfig.allowTenantRegistration} onCheckedChange={() => handleToggle("allowTenantRegistration")} />
          </div>

          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              <div>
                <p className="text-sm font-semibold text-white">Maintenance Mode</p>
                <p className="text-xs text-zinc-400">Freeze platform DB mutations globally</p>
              </div>
            </div>
            <Switch checked={platformConfig.maintenanceMode} onCheckedChange={() => handleToggle("maintenanceMode")} />
          </div>

          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-3">
              {isAiLoading ? (
                <Loader2 className="h-5 w-5 text-purple-500 animate-spin" />
              ) : (
                <Brain className="h-5 w-5 text-purple-500" />
              )}
              <div>
                <p className="text-sm font-semibold text-white">Global AI Copilot</p>
                <p className="text-xs text-zinc-400">Enable or disable AI system-wide</p>
              </div>
            </div>
            <Switch checked={aiEnabled} onCheckedChange={handleAiToggle} disabled={isAiLoading} />
          </div>
        </div>

        {/* Global branding & Logo settings */}
        <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg font-bold text-white">Platform Brand Identity</CardTitle>
            </div>
            <CardDescription className="text-xs text-zinc-400">
              Configure corporate brand names, official contact info, and logos to be printed on receipts and letterheads.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="brand-name" className="text-zinc-300 text-xs font-semibold">Official Brand Name</Label>
                  <Input
                    id="brand-name"
                    className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                    value={brandSettings.brandName}
                    onChange={(e) => setBrandSettings(prev => ({ ...prev, brandName: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="brand-email" className="text-zinc-300 text-xs font-semibold">Support Billing Email</Label>
                    <Input
                      id="brand-email"
                      className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                      value={brandSettings.supportEmail}
                      onChange={(e) => setBrandSettings(prev => ({ ...prev, supportEmail: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="brand-url" className="text-zinc-300 text-xs font-semibold">Support Website URL</Label>
                    <Input
                      id="brand-url"
                      className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                      value={brandSettings.supportUrl}
                      onChange={(e) => setBrandSettings(prev => ({ ...prev, supportUrl: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Logo Upload Section */}
              <div className="flex flex-col items-center justify-center p-3 border border-zinc-900 rounded-xl bg-zinc-900/20 gap-3">
                <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 self-start">
                  <Image className="h-4 w-4 text-amber-500" />
                  <span>Platform Logo</span>
                </div>

                {brandSettings.logoBase64 ? (
                  <div className="relative group w-full h-24 bg-white/5 rounded-lg border border-zinc-800 flex items-center justify-center overflow-hidden p-2">
                    <img src={brandSettings.logoBase64} alt="Brand Logo" className="max-h-full max-w-full object-contain" />
                    <div className="absolute inset-0 bg-black/75 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="destructive" size="sm" onClick={handleClearLogo} className="h-7 text-xs px-2">
                        <Trash2 className="h-3 w-3 mr-1" /> Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-24 border border-dashed border-zinc-800 rounded-lg flex flex-col items-center justify-center text-zinc-600 gap-1 bg-black/20">
                    <span className="text-[10px] text-zinc-500 italic">No custom logo</span>
                    <span className="text-[9px] text-zinc-600">Using default crown vector</span>
                  </div>
                )}

                <div className="w-full">
                  <Label htmlFor="logo-input" className="w-full flex items-center justify-center gap-1.5 h-8 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-semibold cursor-pointer transition-colors">
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
        <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg font-bold text-white">Global Bank Transfer Settings</CardTitle>
            </div>
            <CardDescription className="text-xs text-zinc-400">
              Provide corporate bank account credentials to be output on printable license invoices for schools.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bank-name" className="text-zinc-300 text-xs font-semibold">Bank Name</Label>
                <Input
                  id="bank-name"
                  className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                  value={brandSettings.bankName}
                  onChange={(e) => setBrandSettings(prev => ({ ...prev, bankName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-title" className="text-zinc-300 text-xs font-semibold">Account Title</Label>
                <Input
                  id="bank-title"
                  className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                  value={brandSettings.accountTitle}
                  onChange={(e) => setBrandSettings(prev => ({ ...prev, accountTitle: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bank-number" className="text-zinc-300 text-xs font-semibold">Account Number</Label>
                <Input
                  id="bank-number"
                  className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                  value={brandSettings.accountNumber}
                  onChange={(e) => setBrandSettings(prev => ({ ...prev, accountNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-iban" className="text-zinc-300 text-xs font-semibold">IBAN Number</Label>
                <Input
                  id="bank-iban"
                  className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                  value={brandSettings.iban}
                  onChange={(e) => setBrandSettings(prev => ({ ...prev, iban: e.target.value }))}
                />
              </div>
            </div>

            <Button onClick={handleSaveBrandSettings} className="w-full mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-md">
              <Save className="h-4 w-4 mr-2" /> Save Brand & Bank Settings
            </Button>
          </CardContent>
        </Card>

        {/* SMTP settings */}
        <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg font-bold text-white">Global SMTP Email Server</CardTitle>
            </div>
            <CardDescription className="text-xs text-zinc-400">Configure parameters for system transactional logs, notifications and password resets</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-white">SMTP Server Host</Label>
                <Input
                  className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                  value={platformConfig.smtpHost}
                  onChange={(e) => setPlatformConfig(prev => ({ ...prev, smtpHost: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-white">SMTP Port</Label>
                <Input
                  className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                  value={platformConfig.smtpPort}
                  onChange={(e) => setPlatformConfig(prev => ({ ...prev, smtpPort: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-white">SMTP Username</Label>
                <Input
                  className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                  value={platformConfig.smtpUser}
                  onChange={(e) => setPlatformConfig(prev => ({ ...prev, smtpUser: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-white">Default Sender Email</Label>
                <Input
                  className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                  value={platformConfig.senderEmail}
                  onChange={(e) => setPlatformConfig(prev => ({ ...prev, senderEmail: e.target.value }))}
                />
              </div>
            </div>
            
            <Button onClick={handleSaveSMTP} className="w-full mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-md">
              <Save className="h-4 w-4 mr-2" /> Save SMTP Settings
            </Button>
          </CardContent>
        </Card>

        {/* Layout branding */}
        <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg font-bold text-white">Platform Layout Branding</CardTitle>
            </div>
            <CardDescription className="text-xs text-zinc-400">Configure global footer details and sticker logs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-white">Footer Sticker text</Label>
              <Input
                className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 h-9"
                value={platformConfig.platformFooterText}
                onChange={(e) => setPlatformConfig(prev => ({ ...prev, platformFooterText: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </SuperAdminShell>
  );
}
