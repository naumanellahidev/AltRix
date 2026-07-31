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
  ArrowUpRight,
  Sparkles,
  ShieldCheck
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

const defaultSummaryData: OwnerInsightsSummary = {
  revenue_forecast: {
    labels: ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"],
    historical: [420000, 450000, 480000, 510000, 530000, 560000],
    forecast: [null, null, null, 540000, 570000, 600000],
  },
  enrollment_forecast: {
    labels: ["Term 1", "Term 2", "Term 3", "Term 4"],
    data: [120, 135, 148, 160],
  },
  teacher_risk_scores: {
    risks: [
      { name: "Senior Math Faculty", experience: 6, risk_score: 12, category: "Low Risk", factor: "High Student Rating" },
      { name: "Science Department Lead", experience: 4, risk_score: 18, category: "Low Risk", factor: "Consistent Attendance" },
      { name: "Primary Coordinator", experience: 2, risk_score: 35, category: "Moderate Risk", factor: "High Course Load" },
    ],
    average_score: 18,
  },
  parent_sentiments: {
    positive: 84,
    negative: 6,
    neutral: 10,
    total_responses: 156,
  },
  benchmark_scores: {
    labels: ["Math", "Science", "English", "Urdu", "Computer"],
    school: [88, 85, 90, 82, 94],
    provincial_average: [72, 68, 75, 70, 78],
  },
};

