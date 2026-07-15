import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChildInfo } from "@/hooks/useMyChildren";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import {
  UserPlus,
  QrCode,
  Calendar,
  Phone,
  Shield,
  Search,
  CheckCircle,
  Clock,
  Printer,
  ChevronRight,
  Inbox,
  AlertTriangle,
  Download
} from "lucide-react";
import { toast } from "sonner";

interface ParentVisitorModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

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
  checkin_at: string | null;
  checkout_at: string | null;
  student_id: string | null;
}

export default function ParentVisitorModule({ child, schoolId }: ParentVisitorModuleProps) {
  const [passes, setPasses] = useState<VisitorPass[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cnic, setCnic] = useState("");
  const [purpose, setPurpose] = useState("meeting");
  const [details, setDetails] = useState("");
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [mapChild, setMapChild] = useState(true);

  // View QR Pass state
  const [selectedPass, setSelectedPass] = useState<VisitorPass | null>(null);

  const loadPasses = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/visitors/my-passes");
      setPasses(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Could not load visitor passes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPasses();
  }, [child?.student_id]);

  const handleCreatePass = async () => {
    if (!name || !phone) {
      toast.error("Visitor name and phone number are required");
      return;
    }
    try {
      const body = {
        visitor_name: name,
        phone: phone,
        cnic: cnic || null,
        purpose: purpose,
        details: details || null,
        scheduled_date: scheduledDate,
        student_id: mapChild && child ? child.student_id : null,
      };
      const res = await apiClient.post("/visitors/pre-register", body);
      toast.success("Visitor pre-registered successfully!");
      setShowCreateDialog(false);
      setName("");
      setPhone("");
      setCnic("");
      setDetails("");
      loadPasses();
      setSelectedPass(res.data); // show pass QR immediately
    } catch (err: any) {
      console.error(err);
      const errMsg = err?.response?.data?.detail || "Failed to pre-register visitor";
      toast.error(errMsg);
    }
  };

  const printPass = (pass: VisitorPass) => {
    const w = window.open("", "_blank", "width=600,height=500");
    if (!w) {
      toast.error("Pop-up blocked. Allow pop-ups to print.");
      return;
    }
    const html = `
      <!doctype html>
      <html>
      <head>
        <title>Visitor Gate Pass - ${pass.visitor_name}</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 40px; color: #1a1a1a; }
          .pass-card { border: 2px solid #2563eb; border-radius: 16px; padding: 24px; max-width: 400px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          h2 { margin: 0 0 4px; color: #2563eb; }
          .otp { font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1e293b; margin: 20px 0; background: #f1f5f9; padding: 12px; border-radius: 8px; border: 1px dashed #cbd5e1; }
          .label { font-size: 11px; text-transform: uppercase; color: #64748b; margin-top: 12px; }
          .value { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <div class="pass-card">
          <h2>ALTRIX ACADEMY</h2>
          <div style="font-size: 12px; color: #64748b; margin-bottom: 16px;">GATE ENTRY PASS</div>
          
          <div class="otp">${pass.qr_code_token}</div>
          
          <div class="label">Visitor Name</div>
          <div class="value">${pass.visitor_name}</div>
          
          <div class="label">Scheduled Date</div>
          <div class="value">${format(new Date(pass.scheduled_date), "PP")}</div>
          
          <div class="label">Purpose</div>
          <div class="value" style="text-transform: capitalize;">${pass.purpose}</div>
          
          <div style="font-size: 11px; color: #94a3b8; margin-top: 24px;">Please present this QR OTP Pass code to the gate security guard upon arrival.</div>
        </div>
        <script>setTimeout(() => window.print(), 300)</script>
      </body>
      </html>
    `;
    w.document.write(html);
    w.document.close();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "checked_in":
        return <Badge className="bg-emerald-500 hover:bg-emerald-600 font-semibold text-white">Checked In</Badge>;
      case "checked_out":
        return <Badge variant="outline" className="border-slate-300 text-slate-500 font-semibold">Checked Out</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
      default:
        return <Badge variant="secondary" className="font-semibold text-foreground">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-6 rounded-2xl border border-primary/20 backdrop-blur-md">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-display font-bold tracking-tight">Visitor Pre-Registration</h1>
          </div>
          <p className="text-muted-foreground">
            Register expected guests, pick-ups, or deliveries in advance to facilitate swift check-in at the security gate.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="bg-primary text-primary-foreground font-semibold">
          <UserPlus className="h-4 w-4 mr-2" /> Pre-Register Guest
        </Button>
      </div>

      {/* Mapped Child context notice */}
      {child && (
        <div className="bg-primary/5 border border-primary/10 p-4 rounded-xl flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>Passes created will automatically map to pickup authorization lists for <span className="font-bold text-primary">{child.first_name}</span>.</span>
          </div>
        </div>
      )}

      {/* Visitor Passes Table list */}
      <Card className="shadow-soft border-border/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold font-display">Pre-registered Gate Passes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="font-semibold pl-6">Visitor</TableHead>
                <TableHead className="font-semibold">Scheduled Date</TableHead>
                <TableHead className="font-semibold">Purpose</TableHead>
                <TableHead className="font-semibold text-center">Entry Code</TableHead>
                <TableHead className="font-semibold text-center">Status</TableHead>
                <TableHead className="font-semibold text-right pr-6">View Pass</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    Loading guest records...
                  </TableCell>
                </TableRow>
              ) : passes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                    No pre-registered guests found. Pre-register a visitor to generate entry codes.
                  </TableCell>
                </TableRow>
              ) : (
                passes.map((pass) => (
                  <TableRow key={pass.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground pl-6">
                      <div>
                        <div className="font-bold">{pass.visitor_name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" /> {pass.phone}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-semibold">
                      {format(new Date(pass.scheduled_date), "PP")}
                    </TableCell>
                    <TableCell className="text-xs capitalize font-medium">{pass.purpose}</TableCell>
                    <TableCell className="text-center font-mono font-bold text-sm bg-muted/20 rounded py-1 max-w-[100px] mx-auto border border-dashed border-border/80">
                      {pass.qr_code_token}
                    </TableCell>
                    <TableCell className="text-center">{getStatusBadge(pass.checkin_status)}</TableCell>
                    <TableCell className="text-right pr-6">
                      <Button onClick={() => setSelectedPass(pass)} variant="outline" size="sm" className="border-primary/20 hover:bg-primary/5">
                        <QrCode className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pre-Register Guest Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Register Expected Visitor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Visitor's Full Name</Label>
              <Input
                placeholder="e.g. Hammad Khan"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Phone Number</Label>
                <Input
                  placeholder="e.g. 03001234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>CNIC / National ID</Label>
                <Input
                  placeholder="e.g. 35201-1234567-1"
                  value={cnic}
                  onChange={(e) => setCnic(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Purpose of Entry</Label>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                >
                  <option value="meeting">Meeting host</option>
                  <option value="pickup">Student Pick up</option>
                  <option value="delivery">Item Delivery</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Purpose Details (Optional)</Label>
              <Input
                placeholder="e.g. Meeting principal, pick up diary books"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>

            {child && (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="map-child"
                  checked={mapChild}
                  onChange={(e) => setMapChild(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="map-child" className="text-xs font-semibold cursor-pointer">
                  Authorize this visitor for {child.first_name}'s pick up on this day
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowCreateDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleCreatePass} className="bg-primary text-primary-foreground font-semibold">
              Generate QR Pass Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View QR Code Pass details Modal */}
      <Dialog open={!!selectedPass} onOpenChange={(open) => !open && setSelectedPass(null)}>
        <DialogContent className="max-w-xs text-center p-6">
          {selectedPass && (
            <div className="space-y-4">
              <div>
                <h3 className="font-display font-bold text-lg text-primary">ALTRIX ACADEMY</h3>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block mt-0.5">Visitor Entry Pass</span>
              </div>

              {/* Simulated QR Code / Pass Card code block */}
              <div className="bg-muted/40 p-4 rounded-xl border border-dashed border-border/80 space-y-3">
                <div className="font-mono text-2xl font-black letter-spacing-4 text-foreground tracking-widest">
                  {selectedPass.qr_code_token}
                </div>
                <div className="text-[9px] text-muted-foreground">Present code to the security guard upon arrival</div>
              </div>

              <div className="text-left text-xs space-y-2 border-t pt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Visitor</span>
                  <span className="font-bold text-foreground">{selectedPass.visitor_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scheduled</span>
                  <span className="font-bold text-foreground">{format(new Date(selectedPass.scheduled_date), "PP")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Purpose</span>
                  <span className="font-bold text-foreground capitalize">{selectedPass.purpose}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Check-in Status</span>
                  <span className="font-semibold text-foreground">{selectedPass.checkin_status.toUpperCase()}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={() => printPass(selectedPass)} variant="outline" className="flex-1 gap-2">
                  <Printer className="h-4 w-4" /> Print
                </Button>
                <Button onClick={() => setSelectedPass(null)} className="flex-1 bg-primary text-primary-foreground font-semibold">
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
