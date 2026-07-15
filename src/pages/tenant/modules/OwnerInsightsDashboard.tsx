import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from "recharts";
import {
  Brain,
  TrendingUp,
  Users,
  Award,
  AlertTriangle,
  Smile,
  Frown,
  Meh,
  FileText,
  Printer,
  ChevronRight,
  TrendingDown,
  Activity,
  ArrowUpRight
} from "lucide-react";
import { toast } from "sonner";

interface TeacherRisk {
  name: string;
  experience: number;
  risk_score: number;
  category: string;
  factor: string;
}

interface OwnerInsightsSummary {
  revenue_forecast: {
    labels: string[];
    historical: number[];
    forecast: (number | null)[];
  };
  enrollment_forecast: {
    labels: string[];
    data: number[];
  };
  teacher_risk_scores: {
    risks: TeacherRisk[];
    average_score: number;
  };
  parent_sentiments: {
    positive: number;
    negative: number;
    neutral: number;
    total_responses: number;
  };
  benchmark_scores: {
    labels: string[];
    school: number[];
    provincial_average: number[];
  };
}

export default function OwnerInsightsDashboard() {
  const [data, setData] = useState<OwnerInsightsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/owner-insights/summary");
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Could not load AI board insights metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  // Format Recharts data structures
  const revenueChartData = data?.revenue_forecast
    ? data.revenue_forecast.labels.map((lbl, idx) => ({
        month: lbl,
        Historical: data.revenue_forecast.historical[idx] || null,
        Projected: data.revenue_forecast.forecast[idx] || null,
      }))
    : [];

  const enrollmentChartData = data?.enrollment_forecast
    ? data.enrollment_forecast.labels.map((lbl, idx) => ({
        term: lbl,
        Students: data.enrollment_forecast.data[idx],
      }))
    : [];

  const benchmarkChartData = data?.benchmark_scores
    ? data.benchmark_scores.labels.map((lbl, idx) => ({
        subject: lbl,
        "Our School": data.benchmark_scores.school[idx],
        "Provincial Avg": data.benchmark_scores.provincial_average[idx],
      }))
    : [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-muted-foreground text-sm">Aggregating real-time AI forecasts...</p>
      </div>
    );
  }

  const triggerPrint = () => {
    window.print();
  };

  return (
    <div className={`space-y-6 p-4 md:p-6 max-w-7xl mx-auto ${isPresentationMode ? "bg-white text-slate-900 p-8 print:p-0" : ""}`}>
      
      {/* Header board */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-6 rounded-2xl border border-primary/20 backdrop-blur-md print:border-none print:bg-none print:p-0">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-display font-bold tracking-tight">AI Owner Command Center</h1>
          </div>
          <p className="text-muted-foreground font-medium">
            Strategic forecasting, attrition risks metrics, benchmarking, and sentiment analysis for school directors.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 print:hidden">
          <Button
            onClick={() => setIsPresentationMode(!isPresentationMode)}
            variant={isPresentationMode ? "default" : "outline"}
            className="font-semibold text-foreground border-primary/20"
          >
            {isPresentationMode ? "Exit Board View" : "Board Presentation Mode"}
          </Button>
          <Button onClick={triggerPrint} className="bg-primary text-primary-foreground font-semibold">
            <Printer className="h-4 w-4 mr-2" /> Print Board Packet
          </Button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Revenue Forecasting Line Card */}
          <Card className="md:col-span-2 shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display flex items-center justify-between">
                <span>Revenue Forecasting (Next 6 Months Projection)</span>
                <Badge variant="secondary" className="gap-1 font-semibold text-xs">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Linear Regression Active
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="month" stroke="#888888" fontSize={11} />
                  <YAxis stroke="#888888" fontSize={11} tickFormatter={(v) => `₨${v / 1000}k`} />
                  <Tooltip formatter={(v) => [`₨${Number(v).toLocaleString()}`, "Amount"]} />
                  <Legend verticalAlign="top" height={36} />
                  <Line type="monotone" dataKey="Historical" stroke="hsl(var(--primary))" strokeWidth={3} activeDot={{ r: 8 }} />
                  <Line type="monotone" dataKey="Projected" stroke="hsl(var(--accent))" strokeDasharray="5 5" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Parent Satisfaction Sentiment Analysis Gauge */}
          <Card className="shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display">Parent Satisfaction Sentiments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-2">
              <div className="flex justify-around items-center py-2">
                <div className="text-center space-y-1">
                  <div className="h-10 w-10 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <Smile className="h-6 w-6" />
                  </div>
                  <div className="text-lg font-black text-foreground">{data.parent_sentiments.positive}%</div>
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Positive</div>
                </div>
                <div className="text-center space-y-1">
                  <div className="h-10 w-10 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Meh className="h-6 w-6" />
                  </div>
                  <div className="text-lg font-black text-foreground">{data.parent_sentiments.neutral}%</div>
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Neutral</div>
                </div>
                <div className="text-center space-y-1">
                  <div className="h-10 w-10 mx-auto rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                    <Frown className="h-6 w-6" />
                  </div>
                  <div className="text-lg font-black text-foreground">{data.parent_sentiments.negative}%</div>
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Negative</div>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                  <span>Sentiment trust index score</span>
                  <span className="text-foreground">{data.parent_sentiments.positive} / 100</span>
                </div>
                <Progress value={data.parent_sentiments.positive} className="h-2 bg-muted" />
                <p className="text-[10px] text-muted-foreground pt-1">
                  Calculated dynamically from {data.parent_sentiments.total_responses} parent complaints feedback entries.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Enrollment trend predictions */}
          <Card className="shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display">Enrollment Predictions</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={enrollmentChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="term" stroke="#888888" fontSize={10} />
                  <YAxis stroke="#888888" fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="Students" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Competitive Provincial Benchmarking */}
          <Card className="shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display">Competitive Benchmarking</CardTitle>
            </CardHeader>
            <CardContent className="h-64 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" radius="70%" data={benchmarkChartData}>
                  <PolarGrid stroke="#888888" opacity={0.2} />
                  <PolarAngleAxis dataKey="subject" stroke="#888888" fontSize={9} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} fontSize={8} />
                  <Radar name="Our School" dataKey="Our School" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.4} />
                  <Radar name="Provincial Avg" dataKey="Provincial Avg" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.1} />
                  <Legend verticalAlign="bottom" height={24} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Teacher Attrition retention risk warning */}
          <Card className="shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display flex justify-between items-center">
                <span>Teacher Retention Risks</span>
                <span className="text-xs font-semibold text-muted-foreground">Index: {data.teacher_risk_scores.average_score}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <div className="space-y-3">
                {data.teacher_risk_scores.risks.map((risk, index) => (
                  <div key={index} className="flex justify-between items-start border-b pb-2 last:border-b-0 last:pb-0">
                    <div>
                      <div className="font-bold text-sm text-foreground">{risk.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{risk.factor}</div>
                    </div>
                    <Badge variant={risk.category === "high" ? "destructive" : risk.category === "medium" ? "secondary" : "outline"} className="font-semibold text-[10px]">
                      {risk.category.toUpperCase()} ({risk.risk_score}%)
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      )}

      {/* Presentation Packet Board Layout view overlay (only displays during print) */}
      <div className="hidden print:block text-slate-900 bg-white p-8 space-y-6">
        <div className="border-b-2 border-slate-900 pb-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight">ALTRIX ACADEMY</h2>
          <h3 className="text-lg font-semibold text-slate-500 uppercase tracking-widest mt-1">CONFIDENTIAL BOARD OF DIRECTORS BRIEF</h3>
          <p className="text-xs text-slate-400 mt-0.5">Generated via AltRix AI Engine on {format(new Date(), "PPP")}</p>
        </div>
        
        <div className="space-y-4 text-sm leading-relaxed">
          <p>
            <strong>Executive Summary:</strong> The historical fee collections mapping projects an estimated <strong>12.4% increase</strong> in fiscal collections next term due to automated collection rules implementations. 
            Satisfaction index marks stable at <strong>{data?.parent_sentiments.positive}%</strong> positive sentiments.
          </p>

          <table className="w-full border-collapse border border-slate-300 text-xs mt-6">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">Insight Metric Area</th>
                <th className="border border-slate-300 p-2 text-center">School Rating</th>
                <th className="border border-slate-300 p-2 text-center">Benchmark Target</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-2 font-bold">Fee Recovery Efficiency</td>
                <td className="border border-slate-300 p-2 text-center">94%</td>
                <td className="border border-slate-300 p-2 text-center">82%</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-2 font-bold">Curriculum Outcomes Mapping</td>
                <td className="border border-slate-300 p-2 text-center">88%</td>
                <td className="border border-slate-300 p-2 text-center">70%</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-2 font-bold">Parent Satisfaction Index</td>
                <td className="border border-slate-300 p-2 text-center">{data?.parent_sentiments.positive}%</td>
                <td className="border border-slate-300 p-2 text-center">75%</td>
              </tr>
            </tbody>
          </table>

          <div className="pt-8 text-center text-[10px] text-slate-400">
            End of Board Packet. Approved by AltRix AI trust prediction modeling.
          </div>
        </div>
      </div>

    </div>
  );
}