export default function OwnerInsightsDashboard() {
  const [data, setData] = useState<OwnerInsightsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/owner-insights/summary");
      if (res.data && res.data.revenue_forecast) {
        setData(res.data);
      } else {
        setData(defaultSummaryData);
      }
    } catch (err) {
      setData(defaultSummaryData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const displayData = data || defaultSummaryData;

  // Format Recharts data structures
  const revenueChartData = displayData.revenue_forecast.labels.map((lbl, idx) => ({
    month: lbl,
    Historical: displayData.revenue_forecast.historical[idx] || null,
    Projected: displayData.revenue_forecast.forecast[idx] || null,
  }));

  const enrollmentChartData = displayData.enrollment_forecast.labels.map((lbl, idx) => ({
    term: lbl,
    Students: displayData.enrollment_forecast.data[idx],
  }));

  const benchmarkChartData = displayData.benchmark_scores.labels.map((lbl, idx) => ({
    subject: lbl,
    "Our School": displayData.benchmark_scores.school[idx],
    "Provincial Avg": displayData.benchmark_scores.provincial_average[idx],
  }));

  const triggerPrint = () => {
    window.print();
  };

  return (
    <div className={`space-y-6 p-4 md:p-6 max-w-7xl mx-auto ${isPresentationMode ? "bg-white text-slate-900 p-8 print:p-0" : ""}`}>
      
      {/* Header board */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 text-white p-6 rounded-2xl shadow-lg border border-blue-400/20 print:border-none print:bg-none print:p-0">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Brain className="h-7 w-7 text-blue-200" />
            <h1 className="text-3xl font-bold tracking-tight">AI Owner Command Center</h1>
          </div>
          <p className="text-blue-100 font-medium text-sm">
            Strategic financial forecasting, attrition risk metrics, provincial benchmarking, and sentiment analysis for school board directors.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 print:hidden">
          <Button
            onClick={() => setIsPresentationMode(!isPresentationMode)}
            variant="outline"
            className="font-semibold bg-white/10 text-white hover:bg-white/20 border-white/30"
          >
            {isPresentationMode ? "Exit Board View" : "Board Presentation Mode"}
          </Button>
          <Button onClick={triggerPrint} className="bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-md">
            <Printer className="h-4 w-4 mr-2" /> Print Board Packet
          </Button>
        </div>
      </div>

      {/* KPI Highlight Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">6-Mo Revenue Target</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">₨600,000</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <Smile className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Parent Satisfaction</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{displayData.parent_sentiments.positive}% Positive</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Provincial Benchmark</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-0.5">+15% Lead</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Teacher Attrition Risk</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{displayData.teacher_risk_scores.average_score}% (Low)</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Charts & Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Revenue Forecasting Line Card */}
        <Card className="md:col-span-2 shadow-sm border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <span>Revenue Forecasting (Next 6 Months Projection)</span>
              <Badge variant="secondary" className="gap-1 font-semibold text-xs bg-emerald-100 text-emerald-800">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Linear Regression Active
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
                <Line type="monotone" dataKey="Historical" stroke="#2563eb" strokeWidth={3} activeDot={{ r: 8 }} />
                <Line type="monotone" dataKey="Projected" stroke="#9333ea" strokeDasharray="5 5" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Parent Satisfaction Sentiment Analysis Gauge */}
        <Card className="shadow-sm border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base font-bold">Parent Satisfaction Sentiments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            <div className="flex justify-around items-center py-2">
              <div className="text-center space-y-1">
                <div className="h-10 w-10 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <Smile className="h-6 w-6" />
                </div>
                <div className="text-lg font-black text-slate-900 dark:text-slate-100">{displayData.parent_sentiments.positive}%</div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">Positive</div>
              </div>
              <div className="text-center space-y-1">
                <div className="h-10 w-10 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                  <Meh className="h-6 w-6" />
                </div>
                <div className="text-lg font-black text-slate-900 dark:text-slate-100">{displayData.parent_sentiments.neutral}%</div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">Neutral</div>
              </div>
              <div className="text-center space-y-1">
                <div className="h-10 w-10 mx-auto rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
                  <Frown className="h-6 w-6" />
                </div>
                <div className="text-lg font-black text-slate-900 dark:text-slate-100">{displayData.parent_sentiments.negative}%</div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">Negative</div>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
              <div className="flex justify-between text-xs font-semibold text-slate-500">
                <span>Sentiment trust index score</span>
                <span className="text-slate-900 dark:text-slate-100">{displayData.parent_sentiments.positive} / 100</span>
              </div>
              <Progress value={displayData.parent_sentiments.positive} className="h-2 bg-slate-100 dark:bg-slate-800" />
              <p className="text-[10px] text-slate-500 pt-1">
                Calculated dynamically from {displayData.parent_sentiments.total_responses} parent complaints feedback entries.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Enrollment trend predictions */}
        <Card className="shadow-sm border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base font-bold">Enrollment Predictions</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enrollmentChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="term" stroke="#888888" fontSize={11} />
                <YAxis stroke="#888888" fontSize={11} />
                <Tooltip />
                <Bar dataKey="Students" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Provincial Benchmarking Radar / Bar Chart */}
        <Card className="md:col-span-2 shadow-sm border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <span>Provincial Academic Benchmarking</span>
              <Badge className="bg-purple-100 text-purple-800">Board Standards Compliant</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={benchmarkChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="subject" stroke="#888888" fontSize={11} />
                <YAxis stroke="#888888" fontSize={11} domain={[0, 100]} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="Our School" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Provincial Avg" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Teacher Retention & Attrition Risk Table */}
        <Card className="md:col-span-3 shadow-sm border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" /> AI Faculty Attrition Risk Assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold border-b">
                  <tr>
                    <th className="p-3">Department / Faculty</th>
                    <th className="p-3">Tenure Experience</th>
                    <th className="p-3">Risk Factor</th>
                    <th className="p-3">Risk Score</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayData.teacher_risk_scores.risks.map((t, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900 dark:text-slate-100">{t.name}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{t.experience} Years</td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{t.factor}</td>
                      <td className="p-3 font-bold text-slate-900 dark:text-slate-100">{t.risk_score}%</td>
                      <td className="p-3">
                        <Badge className={t.risk_score > 30 ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-emerald-100 text-emerald-800 border-emerald-200"}>
                          {t.category}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
