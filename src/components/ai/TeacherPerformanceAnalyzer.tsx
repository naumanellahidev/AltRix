import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Award,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  GraduationCap,
  Lightbulb,
  Medal,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

interface Props {
  schoolId: string;
}

const TIER_CONFIG = {
  platinum: { color: "text-purple-600 bg-purple-500/10", icon: Medal },
  gold: { color: "text-amber-600 bg-amber-500/10", icon: Award },
  silver: { color: "text-slate-500 bg-slate-500/10", icon: Star },
  bronze: { color: "text-orange-600 bg-orange-500/10", icon: Target },
  needs_improvement: { color: "text-red-600 bg-red-500/10", icon: TrendingDown },
};

export function TeacherPerformanceAnalyzer({ schoolId }: Props) {
  const { data: performanceData, isLoading } = useQuery({
    queryKey: ["ai_teacher_performance", schoolId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_teacher_performance")
        .select(`
          *,
          profiles:teacher_user_id (
            display_name
          )
        `)
        .eq("school_id", schoolId)
        .order("overall_score", { ascending: false });

      if (error) throw error;
      return data as any[];
    },
    enabled: !!schoolId,
  });

  const stats = useMemo(() => {
    if (!performanceData) return { top: 0, needsTraining: 0, avgScore: 0 };
    
    const scores = performanceData.map(p => p.overall_score || 0);
    const avgScore = scores.length > 0 
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
    
    return {
      top: performanceData.filter(p => (p.overall_score || 0) >= 80).length,
      needsTraining: performanceData.filter(p => p.needs_training).length,
      avgScore,
    };
  }, [performanceData]);

  const chartData = useMemo(() => {
    if (!performanceData) return [];
    return performanceData.slice(0, 10).map(p => ({
      name: (p.profiles as any)?.display_name?.split(' ')[0] || 'Teacher',
      score: p.overall_score || 0,
      tier: (p.overall_score || 0) >= 90 ? 'platinum' : (p.overall_score || 0) >= 75 ? 'gold' : (p.overall_score || 0) >= 60 ? 'silver' : 'bronze',
    }));
  }, [performanceData]);

  const getBarColor = (tier: string) => {
    switch (tier) {
      case 'platinum': return 'hsl(var(--chart-5))';
      case 'gold': return 'hsl(var(--chart-4))';
      case 'silver': return 'hsl(var(--muted-foreground))';
      case 'bronze': return 'hsl(var(--chart-3))';
      default: return 'hsl(var(--chart-1))';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!performanceData || performanceData.length === 0) {
    return (
      <Card className="shadow-sm border-dashed">
        <CardContent className="py-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-display font-semibold">No Performance Data Yet</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            AI will analyze teacher performance as student marks, attendance, and feedback data 
            accumulates over time.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Award className="h-5 w-5 text-amber-500" />
                <Badge variant="outline" className="text-[10px]">
                  Top Tier
                </Badge>
              </div>
              <p className="mt-3 text-3xl font-bold">{stats.top}</p>
              <p className="text-xs text-muted-foreground">Top Performers (80%+)</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-3 text-3xl font-bold">{stats.avgScore}%</p>
              <p className="text-xs text-muted-foreground">Average Performance</p>
              <Progress value={stats.avgScore} className="mt-2 h-1.5" />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <BookOpen className="h-5 w-5 text-blue-500" />
                {stats.needsTraining > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    Action Required
                  </Badge>
                )}
              </div>
              <p className="mt-3 text-3xl font-bold">{stats.needsTraining}</p>
              <p className="text-xs text-muted-foreground">Needs Training</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Performance Chart */}
      <Card className="shadow-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Performance Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`${value}%`, "Score"]}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.tier)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Teacher Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {performanceData.slice(0, 6).map((teacher, idx) => {
          const score = teacher.overall_score || 0;
          const tier = (score >= 90 ? 'platinum' : score >= 75 ? 'gold' : score >= 60 ? 'silver' : 'bronze') as keyof typeof TIER_CONFIG;
          const config = TIER_CONFIG[tier] || TIER_CONFIG.bronze;
          const TierIcon = config.icon;

          return (
            <motion.div
              key={teacher.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={config.color}>
                        {(teacher.profiles as any)?.display_name?.charAt(0) || 'T'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium truncate">
                          {(teacher.profiles as any)?.display_name || 'Teacher'}
                        </p>
                        <Badge className={`${config.color} text-[10px] shrink-0`}>
                          <TierIcon className="mr-1 h-3 w-3" />
                          {tier}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {teacher.last_analyzed_at ? format(parseISO(teacher.last_analyzed_at), "MMM d, yyyy") : "Not analyzed yet"}
                      </p>
                    </div>
                  </div>

                  {/* Score Bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Overall Score</span>
                      <span className="font-semibold">{teacher.overall_score || 0}%</span>
                    </div>
                    <Progress value={teacher.overall_score || 0} className="mt-1.5 h-2" />
                  </div>

                  {/* Sub-scores */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-surface-2 p-2">
                      <p className="text-muted-foreground">Engagement</p>
                      <p className="font-semibold">{teacher.engagement_score || 0}%</p>
                    </div>
                    <div className="rounded-lg bg-surface-2 p-2">
                      <p className="text-muted-foreground">Results</p>
                      <p className="font-semibold">{teacher.results_score || 0}%</p>
                    </div>
                  </div>

                  {/* Feedback */}
                  {teacher.feedback && (
                    <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{teacher.feedback}</p>
                  )}

                  {/* Training Flag */}
                  {teacher.needs_training && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700">
                      <BookOpen className="h-3.5 w-3.5" />
                      Training recommended
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* AI Insights */}
      <Card className="shadow-elevated border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            AI Analysis Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Top Insights
              </h4>
              {performanceData.slice(0, 3)
                .filter(t => t.feedback)
                .map((t, idx) => (
                <p key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {t.feedback}
                </p>
              ))}
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Recommendations
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {stats.needsTraining > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    Schedule training for {stats.needsTraining} teacher(s) flagged for improvement
                  </li>
                )}
                {stats.top > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    Consider peer mentoring program with top {stats.top} performers
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                  Review subject difficulty patterns for targeted support
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
