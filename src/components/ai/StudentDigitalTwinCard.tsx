import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Brain,
  BookOpen,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Heart,
  Zap,
  Eye,
  Ear,
  Hand,
  Lightbulb,
  Target,
  Sparkles,
  CalendarDays,
  ListChecks,
  GraduationCap,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { aiToTextArray } from "@/lib/ai-render";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  studentId: string;
  schoolId: string;
  compact?: boolean;
  /**
   * Controls which sections of the rich AI profile are rendered.
   * - "learning" (default in AI Insights → Learning Profile tab): only learning-style,
   *   focus, subjects, wellbeing, executive summary, personality, motivators,
   *   parent/teacher guidance, milestones. Hides predictions, career pathways,
   *   study routine and 30‑day tasks (those live in their own tabs).
   * - "full": renders everything (used on dashboards / standalone views).
   */
  scope?: "learning" | "full";
}

const learningStyleIcons = {
  visual: Eye,
  auditory: Ear,
  kinesthetic: Hand,
  practical: Hand,
  reading: BookOpen,
};

const learningStyleColors = {
  visual: "text-blue-500 bg-blue-500/10",
  auditory: "text-purple-500 bg-purple-500/10",
  kinesthetic: "text-orange-500 bg-orange-500/10",
  practical: "text-orange-500 bg-orange-500/10",
  reading: "text-emerald-500 bg-emerald-500/10",
};

