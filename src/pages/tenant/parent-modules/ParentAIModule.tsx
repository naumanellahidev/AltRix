import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Target, Briefcase, Sparkles, Heart } from "lucide-react";
import { StudentDigitalTwinCard } from "@/components/ai/StudentDigitalTwinCard";
import { PredictiveAcademicModel } from "@/components/ai/PredictiveAcademicModel";
import { StudentCareerPathAI } from "@/components/ai/StudentCareerPathAI";
import { ParentTrustDashboard } from "@/components/ai/ParentTrustDashboard";
import { AISafeBoundary } from "@/components/ai/AISafeBoundary";
import { Card, CardContent } from "@/components/ui/card";
import { ChildInfo } from "@/hooks/useMyChildren";
import { useSession } from "@/hooks/useSession";

interface Props {
  child: ChildInfo | null;
  schoolId: string | null;
}

const ParentAIModule = ({ child, schoolId }: Props) => {
  const { user } = useSession();

  if (!child || !schoolId) {
    return (
      <Card className="shadow-sm border-dashed">
        <CardContent className="py-12 text-center">
          <Brain className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-display font-semibold">AI Insights Unavailable</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Please select a child to view AI-powered insights.
          </p>
        </CardContent>
      </Card>
    );
  }

  const childName = [child.first_name, child.last_name].filter(Boolean).join(" ") || "Your Child";

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
            AI-powered learning analytics for {childName}
          </p>
        </div>
      </div>

      <Tabs defaultValue="updates" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="updates" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            <span className="hidden sm:inline">Updates</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="predictions" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Predictions</span>
          </TabsTrigger>
          <TabsTrigger value="career" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            <span className="hidden sm:inline">Career</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="updates" className="mt-6">
          {user && (
            <AISafeBoundary label="parent-trust">
              <ParentTrustDashboard
                studentId={child.student_id}
                schoolId={schoolId}
                parentUserId={user.id}
              />
            </AISafeBoundary>
          )}
        </TabsContent>

        <TabsContent value="profile" className="mt-6">
          <AISafeBoundary label="digital-twin">
            <StudentDigitalTwinCard
              studentId={child.student_id}
              schoolId={schoolId}
              scope="learning"
            />
          </AISafeBoundary>
        </TabsContent>

        <TabsContent value="predictions" className="mt-6">
          <AISafeBoundary label="predictions">
            <PredictiveAcademicModel
              studentId={child.student_id}
              schoolId={schoolId}
            />
          </AISafeBoundary>
        </TabsContent>

        <TabsContent value="career" className="mt-6">
          <AISafeBoundary label="career">
            <StudentCareerPathAI
              studentId={child.student_id}
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
              AI insights are generated based on your child's academic data, attendance patterns, and performance trends. 
              These are meant to help you support their learning journey and should be discussed with teachers.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ParentAIModule;
