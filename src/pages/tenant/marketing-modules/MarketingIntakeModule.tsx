import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Copy, Check, Eye, Settings, Code, ExternalLink } from "lucide-react";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { Badge } from "@/components/ui/badge";

type IntakeConfig = {
  formTitle: string;
  showLogo: boolean;
  fields: {
    parentName: boolean; // always true
    email: boolean;
    phone: boolean;
    studentName: boolean;
    studentGrade: boolean;
    priorSchool: boolean;
    message: boolean;
  };
  requiredFields: {
    email: boolean;
    phone: boolean;
    studentName: boolean;
    studentGrade: boolean;
  };
  successMessage: string;
  accentColor: string;
};

const DEFAULT_CONFIG: IntakeConfig = {
  formTitle: "Admissions & Inquiry Form",
  showLogo: true,
  fields: {
    parentName: true,
    email: true,
    phone: true,
    studentName: true,
    studentGrade: true,
    priorSchool: true,
    message: true,
  },
  requiredFields: {
    email: true,
    phone: true,
    studentName: true,
    studentGrade: false,
  },
  successMessage: "Thank you for inquiring! Our admissions counselor will get in touch with you shortly.",
  accentColor: "#f59e0b", // Gold
};

export function MarketingIntakeModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.schoolId;
  const [schoolDetails, setSchoolDetails] = useState<{ logo_url?: string | null } | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      const { data } = await supabase.from("schools").select("logo_url").eq("id", schoolId).maybeSingle();
      if (data) setSchoolDetails(data);
    })();
  }, [schoolId]);

  const [config, setConfig] = useState<IntakeConfig>(DEFAULT_CONFIG);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // Load configuration
  useEffect(() => {
    if (!schoolId) return;
    const localKey = `altrix:marketing:intake-config:${schoolId}`;
    const saved = localStorage.getItem(localKey);
    if (saved) {
      setConfig(JSON.parse(saved));
    } else {
      localStorage.setItem(localKey, JSON.stringify(DEFAULT_CONFIG));
      setConfig(DEFAULT_CONFIG);
    }
  }, [schoolId]);

  const saveConfig = (updated: IntakeConfig) => {
    if (!schoolId) return;
    setConfig(updated);
    localStorage.setItem(`altrix:marketing:intake-config:${schoolId}`, JSON.stringify(updated));
    toast.success("Lead intake settings saved!");
  };

  const publicLink = `${window.location.origin}/${schoolSlug}/inquiry`;
  const iframeCode = `<iframe src="${publicLink}" width="100%" height="700px" style="border:none; border-radius:16px; background:transparent; overflow:hidden;" scrolling="no"></iframe>`;

  const copyToClipboard = (text: string, type: "link" | "embed") => {
    navigator.clipboard.writeText(text);
    if (type === "link") {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedEmbed(true);
      setTimeout(() => setCopiedEmbed(false), 2000);
    }
    toast.success("Copied to clipboard!");
  };

  // Toggle helpers
  const handleFieldToggle = (field: keyof IntakeConfig["fields"]) => {
    if (field === "parentName") return; // cannot toggle parentName
    const nextFields = { ...config.fields, [field]: !config.fields[field] };
    saveConfig({ ...config, fields: nextFields });
  };

  const handleRequiredToggle = (field: keyof IntakeConfig["requiredFields"]) => {
    const nextReq = { ...config.requiredFields, [field]: !config.requiredFields[field] };
    saveConfig({ ...config, requiredFields: nextReq });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight">Public Lead Intake & Inquiry Settings</h2>
        <p className="text-sm text-muted-foreground">Configure the public form parents fill out to request information. Submissions instantly create CRM leads.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Form Configurator Panel */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                Intake Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              
              {/* Form Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Public Form Title</label>
                <Input
                  value={config.formTitle}
                  onChange={e => saveConfig({ ...config, formTitle: e.target.value })}
                  className="text-sm"
                  placeholder="Inquiry Form Title"
                />
              </div>

              {/* Show logo toggle */}
              <div className="flex items-center justify-between py-1 border-b pb-2">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold">Display School Logo</p>
                  <p className="text-[10px] text-muted-foreground">Show school logo at the top of the form.</p>
                </div>
                <Switch
                  checked={config.showLogo}
                  onCheckedChange={checked => saveConfig({ ...config, showLogo: checked })}
                />
              </div>

              {/* Fields checklist */}
              <div className="space-y-2 pt-2 border-b pb-3">
                <p className="text-xs font-semibold">Configure Form Fields</p>
                <div className="space-y-2">
                  
                  {/* Parent Name */}
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-muted-foreground font-medium">Parent Name</span>
                    <Badge variant="outline" className="text-[9px]">Always Active & Required</Badge>
                  </div>

                  {/* Email */}
                  <div className="flex items-center justify-between text-xs py-1 border-t pt-1">
                    <span className="text-muted-foreground font-medium">Email Address</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.fields.email}
                          onChange={() => handleFieldToggle("email")}
                          className="rounded text-primary w-3.5 h-3.5"
                        />
                        <span className="text-[10px] text-muted-foreground">Show</span>
                      </label>
                      {config.fields.email && (
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.requiredFields.email}
                            onChange={() => handleRequiredToggle("email")}
                            className="rounded text-primary w-3.5 h-3.5"
                          />
                          <span className="text-[10px] text-muted-foreground">Required</span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="flex items-center justify-between text-xs py-1 border-t pt-1">
                    <span className="text-muted-foreground font-medium">Phone Number</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.fields.phone}
                          onChange={() => handleFieldToggle("phone")}
                          className="rounded text-primary w-3.5 h-3.5"
                        />
                        <span className="text-[10px] text-muted-foreground">Show</span>
                      </label>
                      {config.fields.phone && (
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.requiredFields.phone}
                            onChange={() => handleRequiredToggle("phone")}
                            className="rounded text-primary w-3.5 h-3.5"
                          />
                          <span className="text-[10px] text-muted-foreground">Required</span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Student Name */}
                  <div className="flex items-center justify-between text-xs py-1 border-t pt-1">
                    <span className="text-muted-foreground font-medium">Child/Student Name</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.fields.studentName}
                          onChange={() => handleFieldToggle("studentName")}
                          className="rounded text-primary w-3.5 h-3.5"
                        />
                        <span className="text-[10px] text-muted-foreground">Show</span>
                      </label>
                      {config.fields.studentName && (
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.requiredFields.studentName}
                            onChange={() => handleRequiredToggle("studentName")}
                            className="rounded text-primary w-3.5 h-3.5"
                          />
                          <span className="text-[10px] text-muted-foreground">Required</span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Student Grade */}
                  <div className="flex items-center justify-between text-xs py-1 border-t pt-1">
                    <span className="text-muted-foreground font-medium">Target Grade / Level</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.fields.studentGrade}
                          onChange={() => handleFieldToggle("studentGrade")}
                          className="rounded text-primary w-3.5 h-3.5"
                        />
                        <span className="text-[10px] text-muted-foreground">Show</span>
                      </label>
                      {config.fields.studentGrade && (
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.requiredFields.studentGrade}
                            onChange={() => handleRequiredToggle("studentGrade")}
                            className="rounded text-primary w-3.5 h-3.5"
                          />
                          <span className="text-[10px] text-muted-foreground">Required</span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Prior School */}
                  <div className="flex items-center justify-between text-xs py-1 border-t pt-1">
                    <span className="text-muted-foreground font-medium">Prior School Name</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.fields.priorSchool}
                          onChange={() => handleFieldToggle("priorSchool")}
                          className="rounded text-primary w-3.5 h-3.5"
                        />
                        <span className="text-[10px] text-muted-foreground">Show</span>
                      </label>
                    </div>
                  </div>

                  {/* Message */}
                  <div className="flex items-center justify-between text-xs py-1 border-t pt-1">
                    <span className="text-muted-foreground font-medium">Additional Message</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.fields.message}
                          onChange={() => handleFieldToggle("message")}
                          className="rounded text-primary w-3.5 h-3.5"
                        />
                        <span className="text-[10px] text-muted-foreground">Show</span>
                      </label>
                    </div>
                  </div>

                </div>
              </div>

              {/* Success Message */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-medium">Success Redirect/Message</label>
                <Textarea
                  value={config.successMessage}
                  onChange={e => saveConfig({ ...config, successMessage: e.target.value })}
                  className="text-sm"
                  rows={2}
                  placeholder="Success message shown to parents upon submission."
                />
              </div>

            </CardContent>
          </Card>
        </div>

        {/* Share & Code Panel */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Action Hub Card */}
          <Card className="shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Code className="h-4 w-4 text-primary" />
                Form Sharing & Embed Code
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              
              {/* Copy Link */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Direct Form URL</span>
                  <a
                    href={publicLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-primary flex items-center gap-1 hover:underline"
                  >
                    Open Page <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <div className="flex gap-2">
                  <Input value={publicLink} readOnly className="text-xs text-muted-foreground flex-1 font-mono h-8" />
                  <Button variant="soft" size="sm" className="h-8" onClick={() => copyToClipboard(publicLink, "link")}>
                    {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Copy Embed code */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold">IFrame Embed Code</span>
                <div className="flex gap-2">
                  <Input value={iframeCode} readOnly className="text-xs text-muted-foreground flex-1 font-mono h-8" />
                  <Button variant="soft" size="sm" className="h-8" onClick={() => copyToClipboard(iframeCode, "embed")}>
                    {copiedEmbed ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Form Interactive Live Preview */}
          <div className="rounded-3xl border bg-muted/20 overflow-hidden shadow-lg">
            <div className="bg-muted px-4 py-2 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold">Live Intake Preview (Interactive)</span>
              </div>
              <Badge variant="outline" className="text-muted-foreground text-[9px] border-muted">Preview Only</Badge>
            </div>
            
            <div className="p-6 bg-background flex justify-center">
              <div className="w-full max-w-md rounded-2xl border bg-card p-5 space-y-4 shadow-sm">
                
                {/* Header preview */}
                <div className="text-center space-y-2">
                  {config.showLogo && (schoolDetails?.logo_url || (tenant.school as any)?.logo_url) && (
                    <img src={schoolDetails?.logo_url || (tenant.school as any)?.logo_url} alt="Logo" className="h-10 mx-auto rounded-md object-contain" />
                  )}
                  <h3 className="font-display text-base font-bold tracking-tight">{config.formTitle}</h3>
                  <p className="text-[11px] text-muted-foreground">Fill out the details to request admissions packet information.</p>
                </div>

                {/* Form fields preview */}
                <div className="space-y-3 pt-2">
                  
                  {/* Parent name */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium flex">
                      Parent Full Name <span className="text-destructive ml-0.5">*</span>
                    </label>
                    <Input placeholder="Enter parent name" readOnly className="text-xs h-8" />
                  </div>

                  {/* Email */}
                  {config.fields.email && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium flex">
                        Email Address {config.requiredFields.email && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      <Input placeholder="parent@example.com" readOnly className="text-xs h-8" />
                    </div>
                  )}

                  {/* Phone */}
                  {config.fields.phone && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium flex">
                        Phone Number {config.requiredFields.phone && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      <Input placeholder="+1 (555) 000-0000" readOnly className="text-xs h-8" />
                    </div>
                  )}

                  {/* Student name */}
                  {config.fields.studentName && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium flex">
                        Child's Name {config.requiredFields.studentName && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      <Input placeholder="Child's full name" readOnly className="text-xs h-8" />
                    </div>
                  )}

                  {/* Student grade */}
                  {config.fields.studentGrade && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium flex">
                        Grade Level Seeking {config.requiredFields.studentGrade && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      <Input placeholder="e.g. Grade 5, Kindergarten" readOnly className="text-xs h-8" />
                    </div>
                  )}

                  {/* Prior school */}
                  {config.fields.priorSchool && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium flex">Prior School Name</label>
                      <Input placeholder="Previous school attended" readOnly className="text-xs h-8" />
                    </div>
                  )}

                  {/* Message */}
                  {config.fields.message && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium flex">Additional Messages/Comments</label>
                      <Textarea placeholder="Any questions or special notes..." readOnly className="text-xs h-8 min-h-12" />
                    </div>
                  )}

                  <Button className="w-full text-xs h-8 mt-2" variant="hero">
                    Submit Admissions Inquiry
                  </Button>
                </div>

              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
