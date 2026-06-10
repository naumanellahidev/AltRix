import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AICommandCenter,
  EarlyWarningSystem,
  SchoolReputationDashboard,
  SmartTimetableGenerator,
  TeacherPerformanceAnalyzer,
  AICounselorMode,
} from "@/components/ai";
import { Brain, Shield, Award, Calendar, Heart, BarChart3 } from "lucide-react";

interface Props {
  schoolId: string | null;
}

export type AITabValue = "overview" | "warnings" | "reputation" | "teachers" | "timetable" | "counseling";

export function OwnerAIModule({ schoolId }: Props) {
  const [tab, setTab] = useState<AITabValue>("overview");

  if (!schoolId) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as AITabValue)} className="space-y-6">
      <TabsList className="flex flex-wrap gap-1">
        <TabsTrigger value="overview" className="gap-2">
          <Brain className="h-4 w-4" />
          <span className="hidden sm:inline">Overview</span>
        </TabsTrigger>
        <TabsTrigger value="warnings" className="gap-2">
          <Shield className="h-4 w-4" />
          <span className="hidden sm:inline">Warnings</span>
        </TabsTrigger>
        <TabsTrigger value="reputation" className="gap-2">
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">Reputation</span>
        </TabsTrigger>
        <TabsTrigger value="teachers" className="gap-2">
          <Award className="h-4 w-4" />
          <span className="hidden sm:inline">Teachers</span>
        </TabsTrigger>
        <TabsTrigger value="timetable" className="gap-2">
          <Calendar className="h-4 w-4" />
          <span className="hidden sm:inline">Timetable</span>
        </TabsTrigger>
        <TabsTrigger value="counseling" className="gap-2">
          <Heart className="h-4 w-4" />
          <span className="hidden sm:inline">Counseling</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <AICommandCenter schoolId={schoolId} onNavigate={setTab} />
      </TabsContent>

      <TabsContent value="warnings">
        <EarlyWarningSystem schoolId={schoolId} />
      </TabsContent>

      <TabsContent value="reputation">
        <SchoolReputationDashboard schoolId={schoolId} />
      </TabsContent>

      <TabsContent value="teachers">
        <TeacherPerformanceAnalyzer schoolId={schoolId} />
      </TabsContent>

      <TabsContent value="timetable">
        <SmartTimetableGenerator schoolId={schoolId} />
      </TabsContent>

      <TabsContent value="counseling">
        <AICounselorMode schoolId={schoolId} />
      </TabsContent>
    </Tabs>
  );
}
