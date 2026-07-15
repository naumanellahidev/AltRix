import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChildInfo } from "@/hooks/useMyChildren";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import {
  FileText,
  Printer,
  TrendingUp,
  Award,
  CheckCircle,
  Share2,
  Lock,
  ChevronRight,
  User,
  Activity,
  Download,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface ParentReportCardModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

interface ReportCardSummary {
  id: string;
  exam_id: string | null;
  student_id: string;
  period_type: string;
  period_label: string;
  percentage: number | null;
  overall_grade: string | null;
  is_published: boolean;
  published_at: string | null;
  academic_year: string | null;
}

interface SubjectEntry {
  id: string;
  subject_name: string;
  marks_obtained: number | null;
  max_marks: number | null;
  percentage: number | null;
  grade: string | null;
  gpa_points: number | null;
  position_in_subject: number | null;
  class_average: number | null;
  highest_in_class: number | null;
  teacher_comment: string | null;
}

interface CoCurricular {
  id: string;
  activity_name: string;
  category: string | null;
  grade: string | null;
  remarks: string | null;
}

interface DetailData {
  report_card: any;
  subject_entries: SubjectEntry[];
  co_curricular: CoCurricular[];
  student: any;
}

export default function ParentReportCardModule({ child, schoolId }: ParentReportCardModuleProps) {
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<ReportCardSummary[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // Load student's published report cards
  useEffect(() => {
    if (!child?.student_id) return;
    setLoading(true);
    apiClient
      .get(`/report-cards/student/${child.student_id}`)
      .then((res) => {
        setCards(res.data || []);
        if (res.data && res.data.length > 0) {
          setSelectedCardId(res.data[0].id);
        } else {
          setSelectedCardId(null);
          setDetail(null);
        }
      })
      .catch((err) => {
        console.error("Error loading report cards", err);
        setCards([]);
      })
      .finally(() => setLoading(false));
  }, [child?.student_id]);

  // Load details when card changes
  useEffect(() => {
    if (!selectedCardId) return;
    apiClient
      .get(`/report-cards/${selectedCardId}`)
      .then((res) => {
        setDetail(res.data);
      })
      .catch((err) => {
        console.error("Error loading card detail", err);
        toast.error("Could not load report card details");
      });
  }, [selectedCardId]);

  const handlePrint = async () => {
    if (!reportRef.current) return;
    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`ReportCard_${child?.first_name || "Student"}.pdf`);
      toast.success("PDF report card downloaded successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF document");
    }
  };

  const handleShare = () => {
    if (navigator.share && detail?.report_card) {
      navigator
        .share({
          title: `${child?.first_name}'s Report Card`,
          text: `Check out ${child?.first_name}'s report card for ${detail.report_card.period_label}.`,
          url: window.location.href,
        })
        .then(() => toast.success("Shared successfully"))
        .catch((err) => console.log("Share cancelled or failed", err));
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    }
  };

  if (!child) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-background">
        <User className="h-16 w-16 text-muted-foreground animate-pulse mb-4" />
        <p className="text-muted-foreground">Select a student profile to view report cards.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-6 rounded-2xl border border-primary/20 backdrop-blur-md">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Academic Report Cards</h1>
          <p className="text-muted-foreground mt-1">
            Official performance records and learning feedback for{" "}
            <span className="font-semibold text-primary">{child.first_name} {child.last_name || ""}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {detail && (
            <>
              <Button onClick={handlePrint} variant="outline" className="gap-2 border-primary/30 hover:border-primary">
                <Download className="h-4 w-4" /> Download PDF
              </Button>
              <Button onClick={handleShare} variant="default" className="gap-2 bg-gradient-primary-strong">
                <Share2 className="h-4 w-4" /> Share Record
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card className="shadow-soft border-border/60">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Terms & Eras
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-1">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Loading records...</div>
              ) : cards.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm flex flex-col items-center gap-2">
                  <AlertCircle className="h-8 w-8 text-amber-500" />
                  No published report cards.
                </div>
              ) : (
                cards.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCardId(c.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-all flex items-center justify-between ${
                      selectedCardId === c.id
                        ? "bg-primary text-primary-foreground font-semibold shadow-glow"
                        : "hover:bg-muted/80 text-foreground"
                    }`}
                  >
                    <div>
                      <div className="text-sm">{c.period_label}</div>
                      <div className={`text-xs ${selectedCardId === c.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {c.academic_year || "Academic Record"}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-70" />
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-6">
          {detail ? (
            <div className="space-y-6">
              <div
                ref={reportRef}
                className="bg-card text-card-foreground border-2 border-primary/20 shadow-elevated rounded-3xl p-6 md:p-10 space-y-8 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl -ml-24 -mb-24 pointer-events-none" />

                <div className="flex flex-col md:flex-row justify-between items-center pb-6 border-b border-border/80 gap-4">
                  <div className="text-center md:text-left">
                    <h2 className="text-2xl font-bold font-display tracking-tight text-primary">ALTRIX ACADEMY</h2>
                    <p className="text-xs tracking-widest text-muted-foreground uppercase font-semibold">
                      Inspiring Excellence, Nurturing Potential
                    </p>
                  </div>
                  <div className="text-center md:text-right space-y-1">
                    <Badge variant="outline" className="text-primary border-primary/30 text-xs px-3 py-1 font-semibold uppercase">
                      Official Report Document
                    </Badge>
                    {detail.report_card.published_at && (
                      <p className="text-[10px] text-muted-foreground">
                        Issued on: {format(new Date(detail.report_card.published_at), "PPP")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/40 p-4 rounded-xl text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Student Name</span>
                    <span className="font-semibold text-foreground">
                      {detail.student?.first_name} {detail.student?.last_name || ""}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Roll Number</span>
                    <span className="font-semibold text-foreground">{detail.student?.roll_number || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Academic Period</span>
                    <span className="font-semibold text-foreground">{detail.report_card.period_label}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Class Position</span>
                    <span className="font-semibold text-primary">
                      {detail.report_card.position_in_class ? (
                        <>
                          {detail.report_card.position_in_class}
                          <span className="text-xs text-muted-foreground font-normal">
                            {" "}
                            out of {detail.report_card.total_students_in_class || 1}
                          </span>
                        </>
                      ) : (
                        "N/A"
                      )}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-bold font-display tracking-tight flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" /> Subject-Wise Academic Achievement
                  </h3>
                  <div className="border border-border/80 rounded-xl overflow-hidden shadow-soft">
                    <Table>
                      <TableHeader className="bg-muted/60">
                        <TableRow>
                          <TableHead className="font-semibold">Subject</TableHead>
                          <TableHead className="font-semibold text-center">Marks</TableHead>
                          <TableHead className="font-semibold text-center">Grade</TableHead>
                          <TableHead className="font-semibold text-center">GPA</TableHead>
                          <TableHead className="font-semibold text-center hidden md:table-cell">Class Avg</TableHead>
                          <TableHead className="font-semibold text-center hidden md:table-cell">Highest</TableHead>
                          <TableHead className="font-semibold hidden md:table-cell">Remarks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.subject_entries.map((entry) => (
                          <TableRow key={entry.id} className="hover:bg-muted/30">
                            <TableCell className="font-medium text-foreground">{entry.subject_name}</TableCell>
                            <TableCell className="text-center">
                              <span className="font-semibold">
                                {entry.marks_obtained !== null ? entry.marks_obtained : "-"}
                              </span>
                              <span className="text-muted-foreground text-xs">/{entry.max_marks || 100}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="font-bold border-primary/20 text-primary">
                                {entry.grade || "N/A"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center font-medium">
                              {entry.gpa_points !== null ? entry.gpa_points.toFixed(1) : "-"}
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground text-xs hidden md:table-cell">
                              {entry.class_average ? `${entry.class_average}%` : "-"}
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground text-xs hidden md:table-cell">
                              {entry.highest_in_class ? `${entry.highest_in_class}%` : "-"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs hidden md:table-cell max-w-xs truncate">
                              {entry.teacher_comment || "Satisfactory progress"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gradient-to-br from-primary/5 to-accent/5 p-5 rounded-2xl border border-primary/10 flex flex-col justify-between">
                    <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                      Final Score Card
                    </span>
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Percentage</span>
                        <span className="text-lg font-bold text-foreground">
                          {detail.report_card.percentage ? `${detail.report_card.percentage}%` : "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">GPA Equivalency</span>
                        <span className="text-lg font-bold text-primary">
                          {detail.report_card.gpa ? detail.report_card.gpa.toFixed(2) : "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Overall Evaluation</span>
                        <Badge className="font-bold bg-primary text-primary-foreground px-3 py-0.5">
                          {detail.report_card.overall_grade || "N/A"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="bg-card border border-border/80 p-5 rounded-2xl space-y-3">
                    <h4 className="text-sm font-bold tracking-tight uppercase text-muted-foreground flex items-center gap-1.5">
                      <Award className="h-4 w-4 text-amber-500" /> Extracurricular Development
                    </h4>
                    <div className="space-y-1 text-xs">
                      {detail.co_curricular.length === 0 ? (
                        <p className="text-muted-foreground italic">No co-curricular grades recorded.</p>
                      ) : (
                        detail.co_curricular.map((c) => (
                          <div key={c.id} className="flex justify-between items-center py-1 border-b border-border/40 last:border-b-0">
                            <span className="text-foreground font-medium">{c.activity_name}</span>
                            <span className="font-bold text-primary">{c.grade || "Pass"}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-card border border-border/80 p-5 rounded-2xl space-y-3">
                    <h4 className="text-sm font-bold tracking-tight uppercase text-muted-foreground flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-emerald-500" /> Attendance Statistics
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Present Days</span>
                        <span className="font-semibold text-foreground">
                          {detail.report_card.total_present_days ?? "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total Active Days</span>
                        <span className="font-semibold text-foreground">
                          {detail.report_card.total_school_days ?? "N/A"}
                        </span>
                      </div>
                      <div className="pt-2 border-t flex justify-between items-center">
                        <span className="font-medium text-foreground">Attendance Percentage</span>
                        <span className="font-bold text-emerald-600">
                          {detail.report_card.attendance_percentage
                            ? `${detail.report_card.attendance_percentage}%`
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {detail.report_card.trend_data && detail.report_card.trend_data.length > 1 && (
                  <div className="p-5 border border-border/80 rounded-2xl bg-muted/20 space-y-3">
                    <h4 className="text-sm font-bold tracking-tight uppercase text-muted-foreground flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-primary" /> Grade Evolution Curve (Trend Graph)
                    </h4>
                    <div className="flex items-end gap-6 h-16 pt-2 select-none">
                      {detail.report_card.trend_data.map((t: any, idx: number) => (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                          <span className="absolute -top-6 text-[10px] bg-primary text-primary-foreground font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            {t.percentage}%
                          </span>
                          <div
                            style={{ height: `${t.percentage || 50}%` }}
                            className="w-full max-w-[24px] bg-gradient-to-t from-primary/70 to-primary rounded-t-sm transition-all duration-500"
                          />
                          <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">
                            {t.period || `Term ${idx + 1}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border/80">
                  <div className="space-y-1">
                    <h4 className="text-xs uppercase font-bold text-muted-foreground">Class Teacher's Assessment</h4>
                    <p className="text-xs leading-relaxed text-foreground bg-muted/20 p-3 rounded-lg min-h-[60px] italic">
                      "{detail.report_card.teacher_remarks || "Demonstrated excellent learning capability and outstanding progress across core concepts."}"
                    </p>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs uppercase font-bold text-muted-foreground">Principal's Verdict</h4>
                    <p className="text-xs leading-relaxed text-foreground bg-muted/20 p-3 rounded-lg min-h-[60px] italic">
                      "{detail.report_card.principal_remarks || "Promoted to the next academic track. Best wishes for future accomplishments."}"
                    </p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-border/85 gap-6 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    {detail.report_card.qr_verification_token && (
                      <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 px-3 py-1.5 rounded-lg">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium">Digitally Verified Document</span>
                      </div>
                    )}
                  </div>
                  <div className="text-center md:text-right space-y-1">
                    <div className="font-semibold text-foreground font-display text-sm tracking-tight italic">
                      {detail.report_card.signed_by_name || "Principal Office"}
                    </div>
                    <div className="text-[10px]">{detail.report_card.signed_by_title || "Principal"}</div>
                    {detail.report_card.signed_at && (
                      <div className="text-[9px] font-mono">
                        TS: {format(new Date(detail.report_card.signed_at), "yyyy-MM-dd HH:mm:ss")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl text-muted-foreground text-center">
              <Lock className="h-10 w-10 text-muted-foreground/60 mb-3" />
              <p>Select a report card from the list to view comprehensive marks details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
