import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  GraduationCap, Globe, CheckCircle2, Search, ArrowRight, ShieldCheck,
  Building, User, Phone, Mail, FileText, Sparkles
} from "lucide-react";

export function PublicAdmissionsPortal() {
  const [activeTab, setActiveTab] = useState("apply");
  const [loading, setLoading] = useState(false);

  // Application State
  const [form, setForm] = useState({
    school_id: "00000000-0000-0000-0000-000000000000",
    applicant_name: "", guardian_name: "", guardian_phone: "", guardian_email: "",
    target_class: "Grade 1", previous_school: ""
  });

  const [submittedCode, setSubmittedCode] = useState<string | null>(null);

  // Status Lookup State
  const [lookupCode, setLookupCode] = useState("");
  const [statusResult, setStatusResult] = useState<any | null>(null);

  const handleApply = async () => {
    if (!form.applicant_name || !form.guardian_name || !form.guardian_phone) {
      toast.error("Please fill in applicant and guardian contact details");
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.post("/public-admissions/apply", form);
      setSubmittedCode(res.data.tracking_code);
      toast.success("Application submitted successfully!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to submit online application");
    }
    setLoading(false);
  };

  const handleCheckStatus = async () => {
    if (!lookupCode) {
      toast.error("Enter tracking reference code");
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.get(`/public-admissions/status/${lookupCode}`);
      setStatusResult(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Invalid or unknown tracking reference");
      setStatusResult(null);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-center items-center p-4 md:p-8">
      {/* Header Banner */}
      <div className="text-center max-w-2xl mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-bold mb-4">
          <Globe className="h-3.5 w-3.5" /> Official Online Admissions Portal
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
          Join Our Elite Academic Institution
        </h1>
        <p className="text-sm text-zinc-400 mt-2">
          Submit your child's application online in under 2 minutes and track entrance test & status in real time.
        </p>
      </div>

      <Card className="w-full max-w-xl bg-zinc-900 border-zinc-800/80 shadow-2xl">
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-2 bg-zinc-950 border border-zinc-800 mb-6">
              <TabsTrigger value="apply" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400 font-bold">
                <FileText className="h-4 w-4 mr-2" /> New Online Application
              </TabsTrigger>
              <TabsTrigger value="status" className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 font-bold">
                <Search className="h-4 w-4 mr-2" /> Track Status
              </TabsTrigger>
            </TabsList>

            {/* ─── Apply Form ────────────────────────────── */}
            <TabsContent value="apply">
              {submittedCode ? (
                <div className="text-center py-8 space-y-4">
                  <div className="p-4 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 w-16 h-16 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Application Received!</h3>
                  <p className="text-xs text-zinc-400">Save your official tracking reference code for entrance exam updates:</p>
                  <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-2xl font-extrabold text-cyan-400 tracking-wider">
                    {submittedCode}
                  </div>
                  <Button onClick={() => setSubmittedCode(null)} variant="outline" className="border-zinc-700 text-zinc-300">
                    Submit Another Application
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-zinc-400">Applicant Student Full Name</Label>
                    <Input value={form.applicant_name} onChange={e => setForm(p => ({ ...p, applicant_name: e.target.value }))}
                      className="bg-zinc-950 border-zinc-800 text-white mt-1" placeholder="e.g. Ibrahim Ali" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-zinc-400">Guardian / Parent Name</Label>
                      <Input value={form.guardian_name} onChange={e => setForm(p => ({ ...p, guardian_name: e.target.value }))}
                        className="bg-zinc-950 border-zinc-800 text-white mt-1" placeholder="Dr. Ali Ahmed" />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">Guardian Phone</Label>
                      <Input value={form.guardian_phone} onChange={e => setForm(p => ({ ...p, guardian_phone: e.target.value }))}
                        className="bg-zinc-950 border-zinc-800 text-white mt-1" placeholder="+92 300 1234567" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-zinc-400">Target Grade / Class</Label>
                      <Input value={form.target_class} onChange={e => setForm(p => ({ ...p, target_class: e.target.value }))}
                        className="bg-zinc-950 border-zinc-800 text-white mt-1" placeholder="Grade 5 / O-Levels" />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">Guardian Email (Optional)</Label>
                      <Input value={form.guardian_email} onChange={e => setForm(p => ({ ...p, guardian_email: e.target.value }))}
                        className="bg-zinc-950 border-zinc-800 text-white mt-1" placeholder="parent@gmail.com" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400">Previous School Attended (If any)</Label>
                    <Input value={form.previous_school} onChange={e => setForm(p => ({ ...p, previous_school: e.target.value }))}
                      className="bg-zinc-950 border-zinc-800 text-white mt-1" placeholder="Army Public School / LGS" />
                  </div>
                  <Button onClick={handleApply} disabled={loading} className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-zinc-950 font-bold mt-2 py-5">
                    {loading ? "Submitting Application..." : "Submit Online Application"}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ─── Status Tracker ─────────────────────────── */}
            <TabsContent value="status">
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-zinc-400">Enter Application Reference Code</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={lookupCode} onChange={e => setLookupCode(e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-white font-mono uppercase" placeholder="ADM-2026-X9A7" />
                    <Button onClick={handleCheckStatus} disabled={loading} className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-zinc-950 font-bold">
                      Track
                    </Button>
                  </div>
                </div>

                {statusResult && (
                  <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3 mt-4">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-white">{statusResult.applicant_name}</p>
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 capitalize">
                        {statusResult.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-400">Target Grade: <span className="text-zinc-200">{statusResult.target_class}</span></p>
                    <p className="text-xs text-zinc-500 font-mono">Reference ID: {statusResult.tracking_code}</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default PublicAdmissionsPortal;
