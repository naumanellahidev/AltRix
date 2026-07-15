import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSession } from "@/hooks/useSession";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import {
  Award,
  PenTool,
  CheckCircle,
  Clock,
  Plus,
  Users,
  MessageSquare,
  AlertTriangle,
  HelpCircle,
  FileText,
  Bookmark,
  ChevronRight,
  TrendingUp,
  Inbox,
  Star
} from "lucide-react";
import { toast } from "sonner";

interface StaffKpi {
  id: string;
  punctuality_score: number;
  results_score: number;
  parent_feedback_score: number;
  co_curricular_score: number;
  average_score: number;
  evaluation_period: string;
  created_at: string;
}

interface Appraisal {
  id: string;
  staff_user_id: string;
  self_appraisal_text: string;
  reviewer_user_id: string | null;
  review_comments: string | null;
  status: string;
  salary_increment_pct: number;
  created_at: string;
}

interface PipPlan {
  id: string;
  staff_user_id: string;
  issues_identified: string;
  action_steps: string;
  deadline_date: string;
  status: string;
}

export default function StaffAppraisalModule() {
  const { user } = useSession();
  const [activeTab, setActiveTab] = useState("kpi");
  const [role, setRole] = useState("teacher"); // fallback
  const [kpiScores, setKpiScores] = useState<StaffKpi[]>([]);
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [pendingReviews, setPendingReviews] = useState<Appraisal[]>([]);
  const [pips, setPips] = useState<PipPlan[]>([]);
  const [loading, setLoading] = useState(false);

  // 360 feedback state
  const [feedbackSummary, setFeedbackSummary] = useState<any | null>(null);

  // Modals state
  const [showSelfAppraisal, setShowSelfAppraisal] = useState(false);
  const [showKpiDialog, setShowKpiDialog] = useState(false);
  const [showPipDialog, setShowPipDialog] = useState(false);

  // Form states
  const [selfAppraisalText, setSelfAppraisalText] = useState("");
  const [targetStaffId, setTargetStaffId] = useState("");
  
  // KPI Create form
  const [punctuality, setPunctuality] = useState(5.0);
  const [results, setResults] = useState(5.0);
  const [parentFeedback, setParentFeedback] = useState(5.0);
  const [coCurricular, setCoCurricular] = useState(5.0);
  const [evalPeriod, setEvalPeriod] = useState("Annual 2026");

  // Review Appraisal form
  const [selectedAppraisal, setSelectedAppraisal] = useState<Appraisal | null>(null);
  const [reviewComments, setReviewComments] = useState("");
  const [incrementPct, setIncrementPct] = useState(0.0);

  // PIP Creator form
  const [pipIssues, setPipIssues] = useState("");
  const [pipAction, setPipAction] = useState("");
  const [pipDeadline, setPipDeadline] = useState("");

  // Student 360 Rating widget
  const [ratingTeacherId, setRatingTeacherId] = useState("");
  const [ratingVal, setRatingVal] = useState(5);
  const [ratingComment, setRatingComment] = useState("");

  const checkUserRole = async () => {
    try {
      const { data: auth } = await apiClient.get("/users/me");
      if (auth?.roles && auth.roles.length > 0) {
        const adminRoles = ["super_admin", "school_owner", "principal", "vice_principal"];
        const isAdmin = auth.roles.some((r: string) => adminRoles.includes(r));
        if (isAdmin) setRole("principal");
        else if (auth.roles.includes("student")) setRole("student");
        else setRole("teacher");
      }
    } catch (e) {
      setRole("teacher");
    }
  };

  const loadKpis = async () => {
    try {
      const res = await apiClient.get("/appraisals/kpis");
      setKpiScores(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAppraisals = async () => {
    try {
      const res = await apiClient.get("/appraisals/my-appraisal");
      setAppraisals(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPendingReviews = async () => {
    try {
      const res = await apiClient.get("/appraisals/reviews");
      setPendingReviews(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPips = async () => {
    try {
      const res = await apiClient.get("/appraisals/pip");
      setPips(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    checkUserRole();
    loadKpis();
    loadAppraisals();
    loadPendingReviews();
    loadPips();
  }, []);

  const handleSubmitSelfAppraisal = async () => {
    if (!selfAppraisalText) return;
    try {
      await apiClient.post("/appraisals/my-appraisal", {
        self_appraisal_text: selfAppraisalText,
      });
      toast.success("Self-appraisal submitted successfully!");
      setShowSelfAppraisal(false);
      setSelfAppraisalText("");
      loadAppraisals();
      loadPendingReviews();
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit appraisal request");
    }
  };

  const handleReviewAppraisal = async (statusChoice: string) => {
    if (!selectedAppraisal) return;
    try {
      await apiClient.patch(`/appraisals/${selectedAppraisal.id}/review`, null, {
        params: {
          status_choice: statusChoice,
          review_comments: reviewComments || null,
          salary_increment_pct: incrementPct,
        },
      });
      toast.success(`Appraisal marked ${statusChoice}! Salary increment processed.`);
      setSelectedAppraisal(null);
      setReviewComments("");
      setIncrementPct(0);
      loadPendingReviews();
      loadAppraisals();
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit appraisal review decision");
    }
  };

  const handleCreateKpi = async () => {
    if (!targetStaffId) return;
    try {
      await apiClient.post("/appraisals/kpis", null, {
        params: {
          staff_user_id: targetStaffId,
          evaluation_period: evalPeriod,
          punctuality,
          results,
          parent_feedback: parentFeedback,
          co_curricular: coCurricular,
        },
      });
      toast.success("KPI scorecard recorded!");
      setShowKpiDialog(false);
      loadKpis();
    } catch (err) {
      console.error(err);
      toast.error("Failed to log KPI scores");
    }
  };

  const handleCreatePip = async () => {
    if (!targetStaffId || !pipIssues || !pipAction || !pipDeadline) return;
    try {
      await apiClient.post("/appraisals/pip", {
        staff_user_id: targetStaffId,
        issues_identified: pipIssues,
        action_steps: pipAction,
        deadline_date: pipDeadline,
      });
      toast.success("Performance Improvement Plan issued to teacher");
      setShowPipDialog(false);
      setPipIssues("");
      setPipAction("");
      loadPips();
    } catch (err) {
      console.error(err);
      toast.error("Failed to issue Performance Improvement Plan");
    }
  };

  const handleTogglePip = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "completed" : "failed";
    try {
      await apiClient.patch(`/appraisals/pip/${id}`, null, {
        params: { status_choice: nextStatus },
      });
      toast.success("PIP plan status updated!");
      loadPips();
    } catch (err) {
      console.error(err);
      toast.error("Failed to toggle PIP status");
    }
  };

  const handleRatingSubmit = async () => {
    if (!ratingTeacherId || !ratingComment) {
      toast.error("Review comment is required");
      return;
    }
    try {
      await apiClient.post("/appraisals/feedback-360", {
        staff_user_id: ratingTeacherId,
        rating: ratingVal,
        comments: ratingComment,
      });
      toast.success("Anonymous 360 review rating recorded! Thank you.");
      setRatingTeacherId("");
      setRatingComment("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to record anonymous rating");
    }
  };

  const loadFeedbackSummary = async (staffId: string) => {
    try {
      const res = await apiClient.get("/appraisals/feedback-360-summary", {
        params: { staff_user_id: staffId },
      });
      setFeedbackSummary(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const isPrincipal = role === "principal";
  const isStudent = role === "student";

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-6 rounded-2xl border border-primary/20 backdrop-blur-md">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Award className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-display font-bold tracking-tight">Staff Appraisal Board</h1>
          </div>
          <p className="text-muted-foreground font-medium">
            Monitor punctuality and results scorecards, run review approval flows, and review anonymous 360 student feedback.
          </p>
        </div>
        {!isStudent && (
          <div className="flex gap-2 shrink-0">
            {isPrincipal ? (
              <>
                <Button onClick={() => setShowKpiDialog(true)} variant="outline">
                  Record KPI Scores
                </Button>
                <Button onClick={() => setShowPipDialog(true)} className="bg-primary text-primary-foreground font-semibold">
                  Issue PIP Plan
                </Button>
              </>
            ) : (
              <Button onClick={() => setShowSelfAppraisal(true)} className="bg-primary text-primary-foreground font-semibold">
                Submit Self Appraisal
              </Button>
            )}
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="kpi" className="gap-2 rounded-lg">
            <Award className="h-4 w-4" /> KPI Scorecards
          </TabsTrigger>
          {!isStudent && (
            <TabsTrigger value="appraisals" className="gap-2 rounded-lg">
              <PenTool className="h-4 w-4" /> Appraisal Workflow
            </TabsTrigger>
          )}
          {!isStudent && (
            <TabsTrigger value="pip" className="gap-2 rounded-lg">
              <AlertTriangle className="h-4 w-4" /> PIP Plans ({pips.length})
            </TabsTrigger>
          )}
          {isStudent && (
            <TabsTrigger value="student-feedback" className="gap-2 rounded-lg">
              <Star className="h-4 w-4" /> Anonymous 360 Rating
            </TabsTrigger>
          )}
        </TabsList>

        {/* KPI Scorecards Tab */}
        <TabsContent value="kpi" className="space-y-4">
          <Card className="shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display">Staff Performance Scorecard</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold pl-6">Staff Member</TableHead>
                    <TableHead className="font-semibold text-center">Punctuality</TableHead>
                    <TableHead className="font-semibold text-center">Result Metric</TableHead>
                    <TableHead className="font-semibold text-center">Parent Feedback</TableHead>
                    <TableHead className="font-semibold text-center">Co-curricular</TableHead>
                    <TableHead className="font-semibold text-right pr-6">Average Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kpiScores.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No appraisal scorecards logged yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    kpiScores.map((kpi) => (
                      <TableRow key={kpi.id}>
                        <TableCell className="pl-6 font-bold text-foreground">
                          Teacher ID: {kpi.staff_user_id.slice(0, 8)}
                          <div className="text-[10px] text-muted-foreground font-normal">{kpi.evaluation_period}</div>
                        </TableCell>
                        <TableCell className="text-center font-mono font-bold">{kpi.punctuality_score} / 10</TableCell>
                        <TableCell className="text-center font-mono font-bold">{kpi.results_score} / 10</TableCell>
                        <TableCell className="text-center font-mono font-bold">{kpi.parent_feedback_score} / 10</TableCell>
                        <TableCell className="text-center font-mono font-bold">{kpi.co_curricular_score} / 10</TableCell>
                        <TableCell className="text-right pr-6 font-bold text-primary font-mono">{kpi.average_score} / 10</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appraisal workflows Tab */}
        <TabsContent value="appraisals" className="space-y-6">
          {isPrincipal ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Review requests list */}
              <Card className="md:col-span-2 shadow-soft border-border/60">
                <CardHeader>
                  <CardTitle className="text-base font-bold font-display">Self Appraisals Pending review</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="font-semibold pl-6">Teacher ID</TableHead>
                        <TableHead className="font-semibold">Self-Appraisal description</TableHead>
                        <TableHead className="font-semibold text-right pr-6">Review</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingReviews.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                            No pending self-appraisal reviews.
                          </TableCell>
                        </TableRow>
                      ) : (
                        pendingReviews.map((app) => (
                          <TableRow key={app.id}>
                            <TableCell className="pl-6 font-bold text-foreground">
                              {app.staff_user_id.slice(0, 8)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-sm">
                              {app.self_appraisal_text}
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <Button
                                onClick={() => {
                                  setSelectedAppraisal(app);
                                  loadFeedbackSummary(app.staff_user_id);
                                }}
                                variant="outline"
                                size="sm"
                              >
                                Review
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Selected Appraisal review board */}
              {selectedAppraisal ? (
                <Card className="shadow-soft border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base font-bold font-display">Appraisal decision</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-muted/30 p-3 rounded-lg text-xs space-y-2">
                      <div className="font-bold text-foreground">Teacher self comments:</div>
                      <p className="text-muted-foreground leading-relaxed italic">"{selectedAppraisal.self_appraisal_text}"</p>
                    </div>

                    {/* Anonymous 360 rating preview */}
                    {feedbackSummary && (
                      <div className="bg-primary/5 p-3 rounded-lg text-xs border border-primary/10">
                        <div className="font-bold text-primary flex items-center gap-1.5 mb-1">
                          <Star className="h-4 w-4 text-amber-500 fill-amber-500" /> Anonymous 360 Student Rating
                        </div>
                        <p className="font-semibold text-foreground">
                          Average Rating: <span className="font-bold text-primary">{feedbackSummary.average_rating} / 5.0</span> ({feedbackSummary.total_reviews} reviews)
                        </p>
                      </div>
                    )}

                    <div className="space-y-1.5 pt-2">
                      <Label>Salary Increment Percentage (%)</Label>
                      <Input
                        type="number"
                        placeholder="e.g. 5.0"
                        value={incrementPct}
                        onChange={(e) => setIncrementPct(Number(e.target.value))}
                      />
                      <p className="text-[10px] text-muted-foreground">This updates their active basic salary record in payroll.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Review Comments / Notes</Label>
                      <Input
                        placeholder="Principal appraisal comments..."
                        value={reviewComments}
                        onChange={(e) => setReviewComments(e.target.value)}
                      />
                    </div>

                    <div className="flex gap-2 pt-2 border-t">
                      <Button onClick={() => handleReviewAppraisal("approved")} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                        Approve Increment
                      </Button>
                      <Button onClick={() => handleReviewAppraisal("rejected")} variant="destructive" className="flex-1">
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 bg-card border rounded-2xl text-muted-foreground text-center text-xs">
                  Select a review item to evaluate.
                </div>
              )}
            </div>
          ) : (
            <Card className="shadow-soft border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display">My Appraisal logs</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="font-semibold pl-6">Submitted Date</TableHead>
                      <TableHead className="font-semibold">Self appraisal statement</TableHead>
                      <TableHead className="font-semibold text-center">Status</TableHead>
                      <TableHead className="font-semibold text-right pr-6">Increment approved</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appraisals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No self-appraisal submissions logged. Click "Submit Self Appraisal" to report.
                        </TableCell>
                      </TableRow>
                    ) : (
                      appraisals.map((app) => (
                        <TableRow key={app.id}>
                          <TableCell className="pl-6 text-xs">{format(new Date(app.created_at), "PP")}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-sm truncate">{app.self_appraisal_text}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={app.status === "approved" ? "default" : app.status === "rejected" ? "destructive" : "secondary"}>
                              {app.status.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-6 font-bold font-mono">
                            {app.status === "approved" ? `+${app.salary_increment_pct}%` : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* PIP Plans Tab */}
        <TabsContent value="pip" className="space-y-4">
          <Card className="shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Active Performance Improvement Plans
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold pl-6">Staff Member</TableHead>
                    <TableHead className="font-semibold">Issues Identified</TableHead>
                    <TableHead className="font-semibold">Action Steps</TableHead>
                    <TableHead className="font-semibold text-center">Deadline</TableHead>
                    <TableHead className="font-semibold text-right pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pips.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No active performance improvement plans mapped.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pips.map((pip) => (
                      <TableRow key={pip.id}>
                        <TableCell className="pl-6 font-bold text-foreground">
                          Teacher: {pip.staff_user_id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{pip.issues_identified}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{pip.action_steps}</TableCell>
                        <TableCell className="text-center text-xs font-semibold text-destructive">
                          {format(new Date(pip.deadline_date), "PP")}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          {isPrincipal ? (
                            <Button onClick={() => handleTogglePip(pip.id, pip.status)} size="xs" variant="outline" className="gap-1 border-primary/20">
                              {pip.status.toUpperCase()}
                            </Button>
                          ) : (
                            <Badge variant={pip.status === "completed" ? "default" : pip.status === "failed" ? "destructive" : "secondary"}>
                              {pip.status.toUpperCase()}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Student feedback Tab */}
        <TabsContent value="student-feedback" className="space-y-6">
          <Card className="max-w-md mx-auto shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500 fill-amber-500" /> Anonymous Teacher Feedback
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label>Choose Class Teacher</Label>
                <Input
                  placeholder="Input Teacher Profile UUID"
                  value={ratingTeacherId}
                  onChange={(e) => setRatingTeacherId(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Rating Score (1 - 5 Stars)</Label>
                <select
                  value={ratingVal}
                  onChange={(e) => setRatingVal(Number(e.target.value))}
                  className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                >
                  <option value={5}>⭐⭐⭐⭐⭐ (Excellent)</option>
                  <option value={4}>⭐⭐⭐⭐ (Very Good)</option>
                  <option value={3}>⭐⭐⭐ (Good)</option>
                  <option value={2}>⭐⭐ (Needs Improvement)</option>
                  <option value={1}>⭐ (Poor)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Anonymous Comments / Review details</Label>
                <Input
                  placeholder="Write honest teacher review comments..."
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">Your student identity will never be shared with anyone.</p>
              </div>

              <Button onClick={handleRatingSubmit} className="w-full bg-primary text-primary-foreground font-semibold">
                Submit Feedback Review
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Self Appraisal submit Dialog */}
      <Dialog open={showSelfAppraisal} onOpenChange={setShowSelfAppraisal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Write Self Appraisal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Self Appraisal Text (List results, punctuality notes, contributions)</Label>
            <textarea
              placeholder="e.g. Achieved 94% class pass rates, maintained 100% attendance, organized annual science fair..."
              value={selfAppraisalText}
              onChange={(e) => setSelfAppraisalText(e.target.value)}
              className="w-full min-h-[120px] p-3 border border-input rounded-md text-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSelfAppraisal(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleSubmitSelfAppraisal} className="bg-primary text-primary-foreground font-semibold">
              Submit Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual KPI score creator Dialog */}
      <Dialog open={showKpiDialog} onOpenChange={setShowKpiDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Log Staff KPI Scores</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Teacher / Staff UUID</Label>
              <Input
                placeholder="Paste teacher profile ID..."
                value={targetStaffId}
                onChange={(e) => setTargetStaffId(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Punctuality (1-10)</Label>
                <Input
                  type="number"
                  value={punctuality}
                  onChange={(e) => setPunctuality(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Class Results (1-10)</Label>
                <Input
                  type="number"
                  value={results}
                  onChange={(e) => setResults(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Parent Feedback (1-10)</Label>
                <Input
                  type="number"
                  value={parentFeedback}
                  onChange={(e) => setParentFeedback(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Co-curricular (1-10)</Label>
                <Input
                  type="number"
                  value={coCurricular}
                  onChange={(e) => setCoCurricular(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Evaluation Period</Label>
              <Input
                value={evalPeriod}
                onChange={(e) => setEvalPeriod(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowKpiDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleCreateKpi} className="bg-primary text-primary-foreground font-semibold">
              Save Scorecard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PIP Create Dialog */}
      <Dialog open={showPipDialog} onOpenChange={setShowPipDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Issue Improvement Plan (PIP)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Teacher / Staff UUID</Label>
              <Input
                placeholder="Target staff user ID..."
                value={targetStaffId}
                onChange={(e) => setTargetStaffId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Issues Identified</Label>
              <Input
                placeholder="e.g. Low student engagement, late logs..."
                value={pipIssues}
                onChange={(e) => setPipIssues(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Action Steps</Label>
              <Input
                placeholder="e.g. Weekly lesson plan submissions..."
                value={pipAction}
                onChange={(e) => setPipAction(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Target Deadline</Label>
              <Input
                type="date"
                value={pipDeadline}
                onChange={(e) => setPipDeadline(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowPipDialog(false)} variant="ghost">Cancel</Button>
            <Button onClick={handleCreatePip} className="bg-primary text-primary-foreground font-semibold">
              Issue PIP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
