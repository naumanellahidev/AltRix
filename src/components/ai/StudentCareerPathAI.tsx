import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Briefcase,
  BookOpen,
  Brain,
  GraduationCap,
  Lightbulb,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Award,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { aiToTextArray } from "@/lib/ai-render";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

interface Props {
  studentId: string;
  schoolId: string;
}

export function StudentCareerPathAI({ studentId, schoolId }: Props) {
  const { data: career, isLoading } = useQuery({
    queryKey: ["ai_career_suggestions", studentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_career_suggestions")
        .select("*")
        .eq("student_id", studentId)
        .eq("school_id", schoolId)
        .maybeSingle();

      if (error) throw error;
      return data as any;
    },
    enabled: !!studentId && !!schoolId,
  });

  const { data: student } = useQuery({
    queryKey: ["student_basic_info", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("first_name, last_name")
        .eq("id", studentId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  const radarData = useMemo(() => {
    if (!career?.field_match_scores) return [];
    const scores = career.field_match_scores as Record<string, number>;
    return Object.entries(scores).slice(0, 6).map(([field, score]) => ({
      field: field.length > 12 ? field.slice(0, 12) + "…" : field,
      fullField: field,
      score: score || 0,
      fullMark: 100,
    }));
  }, [career?.field_match_scores]);

  const getReadinessColor = (score: number) => {
    if (score >= 80) return "text-emerald-600 bg-emerald-500/10";
    if (score >= 60) return "text-amber-600 bg-amber-500/10";
    return "text-red-600 bg-red-500/10";
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!career) {
    return (
      <Card className="shadow-sm border-dashed">
        <CardContent className="py-12 text-center">
          <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-display font-semibold">Career Insights Coming Soon</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            AI will analyze performance, interests, and behavior to suggest career paths 
            as more data is collected.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 p-2.5">
          <Briefcase className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Career Path AI</h2>
          <p className="text-sm text-muted-foreground">
            Personalized career guidance for {student?.first_name}
          </p>
        </div>
      </div>

      {/* University Readiness */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="shadow-elevated overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 to-transparent p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">University Readiness Score</p>
                <p className="mt-2 font-display text-5xl font-bold">
                  {career.university_readiness_score || 0}
                  <span className="text-2xl text-muted-foreground">/100</span>
                </p>
                <Badge className={`mt-2 ${getReadinessColor(career.university_readiness_score || 0)}`}>
                  {(career.university_readiness_score || 0) >= 80
                    ? "Highly Ready"
                    : (career.university_readiness_score || 0) >= 60
                    ? "Moderately Ready"
                    : "Needs Development"}
                </Badge>
              </div>
              <div className="rounded-2xl bg-primary/10 p-4">
                <GraduationCap className="h-8 w-8 text-primary" />
              </div>
            </div>
            <Progress 
              value={career.university_readiness_score || 0} 
              className="mt-4 h-2" 
            />
          </div>
        </Card>
      </motion.div>

      {/* Suggested Fields & Radar */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Suggested Career Fields */}
        <Card className="shadow-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              Suggested Career Fields
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const fields = aiToTextArray(career.suggested_fields);
              const scores = (career.field_match_scores || {}) as Record<string, number>;
              return fields.length > 0 ? (
                <div className="space-y-3">
                  {fields.map((field, idx) => {
                    const score = scores[field] || 0;
                    return (
                      <motion.div
                        key={`${field}-${idx}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="flex items-center justify-between rounded-xl border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <span className="text-sm font-bold text-primary">{idx + 1}</span>
                          </div>
                          <span className="font-medium">{field}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress value={score} className="w-20 h-2" />
                          <span className="text-sm font-semibold text-muted-foreground w-10 text-right">
                            {score}%
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Career field suggestions will appear as data is analyzed
                </p>
              );
            })()}
          </CardContent>
        </Card>

        {/* Field Match Radar */}
        {radarData.length > 0 && (
          <Card className="shadow-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Field Match Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis
                      dataKey="field"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tick={{ fontSize: 9 }}
                    />
                    <Radar
                      name="Match Score"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.3}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detected Interests */}
      {(() => {
        const interests = aiToTextArray(career.detected_interests);
        return interests.length > 0 ? (
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-amber-500" />
                Detected Interests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {interests.map((interest, idx) => (
                  <Badge key={`${interest}-${idx}`} variant="secondary" className="text-xs">
                    {interest}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null;
      })()}

      {/* Recommended Subjects */}
      {(() => {
        const subjects = aiToTextArray(career.recommended_subjects);
        return subjects.length > 0 ? (
          <Card className="shadow-elevated border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-5 w-5 text-primary" />
                Recommended Subjects to Focus On
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {subjects.map((subject, idx) => (
                  <motion.div
                    key={`${subject}-${idx}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center gap-2 rounded-xl bg-background/50 p-3"
                  >
                    <Award className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium">{subject}</span>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null;
      })()}

      {/* AI Note */}
      <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
        <Brain className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          These suggestions are based on AI analysis of academic performance, detected interests, 
          and behavioral patterns. They are meant to guide exploration and should be combined with 
          professional career counseling.
        </p>
      </div>
    </div>
  );
}
