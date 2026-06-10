import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Target, Briefcase, Sparkles } from "lucide-react";
import { StudentDigitalTwinCard } from "@/components/ai/StudentDigitalTwinCard";
import { PredictiveAcademicModel } from "@/components/ai/PredictiveAcademicModel";
import { StudentCareerPathAI } from "@/components/ai/StudentCareerPathAI";
import { AISafeBoundary } from "@/components/ai/AISafeBoundary";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  myStudent: {
    status: "idle" | "loading" | "ready" | "error";
    studentId: string | null;
    error: string | null;
  };
  schoolId: string | null;
}

export function StudentAIModule({ myStudent, schoolId }: Props) {
  if (myStudent.status === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (myStudent.status !== "ready" || !schoolId) {
    return (
      <Card className="shadow-sm border-dashed">
        <CardContent className="py-12 text-center">
          <Brain className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-display font-semibold">AI Insights Unavailable</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Please ensure your student profile is linked to access AI-powered insights.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 p-2.5">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">AI Insights</h1>
          <p className="text-sm text-muted-foreground">
            Personalized learning analytics powered by AI
          </p>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Learning Profile</span>
            <span className="sm:hidden">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="predictions" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Predictions</span>
            <span className="sm:hidden">Predict</span>
          </TabsTrigger>
          <TabsTrigger value="career" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            <span className="hidden sm:inline">Career Path</span>
            <span className="sm:hidden">Career</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <AISafeBoundary label="digital-twin">
            <StudentDigitalTwinCard
              studentId={myStudent.studentId!}
              schoolId={schoolId}
              scope="learning"
            />
          </AISafeBoundary>
        </TabsContent>

        <TabsContent value="predictions" className="mt-6">
          <AISafeBoundary label="predictions">
            <PredictiveAcademicModel
              studentId={myStudent.studentId!}
              schoolId={schoolId}
            />
          </AISafeBoundary>
        </TabsContent>

        <TabsContent value="career" className="mt-6">
          <AISafeBoundary label="career">
            <StudentCareerPathAI
              studentId={myStudent.studentId!}
              schoolId={schoolId}
            />
          </AISafeBoundary>
        </TabsContent>
      </Tabs>

      {/* AI Disclaimer */}
      <Card className="shadow-sm bg-muted/30 border-muted">
        <CardContent className="py-4">
          <div className="flex items-start gap-3 text-xs text-muted-foreground">
            <Brain className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              AI insights are generated based on your academic data, attendance patterns, and performance trends. 
              These are meant to guide your learning journey and should be discussed with your teachers and counselors.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
