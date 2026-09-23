import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import {
  ShieldAlert,
  CheckCircle,
  Scan,
  Phone,
  User,
  Users,
  Camera,
  Printer,
  Ban,
  Slash,
  Search,
  CheckCircle2,
  Clock,
  Plus,
  QrCode,
  Download,
  MessageCircle,
} from "lucide-react";
import { visitorPassAction } from "@/lib/visitor-pass-actions";
import type { VisitorPassInput } from "@/lib/documents/visitor-pass";
import { toast } from "sonner";

interface BlacklistRecord {
  id: string;
  name: string;
  cnic: string | null;
  phone: string | null;
  reason: string;
  is_active: boolean;
  created_at: string;
}

/**
 * The gate camera.
 *
 * Opens the device camera, shows what it sees, and hands back a JPEG of the
 * frame the operator chose. Every failure - no camera on the machine, a
 * browser that will not allow it, permission refused at the prompt - is
 * reported as itself, and nothing is handed back. A visitor whose photograph
 * could not be taken is recorded without one.
 */
function GateCamera({ onCapture, onClose }: { onCapture: (dataUrl: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This browser cannot open a camera. Check the visitor in without a photograph, or use a device that can.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch (err: any) {
        const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
        setProblem(
          denied
            ? "The browser was not allowed to use the camera. Allow it for this site, or check the visitor in without a photograph."
            : err?.name === "NotFoundError"
              ? "No camera was found on this machine."
              : "The camera could not be opened.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  const take = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setProblem("The frame could not be read from the camera.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.82));
    stop();
    onClose();
  };

  return (
    <div className="space-y-3 rounded-xl border p-3">
      {problem ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{problem}</p>
      ) : (
        <video ref={videoRef} playsInline muted className="w-full max-w-sm rounded-lg bg-black" />
      )}
      <div className="flex gap-2">
        <Button onClick={take} disabled={!ready || !!problem} size="sm">
          <Camera className="mr-2 h-4 w-4" /> Take photograph
        </Button>
        <Button onClick={() => { stop(); onClose(); }} variant="outline" size="sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function GateVisitorModule() {
  const { schoolSlug } = useParams<{ schoolSlug: string }>();
  const gateRegisterUrl = `${window.location.origin}/${schoolSlug || "demo"}/visitor-register`;

  const [activeTab, setActiveTab] = useState("scan");
  const [loading, setLoading] = useState(false);

  // Scan verification console state
  const [qrInput, setQrInput] = useState("");
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const [gatePhoto, setGatePhoto] = useState<string>("");
  const [cameraOpen, setCameraOpen] = useState(false);

  // Blacklist state
  const [blacklist, setBlacklist] = useState<BlacklistRecord[]>([]);
  const [newBlName, setNewBlName] = useState("");
  const [newBlPhone, setNewBlPhone] = useState("");
  const [newBlCnic, setNewBlCnic] = useState("");
  const [newBlReason, setNewBlReason] = useState("");

  const loadBlacklist = async () => {
    try {
      const res = await apiClient.get("/visitors/blacklist");
      setBlacklist(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadBlacklist();
  }, []);

  const handleVerify = async () => {
    if (!qrInput) return;
    setLoading(true);
    const cleanToken = qrInput.trim().toUpperCase();
    try {
      const res = await apiClient.get(`/visitors/verify/${cleanToken}`);
      setVerificationResult(res.data);
      setGatePhoto(""); // reset captured gate photo
    } catch (err: any) {
      console.error(err);
      toast.error("Visitor pass not found or invalid QR code");
      setVerificationResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckin = async () => {
    if (!verificationResult?.pass) return;
    try {
      const res = await apiClient.post(`/visitors/${verificationResult.pass.id}/checkin`, null, {
        params: { photo_url: gatePhoto || null },
      });
      toast.success("Visitor check-in completed successfully!");
      handleVerify(); // reload verification status
    } catch (err) {
      console.error(err);
      toast.error("Failed to complete check-in");
    }
  };

  const handleCheckout = async () => {
    if (!verificationResult?.pass) return;
    try {
      const res = await apiClient.post(`/visitors/${verificationResult.pass.id}/checkout`);
      toast.success("Visitor checked out!");
      handleVerify();
    } catch (err) {
      console.error(err);
      toast.error("Failed to check-out visitor");
    }
  };

  const handleAddToBlacklist = async () => {
    if (!newBlName || !newBlReason) {
      toast.error("Name and Block reason are required");
      return;
    }
    try {
      await apiClient.post("/visitors/blacklist", {
        name: newBlName,
        phone: newBlPhone || null,
        cnic: newBlCnic || null,
        reason: newBlReason,
      });
      toast.success("Person successfully blacklisted");
      setNewBlName("");
      setNewBlPhone("");
      setNewBlCnic("");
      setNewBlReason("");
      loadBlacklist();
    } catch (err) {
      console.error(err);
      toast.error("Failed to add person to blacklist");
    }
  };

  const handleRemoveFromBlacklist = async (id: string) => {
    try {
      await apiClient.delete(`/visitors/blacklist/${id}`);
      toast.success("Blacklist entry deactivated");
      loadBlacklist();
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove from blacklist");
    }
  };

  /** The visitor's badge, from the pass the gate just verified. */
  const badgeInput = (pass: any): VisitorPassInput => ({
    kind: "badge",
    visitorName: pass?.visitor_name ?? "Visitor",
    purpose: pass?.purpose ?? null,
    phone: pass?.phone ?? null,
    code: pass?.qr_code_token ?? null,
    scheduledDate: pass?.scheduled_date ?? null,
    checkInAt: pass?.checkin_at ?? null,
    details: pass?.details ?? null,
  });

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 max-w-6xl mx-auto">
      {/* Title Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">Security Gate Console</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
          Scan pre-registered entry QR passes, record live visitor details, capture check-in photos, and filter blacklist threats.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
          <TabsList className="inline-flex w-max min-w-full sm:w-auto p-1 rounded-xl">
            <TabsTrigger value="scan" className="gap-2 rounded-lg text-xs font-semibold whitespace-nowrap">
              <Scan className="h-3.5 w-3.5" /> Scan & Check-in
            </TabsTrigger>
            <TabsTrigger value="blacklist" className="gap-2 rounded-lg text-xs font-semibold whitespace-nowrap">
              <Ban className="h-3.5 w-3.5" /> Security Blacklist
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Scan & check-in console */}
        <TabsContent value="scan" className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Verify input card */}
            <Card className="shadow-soft lg:col-span-1 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display">Verify Gate Pass</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>QR Code Token / OTP Code</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. 5C9A3D"
                      value={qrInput}
                      onChange={(e) => setQrInput(e.target.value)}
                      className="font-mono tracking-widest text-center text-lg"
                      onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                    />
                    <Button onClick={handleVerify} disabled={loading} className="bg-primary text-primary-foreground font-semibold">
                      Verify
                    </Button>
                  </div>
                </div>

                {/* Verification result summary */}
                {verificationResult && (
                  <div className="border border-border/80 rounded-xl p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-foreground">{verificationResult.pass.visitor_name}</h4>
                        <span className="text-[10px] text-muted-foreground capitalize font-semibold">{verificationResult.pass.purpose}</span>
                      </div>
                      <Badge variant={verificationResult.pass.checkin_status === "checked_in" ? "default" : "secondary"}>
                        {verificationResult.pass.checkin_status.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="text-xs space-y-2 border-t pt-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Phone</span>
                        <span className="font-semibold">{verificationResult.pass.phone}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">CNIC</span>
                        <span className="font-semibold">{verificationResult.pass.cnic || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Share gate register QR code */}
            <Card className="shadow-soft lg:col-span-1 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display flex items-center gap-2 text-foreground">
                  <QrCode className="h-5 w-5 text-primary" /> Share Gate Registration QR
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-center">
                <p className="text-xs text-muted-foreground text-left">
                  Guests who do not have a pass can scan this QR code posted at the security gate to self-register their check-in details.
                </p>
                <div className="bg-muted/40 p-4 rounded-xl border border-dashed border-border/80 flex flex-col items-center justify-center gap-2">
                  <QrCode className="h-16 w-16 text-primary animate-pulse" />
                  <div className="font-semibold text-[10px] text-foreground truncate max-w-full">
                    {gateRegisterUrl}
                  </div>
                </div>
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(gateRegisterUrl);
                    toast.success("Gate register URL copied to clipboard!");
                  }}
                  variant="outline"
                  className="w-full text-xs font-semibold"
                >
                  Copy Link
                </Button>
              </CardContent>
            </Card>

            {/* Check-in operator actions console */}
            <div className="lg:col-span-2 space-y-6">
              {verificationResult ? (
                <Card className="shadow-soft border-border/60">
                  <CardHeader className="border-b">
                    <CardTitle className="text-base font-bold font-display">Gate Control Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    {/* Flashing blacklist alarm if visitor matches active blacklist */}
                    {verificationResult.blacklisted && (
                      <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl animate-pulse">
                        <ShieldAlert className="h-6 w-6 text-destructive shrink-0" />
                        <div>
                          <div className="font-bold text-sm">SECURITY ALARM: Blacklisted Individual</div>
                          <div className="text-xs">Reason: {verificationResult.blacklist_reason || "Access prohibited"}</div>
                        </div>
                      </div>
                    )}

                    {/* Mapped student pickup authorization details */}
                    {verificationResult.student && (
                      <div className={`p-4 rounded-xl border flex items-center justify-between ${
                        verificationResult.pickup_authorized
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800"
                          : "bg-amber-500/10 border-amber-500/20 text-amber-800"
                      }`}>
                        <div className="flex items-center gap-3">
                          <Users className="h-6 w-6 shrink-0" />
                          <div>
                            <div className="font-bold text-sm">Student Pickup Authorization</div>
                            <div className="text-xs">
                              Visitor is authorized to pick up <span className="font-bold">{verificationResult.student.name}</span>.
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className={verificationResult.pickup_authorized ? "border-emerald-500/30 text-emerald-700" : "border-amber-500/30 text-amber-700"}>
                          {verificationResult.pickup_authorized ? "AUTHORIZED" : "UNAUTHORIZED"}
                        </Badge>
                      </div>
                    )}

                    {/* The gate camera. Optional: a visitor with no photograph
                        is checked in without one, never with a stand-in. */}
                    {verificationResult.pass.checkin_status !== "checked_in" && (
                      <div className="space-y-3">
                        <Label className="flex items-center gap-2">
                          <Camera className="h-4 w-4 text-muted-foreground" /> Visitor photograph (optional)
                        </Label>
                        {cameraOpen ? (
                          <GateCamera onCapture={setGatePhoto} onClose={() => setCameraOpen(false)} />
                        ) : (
                          <div className="flex items-center gap-4">
                            <Button
                              onClick={() => setCameraOpen(true)}
                              variant="outline"
                              className="border-primary/20 hover:bg-primary/5 text-foreground gap-2"
                            >
                              {gatePhoto ? "Retake photograph" : "Open camera"}
                            </Button>
                            {gatePhoto ? (
                              <>
                                <img
                                  src={gatePhoto}
                                  alt="Photograph taken at the gate"
                                  className="h-14 w-14 rounded-lg object-cover border border-border"
                                />
                                <Button variant="ghost" size="sm" onClick={() => setGatePhoto("")}>
                                  Discard
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                None taken — the visitor will be checked in without a photograph.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Trigger buttons */}
                    <div className="flex gap-3 border-t pt-6">
                      {verificationResult.pass.checkin_status !== "checked_in" ? (
                        <Button
                          onClick={handleCheckin}
                          disabled={verificationResult.blacklisted}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        >
                          Record Entry (Check-In)
                        </Button>
                      ) : (
                        <Button
                          onClick={handleCheckout}
                          className="flex-1 bg-slate-700 hover:bg-slate-800 text-white font-semibold"
                        >
                          Record Departure (Check-Out)
                        </Button>
                      )}
                      <Button onClick={() => void visitorPassAction("print", badgeInput(verificationResult.pass))} variant="outline" className="gap-2">
                        <Printer className="h-4 w-4" /> Print Badge
                      </Button>
                      <Button onClick={() => void visitorPassAction("download", badgeInput(verificationResult.pass))} variant="outline" size="icon" title="Download badge PDF">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button onClick={() => void visitorPassAction("share", badgeInput(verificationResult.pass), verificationResult.pass?.phone)} variant="outline" size="icon" title="Send badge on WhatsApp">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl text-muted-foreground text-center">
                  <Scan className="h-10 w-10 text-muted-foreground/60 mb-3" />
                  <p>Scan a pre-registered entry code or input OTP to access control actions.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Security Blacklist Tab */}
        <TabsContent value="blacklist" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Creator form */}
            <Card className="shadow-soft md:col-span-1 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display">Add Block Rule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g. Aslam Khan"
                    value={newBlName}
                    onChange={(e) => setNewBlName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Phone Number</Label>
                    <Input
                      placeholder="e.g. 03001234567"
                      value={newBlPhone}
                      onChange={(e) => setNewBlPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CNIC / ID</Label>
                    <Input
                      placeholder="e.g. 35201-1234567-1"
                      value={newBlCnic}
                      onChange={(e) => setNewBlCnic(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Reason for Block</Label>
                  <Input
                    placeholder="e.g. Attempted pick up without parent signature"
                    value={newBlReason}
                    onChange={(e) => setNewBlReason(e.target.value)}
                  />
                </div>
                <Button onClick={handleAddToBlacklist} className="w-full bg-primary text-primary-foreground font-semibold">
                  <Plus className="h-4 w-4 mr-2" /> Add Block Rule
                </Button>
              </CardContent>
            </Card>

            {/* Blacklist records */}
            <Card className="shadow-soft md:col-span-2 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display">Active Blocked Persons</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="font-semibold pl-6">Name</TableHead>
                      <TableHead className="font-semibold">CNIC / ID</TableHead>
                      <TableHead className="font-semibold">Reason</TableHead>
                      <TableHead className="font-semibold text-right pr-6">Remove</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blacklist.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                          No blacklisted records found. Security checks are clear.
                        </TableCell>
                      </TableRow>
                    ) : (
                      blacklist.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-bold text-foreground pl-6">{record.name}</TableCell>
                          <TableCell className="text-xs">{record.cnic || record.phone || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{record.reason}</TableCell>
                          <TableCell className="text-right pr-6">
                            <Button onClick={() => handleRemoveFromBlacklist(record.id)} variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                              <Slash className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
