import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Section {
  id: string;
  name: string;
  class_name: string;
}

interface SectionStats {
  section_name: string;
  avg_attendance: number;
  avg_grade: number;
  student_count: number;
}

interface GradeDistribution {
  name: string;
  value: number;
  color: string;
}

interface Props {
  schoolId: string;
  sectionIds: string[];
}

const GRADE_COLORS: Record<string, string> = {
  "A+": "hsl(142, 76%, 36%)",
  "A": "hsl(142, 69%, 45%)",
  "B+": "hsl(85, 60%, 50%)",
  "B": "hsl(48, 95%, 53%)",
  "C+": "hsl(38, 92%, 50%)",
  "C": "hsl(25, 95%, 53%)",
  "D": "hsl(15, 90%, 55%)",
  "F": "hsl(0, 84%, 60%)",
};

export function ClassPerformanceChart({ schoolId, sectionIds }: Props) {
  const [sectionStats, setSectionStats] = useState<SectionStats[]>([]);
  const [gradeDistribution, setGradeDistribution] = useState<GradeDistribution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sectionIds.length > 0) {
      loadStats();
    }
  }, [schoolId, sectionIds]);

  const loadStats = async () => {
    setLoading(true);

    // Get section details
    const { data: sections } = await api
      .from("class_sections")
      .select("id, name, class_id")
      .in("id", sectionIds);

    const { data: classes } = await api
      .from("academic_classes")
      .select("id, name");

    const classMap = new Map(classes?.map((c) => [c.id, c.name]) || []);

    // Get attendance stats per section
    const stats: SectionStats[] = [];
    for (const section of sections || []) {
      // Get student count
      const { count: studentCount } = await api
        .from("student_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("class_section_id", section.id);

      // Get attendance rate
      const { data: entries } = await api
        .from("attendance_entries")
        .select("status, session_id!inner(class_section_id)")
        .eq("school_id", schoolId);
      
      const sectionEntries = entries?.filter(
        (e: any) => e.session_id?.class_section_id === section.id
      ) || [];
      
      const presentCount = sectionEntries.filter(
        (e) => e.status === "present" || e.status === "late"
      ).length;
      const avgAttendance = sectionEntries.length > 0 
        ? (presentCount / sectionEntries.length) * 100 
        : 100;

      // Get average grade
      const { data: marks } = await api
        .from("student_marks")
        .select("marks, assessment_id!inner(class_section_id, max_marks)")
        .eq("school_id", schoolId);
      
      const sectionMarks = marks?.filter(
        (m: any) => m.assessment_id?.class_section_id === section.id
      ) || [];
      
      const avgGrade = sectionMarks.length > 0
        ? sectionMarks.reduce((sum, m: any) => {
            const percentage = (m.marks / (m.assessment_id?.max_marks || 100)) * 100;
            return sum + percentage;
          }, 0) / sectionMarks.length
        : 0;

      stats.push({
        section_name: `${classMap.get(section.class_id) || ""} ${section.name}`,
        avg_attendance: Math.round(avgAttendance),
        avg_grade: Math.round(avgGrade),
        student_count: studentCount || 0,
      });
    }

    setSectionStats(stats);

    // Get grade distribution
    const { data: allMarks } = await api
      .from("student_marks")
      .select("computed_grade")
      .eq("school_id", schoolId)
      .in("assessment_id", 
        (await api
          .from("academic_assessments")
          .select("id")
          .in("class_section_id", sectionIds)
        ).data?.map((a) => a.id) || []
      );

    const gradeCounts: Record<string, number> = {};
    allMarks?.forEach((m) => {
      if (m.computed_grade) {
        gradeCounts[m.computed_grade] = (gradeCounts[m.computed_grade] || 0) + 1;
      }
    });

    const distribution = Object.entries(gradeCounts).map(([name, value]) => ({
      name,
      value,
      color: GRADE_COLORS[name] || "hsl(var(--muted))",
    }));

    setGradeDistribution(distribution);
    setLoading(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Class Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Class Performance</CardTitle>
        <CardDescription>Attendance and grade trends across your sections</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="comparison" className="w-full">
          <TabsList className="mb-4 w-full grid grid-cols-2">
            <TabsTrigger value="comparison" className="text-xs sm:text-sm px-2 sm:px-4">
              Section Comparison
            </TabsTrigger>
            <TabsTrigger value="grades" className="text-xs sm:text-sm px-2 sm:px-4">
              Grade Distribution
            </TabsTrigger>
          </TabsList>

          <TabsContent value="comparison">
            {sectionStats.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No data available yet
              </p>
            ) : (
              <div className="w-full overflow-x-auto">
                <div className="min-w-[300px]">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart 
                      data={sectionStats} 
                      margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="section_name" 
                        tick={{ fontSize: 9 }} 
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        height={45}
                        angle={-25}
                        textAnchor="end"
                      />
                      <YAxis 
                        domain={[0, 100]} 
                        tick={{ fontSize: 9 }} 
                        tickLine={false}
                        axisLine={false}
                        width={30}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "11px"
                        }}
                        formatter={(value: number) => [`${value.toFixed(1)}%`, ""]}
                      />
                      <Legend 
                        wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} 
                        iconSize={10}
                      />
                      <Bar dataKey="avg_attendance" name="Attendance" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="avg_grade" name="Grade" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="grades">
            {gradeDistribution.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No grades recorded yet
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                {/* Pie Chart */}
                <div className="w-full sm:w-1/2 flex justify-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={gradeDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        labelLine={false}
                      >
                        {gradeDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number, name: string) => [`${value} students`, name]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "11px"
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend - Stacked on mobile, side by side on desktop */}
                <div className="flex flex-wrap justify-center gap-2 sm:flex-col sm:gap-1.5">
                  {gradeDistribution.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-1.5">
                      <div 
                        className="h-3 w-3 rounded-sm shrink-0" 
                        style={{ backgroundColor: entry.color }} 
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {entry.name}: {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
