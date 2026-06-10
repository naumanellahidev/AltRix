import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  Brain,
  Briefcase,
  Calendar,
  CheckCircle2,
  GraduationCap,
  Heart,
  Lightbulb,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wand2,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  schoolId: string;
  onNavigate?: (tab: "overview" | "warnings" | "reputation" | "teachers" | "timetable" | "counseling") => void;
}

const MotionCard = motion.create(Card);

export function AICommandCenter({ schoolId, onNavigate }: Props) {
  const { schoolSlug } = useParams();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const go = (tab: NonNullable<Props["onNavigate"]> extends (t: infer T) => any ? T : never) => {
    onNavigate?.(tab as any);
  };

  // Fetch AI metrics
  const { data: metrics, refetch, isLoading } = useQuery({
    queryKey: ["ai_command_center_metrics", schoolId],
    queryFn: async () => {
      const [
        studentProfilesRes,
        earlyWarningsRes,
        counselingQueueRes,
        teacherPerfRes,
        reputationRes,
        predictionsRes,
      ] = await Promise.all([
        // Student profiles with risk
        (supabase as any)
          .from("ai_student_profiles")
          .select("risk_score, needs_counseling, needs_extra_support")
          .eq("school_id", schoolId),
        // Active early warnings
        supabase
          .from("ai_early_warnings")
          .select("severity, status")
          .eq("school_id", schoolId)
          .is("resolved_at", null),
        // Counseling queue
        supabase
          .from("ai_counseling_queue")
          .select("status, priority")
          .eq("school_id", schoolId)
          .in("status", ["pending", "scheduled"]),
        // Teacher performance
        supabase
          .from("ai_teacher_performance")
          .select("overall_score, needs_training")
          .eq("school_id", schoolId),
        // Latest reputation
        (supabase as any)
          .from("ai_school_reputation")
          .select("reputation_score, parent_satisfaction_index, nps_score")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Academic predictions
        supabase
          .from("ai_academic_predictions")
          .select("failure_risk, promotion_probability")
          .eq("school_id", schoolId),
      ]);

      const studentProfiles = studentProfilesRes.data || [];
      const warnings = earlyWarningsRes.data || [];
      const counseling = counselingQueueRes.data || [];
      const teacherPerf = teacherPerfRes.data || [];
      const reputation = reputationRes.data;
      const predictions = predictionsRes.data || [];

      // Calculate metrics
      const atRiskStudents = studentProfiles.filter(p => (p.risk_score || 0) >= 60).length;
      const needsCounseling = studentProfiles.filter(p => p.needs_counseling).length;
      const criticalWarnings = warnings.filter(w => w.severity === "critical" || w.severity === "high").length;
      const avgTeacherScore = teacherPerf.length > 0
        ? Math.round(teacherPerf.reduce((sum, t) => sum + (t.overall_score || 0), 0) / teacherPerf.length)
        : 0;
      const teachersNeedTraining = teacherPerf.filter(t => t.needs_training).length;
      const avgFailureRisk = predictions.length > 0
        ? Math.round(predictions.reduce((sum, p) => sum + (p.failure_risk || 0), 0) / predictions.length)
        : 0;

      return {
        studentProfiles: studentProfiles.length,
        atRiskStudents,
        needsCounseling,
        activeWarnings: warnings.length,
        criticalWarnings,
        pendingCounseling: counseling.length,
        teacherCount: teacherPerf.length,
        avgTeacherScore,
        teachersNeedTraining,
        reputationScore: reputation?.reputation_score || 0,
        parentSatisfaction: reputation?.parent_satisfaction_index || 0,
        npsScore: reputation?.nps_score || 0,
        avgFailureRisk,
        predictions: predictions.length,
      };
    },
    enabled: !!schoolId,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-primary to-purple-600 p-3">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">AI Command Center</h1>
            <p className="text-sm text-muted-foreground">
              School intelligence at a glance • {format(new Date(), "MMMM d, yyyy")}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MotionCard
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => go("reputation")}
          className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        >
          <CardContent className="p-4">
            <Shield className="h-5 w-5 text-primary" />
            <p className="mt-2 text-2xl font-bold">{metrics?.reputationScore || 0}</p>
            <p className="text-[10px] text-muted-foreground">Reputation Score</p>
            <Progress value={metrics?.reputationScore || 0} className="mt-2 h-1" />
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => go("reputation")}
          className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        >
          <CardContent className="p-4">
            <Heart className="h-5 w-5 text-pink-500" />
            <p className="mt-2 text-2xl font-bold">{metrics?.parentSatisfaction || 0}%</p>
            <p className="text-[10px] text-muted-foreground">Parent Trust</p>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => go("warnings")}
          className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        >
          <CardContent className="p-4">
            <AlertTriangle className={`h-5 w-5 ${
              (metrics?.criticalWarnings || 0) > 0 ? "text-red-500" : "text-emerald-500"
            }`} />
            <p className="mt-2 text-2xl font-bold">{metrics?.activeWarnings || 0}</p>
            <p className="text-[10px] text-muted-foreground">Active Warnings</p>
            {(metrics?.criticalWarnings || 0) > 0 && (
              <Badge variant="destructive" className="mt-1 text-[8px]">
                {metrics?.criticalWarnings} critical
              </Badge>
            )}
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={() => go("counseling")}
          className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        >
          <CardContent className="p-4">
            <Target className={`h-5 w-5 ${
              (metrics?.atRiskStudents || 0) > 5 ? "text-amber-500" : "text-emerald-500"
            }`} />
            <p className="mt-2 text-2xl font-bold">{metrics?.atRiskStudents || 0}</p>
            <p className="text-[10px] text-muted-foreground">At-Risk Students</p>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => go("teachers")}
          className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        >
          <CardContent className="p-4">
            <Award className="h-5 w-5 text-amber-500" />
            <p className="mt-2 text-2xl font-bold">{metrics?.avgTeacherScore || 0}%</p>
            <p className="text-[10px] text-muted-foreground">Avg Teacher Score</p>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          onClick={() => go("counseling")}
          className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        >
          <CardContent className="p-4">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <p className="mt-2 text-2xl font-bold">{metrics?.studentProfiles || 0}</p>
            <p className="text-[10px] text-muted-foreground">AI Profiles</p>
          </CardContent>
        </MotionCard>
      </div>

      {/* Quick Insights */}
      <Card className="shadow-elevated border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-5 w-5 text-primary" />
            AI System Status & Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Warning Status */}
            <button
              type="button"
              onClick={() => go("warnings")}
              className={`text-left rounded-xl p-4 transition hover:scale-[1.02] hover:shadow-md ${
                (metrics?.criticalWarnings || 0) > 0
                  ? "bg-red-500/10 border border-red-200"
                  : "bg-emerald-500/10 border border-emerald-200"
              }`}
            >
              <div className="flex items-center gap-2">
                {(metrics?.criticalWarnings || 0) > 0 ? (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                )}
                <span className="text-sm font-medium">
                  {(metrics?.criticalWarnings || 0) > 0 ? "Attention Needed" : "All Clear"}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {(metrics?.criticalWarnings || 0) > 0
                  ? `${metrics?.criticalWarnings} critical warnings require immediate action`
                  : "No critical early warnings detected"}
              </p>
            </button>

            {/* Counseling Status */}
            <button
              type="button"
              onClick={() => go("counseling")}
              className={`text-left rounded-xl p-4 transition hover:scale-[1.02] hover:shadow-md ${
                (metrics?.pendingCounseling || 0) > 3
                  ? "bg-amber-500/10 border border-amber-200"
                  : "bg-blue-500/10 border border-blue-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-pink-600" />
                <span className="text-sm font-medium">Counseling Queue</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {metrics?.pendingCounseling || 0} students awaiting counseling session
              </p>
            </button>

            {/* Teacher Training */}
            <button
              type="button"
              onClick={() => go("teachers")}
              className={`text-left rounded-xl p-4 transition hover:scale-[1.02] hover:shadow-md ${
                (metrics?.teachersNeedTraining || 0) > 2
                  ? "bg-amber-500/10 border border-amber-200"
                  : "bg-emerald-500/10 border border-emerald-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium">Teacher Development</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {metrics?.teachersNeedTraining || 0} teachers flagged for training
              </p>
            </button>

            {/* Prediction Health */}
            <button
              type="button"
              onClick={() => go("warnings")}
              className={`text-left rounded-xl p-4 transition hover:scale-[1.02] hover:shadow-md ${
                (metrics?.avgFailureRisk || 0) > 20
                  ? "bg-amber-500/10 border border-amber-200"
                  : "bg-emerald-500/10 border border-emerald-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-purple-600" />
                <span className="text-sm font-medium">Academic Outlook</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Average failure risk: {metrics?.avgFailureRisk || 0}%
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Module Quick Access */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => go("counseling")}
          className="group rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-3 text-left">
              <div className="rounded-xl bg-primary p-3 transition-transform group-hover:scale-105">
                <Brain className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="font-semibold">Student Digital Twins</p>
                <p className="text-xs text-muted-foreground">
                  {metrics?.studentProfiles || 0} AI profiles active
                </p>
              </div>
            </div>
          </CardContent>
        </button>

        <button
          type="button"
          onClick={() => go("warnings")}
          className="group rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-3 text-left">
              <div className="rounded-xl bg-destructive p-3 transition-transform group-hover:scale-105">
                <Shield className="h-5 w-5 text-destructive-foreground" />
              </div>
              <div>
                <p className="font-semibold">Early Warning System</p>
                <p className="text-xs text-muted-foreground">
                  {metrics?.activeWarnings || 0} active alerts
                </p>
              </div>
            </div>
          </CardContent>
        </button>

        <button
          type="button"
          onClick={() => go("timetable")}
          className="group rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-3 text-left">
              <div className="rounded-xl bg-accent p-3 transition-transform group-hover:scale-105">
                <Wand2 className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="font-semibold">Smart Timetable</p>
                <p className="text-xs text-muted-foreground">AI-powered scheduling</p>
              </div>
            </div>
          </CardContent>
        </button>

        <button
          type="button"
          onClick={() => go("teachers")}
          className="group rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-3 text-left">
              <div className="rounded-xl bg-secondary p-3 transition-transform group-hover:scale-105">
                <Award className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="font-semibold">Teacher Analytics</p>
                <p className="text-xs text-muted-foreground">
                  {metrics?.teacherCount || 0} teachers analyzed
                </p>
              </div>
            </div>
          </CardContent>
        </button>

        <button
          type="button"
          onClick={() => go("reputation")}
          className="group rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-3 text-left">
              <div className="rounded-xl bg-primary p-3 transition-transform group-hover:scale-105">
                <Heart className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="font-semibold">School Reputation</p>
                <p className="text-xs text-muted-foreground">
                  Score: {metrics?.reputationScore || 0}/100
                </p>
              </div>
            </div>
          </CardContent>
        </button>

        <button
          type="button"
          onClick={() => go("counseling")}
          className="group rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-3 text-left">
              <div className="rounded-xl bg-accent p-3 transition-transform group-hover:scale-105">
                <Briefcase className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="font-semibold">Career Guidance</p>
                <p className="text-xs text-muted-foreground">AI career path analysis</p>
              </div>
            </div>
          </CardContent>
        </button>
      </div>
    </div>
  );
}
