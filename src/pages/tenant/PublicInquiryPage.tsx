import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
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
  // Everything here is read and written through the public enquiry endpoints.
  // The page used the signed-in data proxy, which refuses a visitor who is not
  // logged in — so the parents this form is for could never send it.
  const [school, setSchool] = useState<{ id: string; name: string; logo_url?: string | null; email?: string | null; phone?: string | null } | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const schoolId = school?.id ?? null;
  const schoolDetails = school;

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

  // The school's public details and the form's settings, in one request.
  useEffect(() => {
    if (!schoolSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`/public-inquiries/${encodeURIComponent(schoolSlug)}`);
        if (cancelled) return;
        setSchool(res.data?.school ?? null);
        const data = res.data?.settings;
        if (data) {
          setConfig({
            formTitle: data.form_title || DEFAULT_CONFIG.formTitle,
            showLogo: data.show_logo ?? DEFAULT_CONFIG.showLogo,
            fields: {
              parentName: data.fields_config?.parentName ?? true,
              email: data.fields_config?.email ?? true,
              phone: data.fields_config?.phone ?? true,
              studentName: data.fields_config?.studentName ?? true,
              studentGrade: data.fields_config?.studentGrade ?? true,
              priorSchool: data.fields_config?.priorSchool ?? true,
              message: data.fields_config?.message ?? true,
            },
            requiredFields: {
              email: data.required_config?.email ?? true,
              phone: data.required_config?.phone ?? true,
              studentName: data.required_config?.studentName ?? true,
              studentGrade: data.required_config?.studentGrade ?? false,
            },
            successMessage: data.success_message || DEFAULT_CONFIG.successMessage,
            accentColor: data.accent_color || DEFAULT_CONFIG.accentColor,
          });
        }
        setLoadState("ready");
      } catch (err: any) {
        if (cancelled) return;
        setLoadState(err?.response?.status === 404 ? "missing" : "failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolSlug]);

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


    try {
      // One request: the server records the enquiry as a lead in the school's
      // admissions pipeline and notifies the admissions staff. A fallback that
      // wrote the lead and the notifications from the browser could never run
      // for a visitor who is not signed in.
      await apiClient.post(`/public-inquiries/${encodeURIComponent(schoolSlug)}`, {
        parent_name: parentName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        student_name: config.fields.studentName ? studentName.trim() || null : null,
        student_grade: config.fields.studentGrade ? studentGrade.trim() || null : null,
        prior_school: config.fields.priorSchool ? priorSchool.trim() || null : null,
        message: config.fields.message ? message.trim() || null : null,
      });

      setSubmitted(true);
      toast.success("Inquiry submitted successfully!");
    } catch (err: any) {
      console.error(err);
      const status = err?.response?.status;
      toast.error(
        (typeof err?.response?.data?.detail === "string" ? err.response.data.detail : "") ||
          (status === 429 ? "Too many attempts. Please wait a minute and send it again." : "") ||
          "The enquiry could not be sent. Please check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-4" />
        <p className="text-sm text-muted-foreground font-medium">Loading the enquiry form…</p>
      </div>
    );
  }

  if (loadState !== "ready" || !schoolId) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center text-foreground">
        <h1 className="text-xl font-bold font-display">
          {loadState === "missing" ? "School not found" : "The form could not be loaded"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          {loadState === "missing"
            ? "Please check the link the school gave you."
            : "Please check your connection and reload the page."}
        </p>
      </div>
    );
  }

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
          <span className="font-display font-bold text-sm tracking-tight">{school?.name || "Institute Portal"}</span>
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
