import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Calendar, CheckCircle2, Clock, Heart, Plus, Search, ShieldAlert, User, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import type { ChildInfo } from "@/hooks/useMyChildren";

interface CounselingRecord {
  id: string;
  student_id: string;
  school_id: string;
  status: string | null;
  priority: string | null;
  reason_type: string | null;
  reason_details: string | null;
  scheduled_date: string | null;
  session_notes: string | null;
  outcome: string | null;
  created_at: string | null;
}

interface ParentCounselingModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

const PRIORITY_STYLES: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-rose-50 text-rose-700 border-rose-100 font-bold" },
  high:   { label: "High",   className: "bg-amber-50 text-amber-750 border-amber-105 font-bold" },
  normal: { label: "Normal", className: "bg-blue-50 text-blue-700 border-blue-100 font-semibold" },
  low:    { label: "Low",    className: "bg-slate-50 text-slate-500 border-slate-200 font-medium" },
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending:     { label: "Pending Review",     className: "bg-amber-50 text-amber-700 border-amber-200" },
  scheduled:   { label: "Scheduled",   className: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress: { label: "In Progress", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  completed:   { label: "Completed",   className: "bg-emerald-50 text-emerald-700 border-emerald-250" },
  cancelled:   { label: "Cancelled",   className: "bg-slate-100 text-slate-500 border-slate-200" },
};

const REASON_TYPES = [
  { value: "academic_stress",  label: "Academic stress / pressure" },
  { value: "behavioral",        label: "Behavioral concern" },
  { value: "social_emotional",  label: "Social / emotional well-being" },
  { value: "family_issue",      label: "Family issue or adjustment" },
  { value: "bullying",          label: "Bullying / peer conflicts" },
  { value: "attendance",        label: "Attendance concern" },
  { value: "career_guidance",   label: "Career / higher education guidance" },
  { value: "other",             label: "Other concern" },
];

export default function ParentCounselingModule({ child, schoolId }: ParentCounselingModuleProps) {
  const [records, setRecords] = useState<CounselingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [reasonType, setReasonType] = useState("academic_stress");
  const [priority, setPriority] = useState("normal");
  const [reasonDetails, setReasonDetails] = useState("");

  const fetchRecords = async () => {
    if (!child || !schoolId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_counseling_queue")
        .select("*")
        .eq("school_id", schoolId)
        .eq("student_id", child.student_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRecords((data || []) as CounselingRecord[]);
    } catch (err: any) {
      console.error("Error fetching counseling records:", err);
      toast.error("Failed to load counseling records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [child, schoolId]);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!child || !schoolId) return;
    if (!reasonDetails.trim()) {
      toast.error("Please explain your concern in the details section.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("ai_counseling_queue").insert({
        school_id: schoolId,
        student_id: child.student_id,
        priority: priority,
        reason_type: reasonType,
        reason_details: reasonDetails.trim(),
        status: "pending",
      });

      if (error) throw error;

      toast.success("Counseling support request submitted successfully. The school counselor will review it.");
      setRequestOpen(false);
      setReasonType("academic_stress");
      setPriority("normal");
      setReasonDetails("");
      fetchRecords();
    } catch (err: any) {
      console.error("Error requesting counseling:", err);
      toast.error(err.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  if (!child) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        <Heart className="h-10 w-10 text-slate-300 mb-2" />
        <p className="text-sm font-semibold text-slate-600">No Child Selected</p>
        <p className="text-xs text-slate-400 mt-1">Please select a child to view their counseling status.</p>
      </div>
    );
  }

  const childName = [child.first_name, child.last_name].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-800">Counseling & Guidance</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            View counseling history or request support for <span className="font-semibold text-blue-600">{childName}</span>
          </p>
        </div>
        <Button 
          onClick={() => setRequestOpen(true)} 
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-soft shrink-0"
        >
          <Plus className="h-4 w-4" />
          Request Support
        </Button>
      </div>

      {/* Intro info box */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/30 p-4 flex gap-3 text-slate-700">
        <AlertCircle className="h-5 w-5 text-blue-650 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-blue-800">Private & Confidential</p>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            All counseling records, discussion topics, and counselor details are private. Only designated school counselors, academic advisors, and you (the parents) have access to these files to ensure the emotional and academic safety of your child.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-24 bg-slate-50 border border-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white border border-slate-100 rounded-2xl shadow-sm">
          <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 mb-4 ring-8 ring-blue-50/50">
            <Heart className="h-8 w-8" />
          </div>
          <h3 className="font-display text-base font-bold text-slate-800">No Counseling Sessions Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            There are no active or past counseling support cases registered for {childName}.
          </p>
          <Button 
            variant="soft" 
            onClick={() => setRequestOpen(true)}
            className="mt-4 text-xs font-semibold"
          >
            Submit First Request
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map((rec) => {
            const pStyle = PRIORITY_STYLES[rec.priority ?? "normal"] || PRIORITY_STYLES.normal;
            const sStyle = STATUS_STYLES[rec.status ?? "pending"] || STATUS_STYLES.pending;
            const reasonLabel = REASON_TYPES.find(r => r.value === rec.reason_type)?.label ?? rec.reason_type;
            
            return (
              <Card 
                key={rec.id} 
                className="overflow-hidden border-slate-100 bg-white shadow-soft transition-all duration-200 hover:border-blue-100"
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">{reasonLabel}</span>
                        <Badge variant="outline" className={`text-[10px] py-0 px-2 rounded-full border ${pStyle.className}`}>
                          {pStyle.label}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Submitted on {rec.created_at ? format(parseISO(rec.created_at), "MMM d, yyyy") : "Unknown Date"}
                      </p>
                    </div>
                    <Badge variant="outline" className={`py-0.5 px-3 rounded-full border text-[11px] font-bold self-start sm:self-center ${sStyle.className}`}>
                      {sStyle.label}
                    </Badge>
                  </div>

                  <div className="text-xs bg-slate-50 rounded-xl p-3 border border-slate-100/50 space-y-1">
                    <p className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">Your Concern Details</p>
                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{rec.reason_details}</p>
                  </div>

                  {rec.scheduled_date && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 bg-blue-50/50 border border-blue-150/40 rounded-xl p-3">
                      <Calendar className="h-4 w-4 shrink-0 text-blue-600" />
                      <span>
                        Meeting scheduled: {format(parseISO(rec.scheduled_date), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </div>
                  )}

                  {rec.session_notes && (
                    <div className="text-xs border border-blue-50 bg-blue-50/10 rounded-xl p-3.5 space-y-1.5">
                      <p className="font-bold text-blue-800 text-[10px] uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                        Counselor Updates & Notes
                      </p>
                      <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{rec.session_notes}</p>
                    </div>
                  )}

                  {rec.outcome && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50/30 border border-emerald-100 rounded-xl p-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Outcome: {rec.outcome}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Counseling Request Modal */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white border border-slate-100">
          <form onSubmit={handleRequestSubmit}>
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-bold text-slate-800">Request Counseling Support</DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Submit a guidance or mental well-being referral for your child.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="reason-type" className="text-xs font-bold text-slate-700">Reason for Counseling</Label>
                <Select value={reasonType} onValueChange={setReasonType}>
                  <SelectTrigger id="reason-type" className="rounded-xl border-slate-200">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="text-xs">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="priority" className="text-xs font-bold text-slate-700">Urgency Level</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger id="priority" className="rounded-xl border-slate-200">
                    <SelectValue placeholder="Select urgency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low" className="text-xs">Low (General Guidance)</SelectItem>
                    <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                    <SelectItem value="high" className="text-xs">High (Needs Attention)</SelectItem>
                    <SelectItem value="urgent" className="text-xs">Urgent (Requires Immediate Support)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="details" className="text-xs font-bold text-slate-700">Describe your concern</Label>
                <Textarea
                  id="details"
                  placeholder="Please describe what has been happening, how long it has been going on, and any details that can help the counselor support your child..."
                  value={reasonDetails}
                  onChange={(e) => setReasonDetails(e.target.value)}
                  rows={4}
                  className="rounded-xl border-slate-200 resize-none text-xs focus-visible:ring-blue-500"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setRequestOpen(false)}
                className="rounded-xl text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-soft"
              >
                {submitting ? "Submitting..." : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