export function StudentDigitalTwinCard({ studentId, schoolId, compact = false, scope = "full" }: Props) {
  const showFullScope = scope === "full";
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [showRich, setShowRich] = useState(true);

  const generate = async () => {
    setGenerating(true);
    const t = toast.loading("Generating heavy AI profile… analyzing attendance, grades, behavior & predictions");
    try {
      const { data, error } = await supabase.functions.invoke("ai-student-analyzer", {
        body: { schoolId, studentId, analysisType: "digital_twin" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("AI profile generated", { id: t });
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate AI profile", { id: t });
    } finally {
      setGenerating(false);
      qc.invalidateQueries({ queryKey: ["ai_student_profile", studentId] });
    }
  };

  const { data: profile, isLoading } = useQuery({
    queryKey: ["ai_student_profile", studentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_student_profiles")
        .select("*")
        .eq("student_id", studentId)
        .eq("school_id", schoolId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!studentId && !!schoolId,
  });

  const { data: student } = useQuery({
    queryKey: ["student_info", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("first_name, last_name, status")
        .eq("id", studentId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  const riskLevel = useMemo(() => {
    if (!profile?.risk_score) return { level: "low", color: "text-emerald-600 bg-emerald-500/10" };
    if (profile.risk_score >= 70) return { level: "high", color: "text-red-600 bg-red-500/10" };
    if (profile.risk_score >= 40) return { level: "medium", color: "text-amber-600 bg-amber-500/10" };
    return { level: "low", color: "text-emerald-600 bg-emerald-500/10" };
  }, [profile?.risk_score]);

  const emotionalTrendIcon = useMemo(() => {
    const trend = profile?.emotional_trend;
    if (trend === "improving" || trend === "positive") return TrendingUp;
    if (trend === "declining" || trend === "negative") return TrendingDown;
    return Heart;
  }, [profile?.emotional_trend]);

  const EmotionalIcon = emotionalTrendIcon;

  if (isLoading) {
    return (
      <Card className="shadow-elevated">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card className="shadow-elevated border-dashed">
        <CardContent className="py-8 text-center">
          <Brain className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            AI profile not yet generated for this student
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Generate a deep AI profile with study routine, 30‑day tasks & predictions
          </p>
          <div className="mt-4">
            <Button onClick={generate} disabled={generating} size="sm" className="gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating…" : "Generate AI Profile"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const LearningIcon = learningStyleIcons[profile.learning_style as keyof typeof learningStyleIcons] || Brain;
  const learningColor = learningStyleColors[profile.learning_style as keyof typeof learningStyleColors] || "text-primary bg-primary/10";
  const rich = (profile.analysis_data || {}) as any;

  if (compact) {
    return (
      <Card className="shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {student?.first_name} {student?.last_name}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className={`text-[10px] ${learningColor}`}>
                  <LearningIcon className="mr-1 h-3 w-3" />
                  {profile.learning_style || "Unknown"}
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${riskLevel.color}`}>
                  Risk: {profile.risk_score || 0}%
                </Badge>
              </div>
            </div>
            {(profile.needs_counseling || profile.needs_extra_support) && (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="shadow-elevated overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">AI Digital Twin</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {student?.first_name} {student?.last_name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={riskLevel.color}>Risk: {riskLevel.level}</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={generate}
                disabled={generating}
                className="h-8 gap-1.5"
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {generating ? "Regenerating…" : "Regenerate"}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          {/* Learning Profile */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Learning Profile
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-xl p-3 ${learningColor}`}>
                <div className="flex items-center gap-2">
                  <LearningIcon className="h-4 w-4" />
                  <span className="text-xs font-medium">Learning Style</span>
                </div>
                <p className="mt-1 text-sm font-semibold capitalize">
                  {profile.learning_style || "Not detected"}
                </p>
                {profile.learning_style_confidence && (
                  <p className="text-[10px] opacity-70">
                    {profile.learning_style_confidence}% confidence
                  </p>
                )}
              </div>

              <div className="rounded-xl bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">Learning Speed</span>
                </div>
                <p className="mt-1 text-sm font-semibold capitalize">
                  {profile.learning_speed || "Average"}
                </p>
              </div>
            </div>
          </div>

          {/* Attention & Focus */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Attention & Focus
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Attention Span</span>
                <span className="font-medium">
                  {profile.attention_span_minutes || 25} min
                </span>
              </div>
              <Progress 
                value={Math.min(100, ((profile.attention_span_minutes || 25) / 45) * 100)} 
                className="h-2"
              />
              {profile.best_learning_time && (
                <p className="text-xs text-muted-foreground">
                  Best time: <span className="font-medium capitalize">{profile.best_learning_time}</span>
                </p>
              )}
              {profile.focus_drop_detected && (
                <Badge variant="outline" className="text-amber-600 bg-amber-500/10 text-[10px]">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Focus drop detected
                </Badge>
              )}
            </div>
          </div>

          {/* Subject Performance */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-emerald-500" />
              Subject Analysis
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <p className="text-[10px] text-emerald-700 font-medium">Strong Subjects</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(profile.strong_subjects || []).length > 0 ? (
                    (profile.strong_subjects as string[]).slice(0, 3).map((subject) => (
                      <Badge key={subject} variant="secondary" className="text-[10px]">
                        {subject}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Analyzing...</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-red-500/10 p-3">
                <p className="text-[10px] text-red-700 font-medium">Needs Focus</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(profile.weak_subjects || []).length > 0 ? (
                    (profile.weak_subjects as string[]).slice(0, 3).map((subject) => (
                      <Badge key={subject} variant="secondary" className="text-[10px]">
                        {subject}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">None detected</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Emotional & Risk Analysis */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Heart className="h-4 w-4 text-pink-500" />
              Wellbeing Analysis
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-surface-2 p-3 text-center">
                <EmotionalIcon className={`mx-auto h-5 w-5 ${
                  profile.emotional_trend === "positive" || profile.emotional_trend === "improving"
                    ? "text-emerald-500"
                    : profile.emotional_trend === "negative" || profile.emotional_trend === "declining"
                    ? "text-red-500"
                    : "text-muted-foreground"
                }`} />
                <p className="mt-1 text-[10px] text-muted-foreground">Emotional</p>
                <p className="text-xs font-medium capitalize">
                  {profile.emotional_trend || "Stable"}
                </p>
              </div>

              <div className="rounded-xl bg-surface-2 p-3 text-center">
                <Target className={`mx-auto h-5 w-5 ${
                  (profile.burnout_probability || 0) > 60 ? "text-red-500" : "text-emerald-500"
                }`} />
                <p className="mt-1 text-[10px] text-muted-foreground">Burnout Risk</p>
                <p className="text-xs font-medium">
                  {profile.burnout_probability || 0}%
                </p>
              </div>

              <div className="rounded-xl bg-surface-2 p-3 text-center">
                <AlertTriangle className={`mx-auto h-5 w-5 ${
                  (profile.dropout_risk || 0) > 40 ? "text-red-500" : "text-emerald-500"
                }`} />
                <p className="mt-1 text-[10px] text-muted-foreground">Dropout</p>
                <p className="text-xs font-medium">
                  {profile.dropout_risk || 0}%
                </p>
              </div>
            </div>
          </div>

          {/* AI Recommendations */}
          {(profile.needs_counseling || profile.needs_extra_support || profile.needs_remedial_classes || profile.should_be_accelerated) && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Brain className="h-4 w-4" />
                AI Recommendations
              </h4>
              <ul className="space-y-1.5 text-sm">
                {profile.needs_counseling && (
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Schedule counseling session
                  </li>
                )}
                {profile.needs_extra_support && (
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    Assign additional learning support
                  </li>
                )}
                {profile.needs_remedial_classes && (
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                    Enroll in remedial classes
                  </li>
                )}
                {profile.should_be_accelerated && (
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Consider academic acceleration
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Last Updated */}
          {profile.last_analyzed_at && (
            <p className="text-[10px] text-muted-foreground text-right">
              Last analyzed: {new Date(profile.last_analyzed_at).toLocaleDateString()}
            </p>
          )}

          {/* Learning-only summary (shown in AI Insights → Learning Profile tab) */}
          {!showFullScope && (rich.executive_summary || rich.personality_traits || rich.motivators || rich.parent_guidance || rich.teacher_guidance || rich.milestones_3_months) && (
            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-4">
              <p className="text-sm font-semibold text-primary flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Learning Profile Summary
              </p>
              {rich.executive_summary && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Executive Summary</p>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{rich.executive_summary}</p>
                </div>
              )}
              {Array.isArray(rich.personality_traits) && rich.personality_traits.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Personality</p>
                  <div className="flex flex-wrap gap-1.5">
                    {rich.personality_traits.map((t: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(rich.motivators) && rich.motivators.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Motivators</p>
                  <ul className="text-sm list-disc list-inside space-y-0.5">
                    {rich.motivators.map((m: string, i: number) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(rich.parent_guidance) && rich.parent_guidance.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">For Parents</p>
                  <ul className="text-sm list-disc list-inside space-y-0.5">
                    {rich.parent_guidance.map((m: string, i: number) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(rich.teacher_guidance) && rich.teacher_guidance.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">For Teachers</p>
                  <ul className="text-sm list-disc list-inside space-y-0.5">
                    {rich.teacher_guidance.map((m: string, i: number) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(rich.milestones_3_months) && rich.milestones_3_months.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">3‑Month Milestones</p>
                  <ul className="text-sm list-disc list-inside space-y-0.5">
                    {rich.milestones_3_months.map((m: string, i: number) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Heavy AI Profile (study routine, tasks, predictions) — full scope only */}
          {showFullScope && (rich.executive_summary || rich.study_routine || rich.next_30_days_tasks || rich.predictions) && (
            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-4">
              <button
                type="button"
                onClick={() => setShowRich((v) => !v)}
                className="flex w-full items-center justify-between text-sm font-semibold text-primary"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" /> Full AI Profile
                </span>
                {showRich ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showRich && (
                <div className="space-y-4">
                  {rich.executive_summary && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Executive Summary</p>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{rich.executive_summary}</p>
                    </div>
                  )}

                  {Array.isArray(rich.personality_traits) && rich.personality_traits.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Personality</p>
                      <div className="flex flex-wrap gap-1.5">
                        {rich.personality_traits.map((t: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(rich.motivators) && rich.motivators.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Motivators</p>
                      <ul className="text-sm list-disc list-inside space-y-0.5">
                        {rich.motivators.map((m: string, i: number) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}

                  {rich.study_routine?.weekly_schedule && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" /> Weekly Study Routine
                      </p>
                      <div className="grid gap-2">
                        {rich.study_routine.weekly_schedule.map((d: any, i: number) => (
                          <div key={i} className="rounded-lg bg-surface-2 p-2.5">
                            <p className="text-xs font-semibold">{d.day}</p>
                            <ul className="mt-1 space-y-1">
                              {(d.blocks || []).map((b: any, j: number) => (
                                <li key={j} className="text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">{b.time}</span> · {b.subject} — {b.activity}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      {Array.isArray(rich.study_routine.daily_tips) && (
                        <ul className="text-xs list-disc list-inside text-muted-foreground space-y-0.5">
                          {rich.study_routine.daily_tips.map((t: string, i: number) => <li key={i}>{t}</li>)}
                        </ul>
                      )}
                      {rich.study_routine.session_structure && (
                        <p className="text-xs text-muted-foreground italic">{rich.study_routine.session_structure}</p>
                      )}
                    </div>
                  )}

                  {Array.isArray(rich.next_30_days_tasks) && rich.next_30_days_tasks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <ListChecks className="h-3.5 w-3.5" /> Next 30 Days · Tasks
                      </p>
                      <div className="space-y-1.5">
                        {rich.next_30_days_tasks.map((task: any, i: number) => (
                          <div key={i} className="rounded-lg bg-surface-2 p-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{task.title}</p>
                                {task.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <Badge variant="outline" className="text-[9px]">
                                  {task.priority || "medium"}
                                </Badge>
                                {task.due_in_days != null && (
                                  <span className="text-[10px] text-muted-foreground">in {task.due_in_days}d</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {rich.predictions && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" /> Predictions
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {rich.predictions.next_term_grade_percent != null && (
                          <div className="rounded-lg bg-surface-2 p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">Next Term</p>
                            <p className="text-sm font-semibold">{rich.predictions.next_term_grade_percent}%</p>
                          </div>
                        )}
                        {rich.predictions.expected_attendance_percent != null && (
                          <div className="rounded-lg bg-surface-2 p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">Attendance</p>
                            <p className="text-sm font-semibold">{rich.predictions.expected_attendance_percent}%</p>
                          </div>
                        )}
                        {rich.predictions.promotion_probability != null && (
                          <div className="rounded-lg bg-surface-2 p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">Promotion</p>
                            <p className="text-sm font-semibold">{rich.predictions.promotion_probability}%</p>
                          </div>
                        )}
                      </div>
                      {rich.predictions["12_month_outlook"] && (
                        <p className="text-xs leading-relaxed text-muted-foreground">{rich.predictions["12_month_outlook"]}</p>
                      )}
                      {Array.isArray(rich.predictions.career_pathways) && rich.predictions.career_pathways.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                            <GraduationCap className="h-3 w-3" /> Career Pathways
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {aiToTextArray(rich.predictions.career_pathways).map((c, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">{c}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {(Array.isArray(rich.parent_guidance) && rich.parent_guidance.length > 0) && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">For Parents</p>
                      <ul className="text-sm list-disc list-inside space-y-0.5">
                        {rich.parent_guidance.map((m: string, i: number) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}

                  {(Array.isArray(rich.teacher_guidance) && rich.teacher_guidance.length > 0) && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">For Teachers</p>
                      <ul className="text-sm list-disc list-inside space-y-0.5">
                        {rich.teacher_guidance.map((m: string, i: number) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(rich.milestones_3_months) && rich.milestones_3_months.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">3‑Month Milestones</p>
                      <ul className="text-sm list-disc list-inside space-y-0.5">
                        {rich.milestones_3_months.map((m: string, i: number) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
