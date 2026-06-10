import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { TeacherPerformanceAnalyzer } from "@/components/ai/TeacherPerformanceAnalyzer";

interface Props {
  schoolId: string;
}

export function OwnerTeacherEffectiveness({ schoolId }: Props) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data: teachers } = useQuery({
    queryKey: ["owner_teacher_effectiveness_teachers", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("school_id", schoolId)
        .eq("role", "teacher");
      if (error) throw error;
      return Array.from(new Set((data || []).map((r: any) => r.user_id))).filter(Boolean) as string[];
    },
  });

  const runAnalysis = async () => {
    if (!teachers || teachers.length === 0) {
      toast({ title: "No teachers found", description: "Add teachers in HR & Users first.", variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      const results = await Promise.allSettled(
        teachers.map((teacherUserId) =>
          supabase.functions.invoke("ai-teacher-analyzer", { body: { schoolId, teacherUserId } })
        )
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      toast({ title: "Analysis complete", description: `Generated insights for ${ok}/${teachers.length} teachers.` });
      qc.invalidateQueries({ queryKey: ["ai_teacher_performance", schoolId] });
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display font-semibold">Teacher Effectiveness Rankings</p>
            <p className="text-sm text-muted-foreground">
              AI evaluates each teacher using attendance, marks, homework and behavior notes.
              {teachers && ` ${teachers.length} teacher(s) detected.`}
            </p>
          </div>
          <Button onClick={runAnalysis} disabled={running || !teachers?.length} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {running ? "Analyzing…" : "Generate latest insights"}
          </Button>
        </CardContent>
      </Card>

      <TeacherPerformanceAnalyzer schoolId={schoolId} />
    </div>
  );
}
