import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, CheckCircle2, ChevronRight, School, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type IntakeConfig = {
  formTitle: string;
  showLogo: boolean;
  fields: {
    parentName: boolean;
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
  accentColor: "#f59e0b",
};

export default function PublicInquiryPage() {
  const { schoolSlug } = useParams();
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.schoolId;
  const [schoolDetails, setSchoolDetails] = useState<{ logo_url?: string | null; email?: string | null; phone?: string | null } | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      const { data } = await supabase.from("schools").select("logo_url,email,phone").eq("id", schoolId).maybeSingle();
      if (data) setSchoolDetails(data);
    })();
  }, [schoolId]);

  const [config, setConfig] = useState<IntakeConfig>(DEFAULT_CONFIG);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form State
  const [parentName, setParentName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentGrade, setStudentGrade] = useState("");
  const [priorSchool, setPriorSchool] = useState("");
  const [message, setMessage] = useState("");

  // Load configuration
  useEffect(() => {
    if (!schoolId) return;
    const localKey = `altrix:marketing:intake-config:${schoolId}`;
    const saved = localStorage.getItem(localKey);
    if (saved) {
      setConfig(JSON.parse(saved));
    }
  }, [schoolId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !schoolSlug) return;

    if (!parentName.trim()) {
      return toast.error("Parent name is required");
    }

    if (config.fields.email && config.requiredFields.email && !email.trim()) {
      return toast.error("Email address is required");
    }

    if (config.fields.phone && config.requiredFields.phone && !phone.trim()) {
      return toast.error("Phone number is required");
    }

    if (config.fields.studentName && config.requiredFields.studentName && !studentName.trim()) {
      return toast.error("Child name is required");
    }

    if (config.fields.studentGrade && config.requiredFields.studentGrade && !studentGrade.trim()) {
      return toast.error("Grade level is required");
    }

    setBusy(true);

    // Compile notes block
    const notesArr: string[] = [];
    if (config.fields.studentName && studentName) notesArr.push(`Child: ${studentName}`);
    if (config.fields.studentGrade && studentGrade) notesArr.push(`Target Grade: ${studentGrade}`);
    if (config.fields.priorSchool && priorSchool) notesArr.push(`Prior School: ${priorSchool}`);
    if (config.fields.message && message) notesArr.push(`Message: ${message}`);
    const compiledNotes = notesArr.join(" | ");

    try {
      // 1) First attempt to invoke secure database RPC
      const { error: rpcError } = await supabase.rpc("create_public_lead", {
        _school_slug: schoolSlug,
        _full_name: parentName.trim(),
        _email: email.trim() || null,
        _phone: phone.trim() || null,
        _notes: compiledNotes || null,
        _source: "Website Inquiry Form"
      });

      if (rpcError) {
        console.warn("RPC insert failed, attempting fallback direct insert: ", rpcError.message);
        
        let fallbackPipelineId: string | null = null;
        let fallbackStageId: string | null = null;

        try {
          const { data: pipelineData } = await supabase
            .from("crm_pipelines")
            .select("id")
            .eq("school_id", schoolId)
            .eq("is_default", true)
            .maybeSingle();
            
          fallbackPipelineId = pipelineData?.id || null;
          
          if (!fallbackPipelineId) {
            const { data: firstPipeline } = await supabase
              .from("crm_pipelines")
              .select("id")
              .eq("school_id", schoolId)
              .limit(1)
              .maybeSingle();
            fallbackPipelineId = firstPipeline?.id || null;
          }

          if (fallbackPipelineId) {
            const { data: stageData } = await supabase
              .from("crm_stages")
              .select("id")
              .eq("school_id", schoolId)
              .eq("pipeline_id", fallbackPipelineId)
              .order("sort_order", { ascending: true })
              .limit(1)
              .maybeSingle();
            fallbackStageId = stageData?.id || null;
          }
        } catch (err) {
          console.warn("Could not resolve default pipeline/stage for fallback: ", err);
        }

        // 2) Fallback direct insert using anonymous RLS policy
        const { error: directError } = await supabase.from("crm_leads").insert({
          school_id: schoolId,
          pipeline_id: fallbackPipelineId,
          stage_id: fallbackStageId,
          full_name: parentName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          source: "Website Inquiry Form",
          notes: compiledNotes || null,
          status: "open",
          score: 10
        });

        if (directError) {
          throw new Error(directError.message);
        }
      }

      setSubmitted(true);
      toast.success("Inquiry submitted successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to submit inquiry. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (tenant.status === "loading") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-4" />
        <p className="text-sm text-muted-foreground font-medium">Loading school portals...</p>
      </div>
    );
  }

  if (tenant.status === "error" || !schoolId) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center text-foreground">
        <h1 className="text-xl font-bold font-display">School Portals Offline</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">The school portal slug is invalid or the subdomain configuration could not be resolved.</p>
      </div>
    );
  }

  const school = tenant.school;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30 text-foreground flex flex-col justify-between selection:bg-primary/30">
      
      {/* Top micro-bar */}
      <header className="w-full border-b bg-card/60 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {config.showLogo && (schoolDetails?.logo_url || (school as any)?.logo_url) ? (
            <img src={schoolDetails?.logo_url || (school as any)?.logo_url} alt="Logo" className="h-8 rounded object-contain" />
          ) : (
            <div className="p-1.5 rounded-lg bg-muted border">
              <School className="h-5 w-5 text-primary" />
            </div>
          )}
          <span className="font-display font-bold text-sm tracking-tight">{school?.name || "School Portal"}</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
          {(schoolDetails?.email || (school as any)?.email) && (
            <span className="flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" /> {schoolDetails?.email || (school as any)?.email}
            </span>
          )}
          {(schoolDetails?.phone || (school as any)?.phone) && (
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" /> {schoolDetails?.phone || (school as any)?.phone}
            </span>
          )}
        </div>
      </header>

      {/* Main Form Area */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {!submitted ? (
            <Card className="shadow-elevated relative overflow-hidden bg-card">
              
              {/* Primary accent top bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
              
              <CardContent className="p-6 sm:p-8 space-y-6">
                
                {/* Heading */}
                <div className="text-center space-y-2">
                  <Badge variant="outline" className="bg-primary/10 text-primary border border-primary/20 gap-1 text-[10px] uppercase tracking-wide font-semibold py-0.5 px-2">
                    <Sparkles className="h-3 w-3" /> Admissions Pipeline
                  </Badge>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                    {config.formTitle}
                  </h1>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Please submit your inquiry details below. Our admissions coordinator will review and send you the registration booklet.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                  
                  {/* Parent Full Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold flex">
                      Parent Full Name <span className="text-destructive ml-0.5">*</span>
                    </label>
                    <Input
                      required
                      value={parentName}
                      onChange={e => setParentName(e.target.value)}
                      placeholder="e.g. Robert Smith"
                      className="text-sm"
                    />
                  </div>

                  {/* Email & Phone side-by-side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {config.fields.email && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold flex">
                          Email Address {config.requiredFields.email && <span className="text-destructive ml-0.5">*</span>}
                        </label>
                        <Input
                          required={config.requiredFields.email}
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="parent@example.com"
                          className="text-sm"
                        />
                      </div>
                    )}
                    {config.fields.phone && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold flex">
                          Phone Number {config.requiredFields.phone && <span className="text-destructive ml-0.5">*</span>}
                        </label>
                        <Input
                          required={config.requiredFields.phone}
                          type="tel"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          placeholder="+1 (555) 000-0000"
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>

                  {/* Student Name */}
                  {config.fields.studentName && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold flex">
                        Child's Full Name {config.requiredFields.studentName && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      <Input
                        required={config.requiredFields.studentName}
                        value={studentName}
                        onChange={e => setStudentName(e.target.value)}
                        placeholder="Child's full name"
                        className="text-sm"
                      />
                    </div>
                  )}

                  {/* Student Grade & Prior school side-by-side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {config.fields.studentGrade && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold flex">
                          Grade Seeking {config.requiredFields.studentGrade && <span className="text-destructive ml-0.5">*</span>}
                        </label>
                        <Input
                          required={config.requiredFields.studentGrade}
                          value={studentGrade}
                          onChange={e => setStudentGrade(e.target.value)}
                          placeholder="e.g. Grade 4"
                          className="text-sm"
                        />
                      </div>
                    )}
                    {config.fields.priorSchool && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Prior School Name</label>
                        <Input
                          value={priorSchool}
                          onChange={e => setPriorSchool(e.target.value)}
                          placeholder="Previous school"
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>

                  {/* Message */}
                  {config.fields.message && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">Additional Comments / Inquiries</label>
                      <Textarea
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        rows={3}
                        placeholder="Any specific questions regarding curriculum, facilities, fee structures, etc..."
                        className="text-sm"
                      />
                    </div>
                  )}

                  <Button type="submit" disabled={busy} className="w-full gap-2 mt-4 font-semibold text-sm" variant="hero">
                    {busy ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    ) : (
                      <>
                        Submit Admissions Inquiry <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                </form>

              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-elevated relative overflow-hidden text-center max-w-md mx-auto bg-card">
              <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
              <CardContent className="p-8 space-y-6 flex flex-col items-center">
                
                <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 animate-bounce">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="font-display text-xl font-bold tracking-tight">Inquiry Received</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed font-sans">
                    {config.successMessage}
                  </p>
                </div>

                <div className="pt-2 w-full">
                  <Button variant="outline" className="w-full text-xs" onClick={() => setSubmitted(false)}>
                    Submit Another Inquiry
                  </Button>
                </div>

              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Footer bar */}
      <footer className="w-full border-t py-4 text-center text-[10px] text-muted-foreground bg-muted/40 font-sans">
        Powered by Altrix CRM Pipeline • {school?.name} Admissions Division.
      </footer>
    </div>
  );
}
