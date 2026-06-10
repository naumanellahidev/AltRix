import { useEffect, useState, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mail, MessageSquare, Phone, TrendingDown, TrendingUp, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

interface StudentData {
  id: string;
  firstName: string;
  lastName: string;
  attendanceRate: number;
  averageGrade: number;
  recentTrend: "up" | "down" | "stable";
  guardians: { name: string; phone: string | null; email: string | null }[];
}

interface Props {
  studentId: string;
  schoolId: string;
  schoolSlug: string;
  children: ReactNode;
}

export function StudentQuickViewPopover({ studentId, schoolId, schoolSlug, children }: Props) {
  const [data, setData] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchStudentData = async () => {
    if (hasLoaded || loading) return;
    
    setLoading(true);
    try {
      // Fetch student basic info
      const { data: student } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("id", studentId)
        .eq("school_id", schoolId)
        .maybeSingle();

      if (!student) {
        setLoading(false);
        return;
      }

      // Fetch attendance rate
      const { data: attendanceData } = await supabase
        .from("attendance_entries")
        .select("status")
        .eq("student_id", studentId)
        .eq("school_id", schoolId);

      let attendanceRate = 100;
      if (attendanceData && attendanceData.length > 0) {
        const present = attendanceData.filter(
          (e) => e.status === "present" || e.status === "late"
        ).length;
        attendanceRate = Math.round((present / attendanceData.length) * 100);
      }

      // Fetch average grade - use separate queries
      const { data: marksData } = await (supabase as any)
        .from("student_marks")
        .select("marks, assessment_id")
        .eq("student_id", studentId)
        .eq("school_id", schoolId);

      let averageGrade = 0;
      let recentTrend: "up" | "down" | "stable" = "stable";
      
      if (marksData && marksData.length > 0) {
        // Fetch assessments for max_marks
        const assessmentIds = marksData.map(m => m.assessment_id);
        const { data: assessments } = await supabase
          .from("academic_assessments")
          .select("id, max_marks")
          .in("id", assessmentIds);

        const assessmentMap = new Map(assessments?.map(a => [a.id, a.max_marks]) || []);
        
        const validMarks = marksData.filter(
          (m) => m.marks !== null && assessmentMap.has(m.assessment_id)
        );
        
        if (validMarks.length > 0) {
          const totalPercentage = validMarks.reduce((sum, m) => {
            const maxMarks = (assessmentMap.get(m.assessment_id) as number) || 100;
            const percentage = (m.marks! / maxMarks) * 100;
            return sum + percentage;
          }, 0);
          averageGrade = Math.round(totalPercentage / validMarks.length);

          // Calculate trend (compare last 2 assessments)
          if (validMarks.length >= 2) {
            const lastTwo = validMarks.slice(-2);
            const olderMax = (assessmentMap.get(lastTwo[0].assessment_id) as number) || 100;
            const newerMax = (assessmentMap.get(lastTwo[1].assessment_id) as number) || 100;
            const older = (lastTwo[0].marks! / olderMax) * 100;
            const newer = (lastTwo[1].marks! / newerMax) * 100;
            recentTrend = newer > older + 5 ? "up" : newer < older - 5 ? "down" : "stable";
          }
        }
      }

      // Fetch guardians
      const { data: guardianData } = await supabase
        .from("student_guardians")
        .select("full_name, phone, email")
        .eq("student_id", studentId);

      const guardians = guardianData?.map((g) => ({
        name: g.full_name || "Guardian",
        phone: g.phone,
        email: g.email,
      })) || [];

      setData({
        id: student.id,
        firstName: student.first_name,
        lastName: student.last_name || "",
        attendanceRate,
        averageGrade,
        recentTrend,
        guardians,
      });
      setHasLoaded(true);
    } catch (error) {
      console.error("Error fetching student data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild onMouseEnter={fetchStudentData}>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="top" align="start">
        {loading && !data ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarFallback>
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">
                  {data.firstName} {data.lastName}
                </p>
                <div className="flex items-center gap-1">
                  {data.recentTrend === "up" && (
                    <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 text-primary">
                      <TrendingUp className="h-3 w-3" />
                      Improving
                    </Badge>
                  )}
                  {data.recentTrend === "down" && (
                    <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive">
                      <TrendingDown className="h-3 w-3" />
                      Declining
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Attendance</p>
                <div className="flex items-center gap-2">
                  <Progress
                    value={data.attendanceRate}
                    className="h-2 flex-1"
                  />
                  <span
                    className={`text-sm font-medium ${
                      data.attendanceRate < 75 ? "text-destructive" : ""
                    }`}
                  >
                    {data.attendanceRate}%
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Avg Grade</p>
                <div className="flex items-center gap-2">
                  <Progress
                    value={data.averageGrade}
                    className="h-2 flex-1"
                  />
                  <span
                    className={`text-sm font-medium ${
                      data.averageGrade < 50 ? "text-destructive" : ""
                    }`}
                  >
                    {data.averageGrade}%
                  </span>
                </div>
              </div>
            </div>

            {/* Guardian Contact */}
            {data.guardians.length > 0 && (
              <div className="space-y-1.5 border-t pt-2">
                <p className="text-xs font-medium text-muted-foreground">Guardian Contact</p>
                {data.guardians.slice(0, 2).map((g, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate">{g.name}</span>
                    <div className="flex items-center gap-1">
                      {g.phone && (
                        <a
                          href={`tel:${g.phone}`}
                          className="rounded p-1 hover:bg-accent"
                          title={g.phone}
                        >
                          <Phone className="h-3 w-3" />
                        </a>
                      )}
                      {g.email && (
                        <a
                          href={`mailto:${g.email}`}
                          className="rounded p-1 hover:bg-accent"
                          title={g.email}
                        >
                          <Mail className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 border-t pt-2">
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link to={`/${schoolSlug}/teacher/students?id=${data.id}`}>
                  <User className="mr-1 h-3 w-3" />
                  Profile
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link to={`/${schoolSlug}/teacher/messages?student=${data.id}`}>
                  <MessageSquare className="mr-1 h-3 w-3" />
                  Message
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Student not found</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
