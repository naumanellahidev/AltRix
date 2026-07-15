import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import {
  ShieldCheck,
  QrCode,
  Smartphone,
  Mail,
  MessageSquare,
  Users,
  CheckCircle,
  Clock,
  Printer,
  ChevronRight,
  AlertTriangle,
  Lock,
  Compass,
  ArrowRight,
  Download
} from "lucide-react";
import { toast } from "sonner";

interface VisitorPass {
  id: string;
  visitor_name: string;
  phone: string;
  cnic: string | null;
  purpose: string;
  details: string | null;
  qr_code_token: string;
  checkin_status: string;
  scheduled_date: string;
}

export default function PublicVisitorRegisterPage() {
  const { schoolSlug } = useParams<{ schoolSlug: string }>();
  const [schoolName, setSchoolName] = useState("AltRix Academy");
  const [schoolLogo, setSchoolLogo] = useState("");
  const [loading, setLoading] = useState(false);
  const [registeredPass, setRegisteredPass] = useState<VisitorPass | null>(null);
  const [notificationsSim, setNotificationsSim] = useState<any | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cnic, setCnic] = useState("");
  const [purpose, setPurpose] = useState("meeting");
  const [details, setDetails] = useState("");
  const [studentRoll, setStudentRoll] = useState("");

  useEffect(() => {
    if (!schoolSlug) return;
    // Fetch public school metadata
    apiClient
      .get(`/schools/by-slug/${schoolSlug}`)
      .then((res) => {
        if (res.data) {
          setSchoolName(res.data.name);
          if (res.data.logo_url) {
            setSchoolLogo(res.data.logo_url);
          }
        }
      })
      .catch((err) => {
        console.error("Error loading school details:", err);
      });
  }, [schoolSlug]);

  const handleSubmit = async () => {
    if (!name || !phone) {
      toast.error("Name and Phone number are required");
      return;
    }
    setLoading(true);
    try {
      const body = {
        school_slug: schoolSlug,
        visitor_name: name,
        phone: phone,
        email: email || null,
        cnic: cnic || null,
        purpose: purpose,
        details: details || null,
        scheduled_date: new Date().toISOString().slice(0, 10),
        student_roll_number: studentRoll || null,
      };

      const res = await apiClient.post("/visitors/public/register", body);
      toast.success("Registration completed!");
      setRegisteredPass(res.data.pass);
      setNotificationsSim(res.data.notifications);
    } catch (err: any) {
      console.error(err);
      const errMsg = err?.response?.data?.detail || "Registration failed. Please check blacklist restrictions.";
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!registeredPass) return;
    const w = window.open("", "_blank", "width=600,height=500");
    if (!w) return;
    const html = `
      <!doctype html>
      <html>
      <head>
        <title>Visitor pass - ${registeredPass.visitor_name}</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 40px; color: #1a1a1a; }
          .card { border: 3px solid #2563eb; border-radius: 16px; padding: 24px; max-width: 400px; margin: 0 auto; }
          .otp { font-size: 32px; font-weight: bold; color: #1e293b; background: #f1f5f9; padding: 12px; border-radius: 8px; border: 1px dashed #cbd5e1; margin: 20px 0; }
          .label { font-size: 11px; text-transform: uppercase; color: #64748b; margin-top: 12px; }
          .value { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>${schoolName.toUpperCase()}</h2>
          <div style="font-size: 12px; color: #64748b;">VISITOR SELF-REGISTER ENTRY TICKET</div>
          <div class="otp">${registeredPass.qr_code_token}</div>
          <div class="label">Visitor Name</div>
          <div class="value">${registeredPass.visitor_name}</div>
          <div class="label">Purpose</div>
          <div class="value" style="text-transform: capitalize;">${registeredPass.purpose}</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 24px;">Please present this code to the gate security guard upon arrival.</div>
        </div>
        <script>setTimeout(() => window.print(), 300)</script>
      </body>
      </html>
    `;
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 md:p-6 font-sans antialiased relative overflow-hidden">
      {/* Background glass glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px]" />

      <div className="w-full max-w-xl relative z-10 space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-3">
          {schoolLogo ? (
            <img src={schoolLogo} alt="School Logo" className="h-16 mx-auto object-contain rounded-xl" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-primary to-indigo-500 mx-auto flex items-center justify-center shadow-lg">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold font-display tracking-tight text-white">{schoolName}</h1>
            <p className="text-slate-400 text-xs mt-1">Visitor Self-Registration Portal</p>
          </div>
        </div>

        {!registeredPass ? (
          <Card className="bg-slate-900/60 border-slate-800/80 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-800/80 pb-4">
              <CardTitle className="text-lg font-bold font-display text-white flex items-center gap-2">
                <Compass className="h-5 w-5 text-primary" /> Gate Check-In Form
              </CardTitle>
              <p className="text-xs text-slate-400">Scan code posted at the security gate to record your entry credentials.</p>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Your Full Name</Label>
                <Input
                  placeholder="e.g. Hammad Khan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-slate-950 border-slate-800 focus:border-primary text-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Phone Number</Label>
                  <Input
                    placeholder="e.g. 03001234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-slate-950 border-slate-800 focus:border-primary text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300">CNIC / National ID</Label>
                  <Input
                    placeholder="e.g. 35201-1234567-1"
                    value={cnic}
                    onChange={(e) => setCnic(e.target.value)}
                    className="bg-slate-950 border-slate-800 focus:border-primary text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Purpose of Entry</Label>
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-800 rounded-md text-sm bg-slate-950 text-white focus:border-primary focus:outline-none"
                  >
                    <option value="meeting">Meeting host / Principal</option>
                    <option value="pickup">Student Pick up</option>
                    <option value="delivery">Item Delivery</option>
                    <option value="other">Other / Support</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Student Roll Number (Optional)</Label>
                  <Input
                    placeholder="Provide if picking up a student"
                    value={studentRoll}
                    onChange={(e) => setStudentRoll(e.target.value)}
                    className="bg-slate-950 border-slate-800 focus:border-primary text-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">Purpose Details (Optional)</Label>
                <Input
                  placeholder="e.g. Pick up textbooks from class 4 coordinator"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  className="bg-slate-950 border-slate-800 focus:border-primary text-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">Email Address (Optional)</Label>
                <Input
                  type="email"
                  placeholder="e.g. user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-slate-950 border-slate-800 focus:border-primary text-white"
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/95 hover:to-indigo-600/95 text-white font-semibold py-2 rounded-xl mt-4 shadow-lg shadow-primary/20 gap-2"
              >
                {loading ? "Registering entry..." : "Submit Registration"} <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-slate-900/60 border-slate-800/80 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden p-6 text-center space-y-6">
            <div className="flex flex-col items-center gap-2">
              <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <CheckCircle className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold font-display text-white">Registration Successful</h2>
              <p className="text-xs text-slate-400">Gate ticket generated. Show code below to security staff.</p>
            </div>

            {/* Premium entry ticket OTP pass card */}
            <div className="bg-slate-950 p-6 rounded-2xl border border-dashed border-slate-800 max-w-sm mx-auto space-y-4">
              <div className="font-mono text-3xl font-black letter-spacing-4 tracking-widest text-primary animate-pulse">
                {registeredPass.qr_code_token}
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                GATE PASS OTP CODE
              </div>

              <div className="text-left text-xs space-y-2 border-t border-slate-900 pt-4">
                <div className="flex justify-between">
                  <span className="text-slate-500">Visitor</span>
                  <span className="font-bold text-slate-200">{registeredPass.visitor_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Scheduled</span>
                  <span className="font-semibold text-slate-200">{format(new Date(registeredPass.scheduled_date), "PP")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Purpose</span>
                  <span className="font-semibold text-slate-200 capitalize">{registeredPass.purpose}</span>
                </div>
              </div>
            </div>

            {/* Notifications Alert simulation log box */}
            {notificationsSim && (
              <div className="text-left space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800 text-xs">
                <h4 className="font-bold text-slate-400 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-indigo-400" /> Dispatch Alerts Simulation
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-300">
                    <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span>{notificationsSim.sms}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span>{notificationsSim.whatsapp}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span>{notificationsSim.email}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={handlePrint} variant="outline" className="flex-1 border-slate-800 hover:bg-slate-800 text-slate-200">
                <Printer className="h-4 w-4 mr-2" /> Print Ticket
              </Button>
              <Button onClick={() => setRegisteredPass(null)} className="flex-1 bg-primary text-white font-semibold">
                Done
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
