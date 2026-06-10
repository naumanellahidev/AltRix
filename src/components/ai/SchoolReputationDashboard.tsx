import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  Heart,
  Lightbulb,
  MessageSquare,
  Shield,
  Star,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { format, parseISO, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

interface Props {
  schoolId: string;
}

export function SchoolReputationDashboard({ schoolId }: Props) {
  const { data: reputationData, isLoading } = useQuery({
    queryKey: ["ai_school_reputation", schoolId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_school_reputation")
        .select("*")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  const latestReport = useMemo(() => reputationData?.[0], [reputationData]);

  const trendData = useMemo(() => {
    if (!reputationData) return [];
    return reputationData
      .slice()
      .reverse()
      .map((r) => ({
        month: format(parseISO(r.report_month + "-01"), "MMM"),
        reputation: r.reputation_score || 0,
        satisfaction: r.parent_satisfaction_index || 0,
        engagement: r.engagement_level || 0,
      }));
  }, [reputationData]);

  const radarData = useMemo(() => {
    if (!latestReport) return [];
    return [
      { metric: "Reputation", value: latestReport.reputation_score || 0, fullMark: 100 },
      { metric: "Parent Trust", value: latestReport.parent_satisfaction_index || 0, fullMark: 100 },
      { metric: "Engagement", value: latestReport.engagement_level || 0, fullMark: 100 },
      { metric: "Attendance", value: latestReport.attendance_consistency || 0, fullMark: 100 },
      { metric: "Success Rate", value: latestReport.student_success_rate || 0, fullMark: 100 },
      { metric: "NPS", value: Math.max(0, ((latestReport.nps_score || 0) + 100) / 2), fullMark: 100 },
    ];
  }, [latestReport]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600 bg-emerald-500/10";
    if (score >= 60) return "text-amber-600 bg-amber-500/10";
    return "text-red-600 bg-red-500/10";
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return CheckCircle2;
    if (score >= 60) return Activity;
    return AlertTriangle;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!latestReport) {
    return (
      <Card className="shadow-sm border-dashed">
        <CardContent className="py-12 text-center">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-display font-semibold">No Reputation Data Yet</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            AI will analyze your school's data and generate reputation insights as feedback and 
            performance data accumulates.
          </p>
        </CardContent>
      </Card>
    );
  }

  const ScoreIcon = getScoreIcon(latestReport.reputation_score || 0);

  return (
    <div className="space-y-6">
      {/* Header with Score */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1"
        >
          <Card className="shadow-elevated overflow-hidden">
            <div className="bg-gradient-to-br from-primary/10 to-transparent p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">School Reputation Score</p>
                  <p className="mt-2 font-display text-5xl font-bold">
                    {latestReport.reputation_score || 0}
                    <span className="text-2xl text-muted-foreground">/100</span>
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge className={getScoreColor(latestReport.reputation_score || 0)}>
                      <ScoreIcon className="mr-1 h-3 w-3" />
                      {latestReport.reputation_score >= 80
                        ? "Excellent"
                        : latestReport.reputation_score >= 60
                        ? "Good"
                        : "Needs Improvement"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      as of {format(parseISO(latestReport.report_month + "-01"), "MMMM yyyy")}
                    </span>
                  </div>
                </div>
                <div className={`rounded-2xl p-4 ${getScoreColor(latestReport.reputation_score || 0)}`}>
                  <Shield className="h-8 w-8" />
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3 lg:w-72">
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <Heart className="h-5 w-5 text-pink-500" />
              <p className="mt-2 text-2xl font-bold">
                {latestReport.parent_satisfaction_index || 0}%
              </p>
              <p className="text-xs text-muted-foreground">Parent Satisfaction</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <ThumbsUp className="h-5 w-5 text-blue-500" />
              <p className="mt-2 text-2xl font-bold">
                {latestReport.nps_score !== null ? (latestReport.nps_score > 0 ? "+" : "") + latestReport.nps_score : "—"}
              </p>
              <p className="text-xs text-muted-foreground">NPS Score</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <Users className="h-5 w-5 text-emerald-500" />
              <p className="mt-2 text-2xl font-bold">
                {latestReport.engagement_level || 0}%
              </p>
              <p className="text-xs text-muted-foreground">Engagement</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <Award className="h-5 w-5 text-amber-500" />
              <p className="mt-2 text-2xl font-bold">
                {latestReport.student_success_rate || 0}%
              </p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trend Chart */}
        <Card className="shadow-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Reputation Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="reputation"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 3 }}
                    name="Reputation"
                  />
                  <Line
                    type="monotone"
                    dataKey="satisfaction"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--chart-2))", strokeWidth: 0, r: 3 }}
                    name="Satisfaction"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Radar Chart */}
        <Card className="shadow-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Performance Dimensions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fontSize: 9 }}
                  />
                  <Radar
                    name="Score"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Strengths & Risk Factors */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Strengths */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Star className="h-4 w-4 text-emerald-500" />
              Main Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latestReport.main_strengths && (latestReport.main_strengths as string[]).length > 0 ? (
              <ul className="space-y-2">
                {(latestReport.main_strengths as string[]).map((strength, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    {strength}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Analyzing strengths...</p>
            )}
          </CardContent>
        </Card>

        {/* Risk Factors */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Risk Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latestReport.risk_factors && (latestReport.risk_factors as string[]).length > 0 ? (
              <ul className="space-y-2">
                {(latestReport.risk_factors as string[]).map((risk, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    {risk}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No significant risks detected</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trust Factors */}
      {latestReport.trust_factors && (latestReport.trust_factors as string[]).length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Heart className="h-4 w-4 text-pink-500" />
              Trust Building Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(latestReport.trust_factors as string[]).map((factor, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {factor}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Recommendations */}
      {latestReport.ai_recommendations && (latestReport.ai_recommendations as string[]).length > 0 && (
        <Card className="shadow-elevated border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-5 w-5 text-primary" />
              AI Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(latestReport.ai_recommendations as string[]).map((rec, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-xl bg-background/50 p-4"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {idx + 1}
                  </span>
                  <p className="text-sm">{rec}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
