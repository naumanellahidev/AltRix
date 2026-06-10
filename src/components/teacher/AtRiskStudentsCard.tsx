import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, UserX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AtRiskStudent {
  student_id: string;
  first_name: string;
  last_name: string | null;
  class_section_id: string;
  class_name: string | null;
  section_name: string | null;
  attendance_rate: number;
  avg_grade_percentage: number;
  recent_grade_avg: number;
  risk_reason: string;
}

interface Props {
  schoolId: string;
  sectionIds?: string[];
}

export function AtRiskStudentsCard({ schoolId, sectionIds }: Props) {
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAtRiskStudents();
  }, [schoolId, sectionIds]);

  const loadAtRiskStudents = async () => {
    setLoading(true);
    
    const { data, error } = await (supabase as any).rpc("get_at_risk_students", {
      _school_id: schoolId,
      _class_section_id: null,
    });

    if (!error && data) {
      // Filter by section if provided
      let filtered = data as unknown as AtRiskStudent[];
      if (sectionIds && sectionIds.length > 0) {
        filtered = filtered.filter((s) => sectionIds.includes(s.class_section_id));
      }
      setStudents(filtered.slice(0, 10)); // Limit to 10
    }
    
    setLoading(false);
  };

  const getRiskIcon = (reason: string) => {
    switch (reason) {
      case "Low Attendance":
        return <UserX className="h-4 w-4" />;
      case "Low Grades":
      case "Declining Grades":
        return <TrendingDown className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getRiskColor = (reason: string) => {
    switch (reason) {
      case "Low Attendance":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "Low Grades":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400";
      case "Declining Grades":
        return "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            At-Risk Students
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          At-Risk Students
        </CardTitle>
        <CardDescription>
          Students with low attendance (&lt;75%) or declining grades
        </CardDescription>
      </CardHeader>
      <CardContent>
        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
              <AlertTriangle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="mt-3 text-sm font-medium text-green-600 dark:text-green-400">
              All students are on track!
            </p>
            <p className="text-xs text-muted-foreground">
              No at-risk students detected in your sections
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {students.map((student) => (
              <div
                key={student.student_id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-2 ${getRiskColor(student.risk_reason)}`}>
                    {getRiskIcon(student.risk_reason)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {student.first_name} {student.last_name}
                      {(student.class_name || student.section_name) && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {[student.class_name, student.section_name].filter(Boolean).join(" • ")}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Attendance: {student.attendance_rate.toFixed(0)}% • 
                      Grade: {student.avg_grade_percentage.toFixed(0)}%
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={getRiskColor(student.risk_reason)}>
                  {student.risk_reason}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
