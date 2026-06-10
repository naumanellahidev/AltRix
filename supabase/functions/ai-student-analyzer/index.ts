import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { studentId, schoolId, analysisType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch comprehensive student data
    const [
      studentRes,
      attendanceRes,
      marksRes,
      behaviorRes,
      submissionsRes,
      enrollmentRes,
      upcomingAssignRes,
    ] = await Promise.all([
      supabase.from("students").select("*").eq("id", studentId).single(),
      supabase.from("attendance_entries")
        .select("status, created_at, session_id")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(90),
      supabase.from("student_marks")
        .select("marks, assessment_id, created_at, academic_assessments(title, max_marks, subject_id)")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("behavior_notes")
        .select("note_type, content, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("assignment_submissions")
        .select("status, submitted_at, marks_obtained, assignments(max_marks, due_date)")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false })
        .limit(30),
      supabase.from("student_enrollments")
        .select("class_section_id, class_sections(name, academic_classes(name, grade_level))")
        .eq("student_id", studentId)
        .is("end_date", null)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("assignments")
        .select("title, due_date, max_marks")
        .eq("school_id", schoolId)
        .gte("due_date", new Date().toISOString())
        .order("due_date", { ascending: true })
        .limit(15),
    ]);

    const student = studentRes.data;
    const attendance = attendanceRes.data || [];
    const marks = marksRes.data || [];
    const behavior = behaviorRes.data || [];
    const submissions = submissionsRes.data || [];
    const enrollment: any = enrollmentRes.data || null;
    const upcomingAssignments: any[] = upcomingAssignRes.data || [];

    // Calculate attendance rate
    const totalAttendance = attendance.length;
    const presentCount = attendance.filter((a: any) => a.status === "present" || a.status === "late").length;
    const attendanceRate = totalAttendance > 0 ? (presentCount / totalAttendance) * 100 : 100;

    // Calculate average marks
    const validMarks = marks.filter((m: any) => m.marks != null && m.academic_assessments?.max_marks);
    const avgPercentage = validMarks.length > 0
      ? validMarks.reduce((sum: number, m: any) => sum + (m.marks / m.academic_assessments.max_marks) * 100, 0) / validMarks.length
      : 0;

    // Calculate late submission ratio
    const lateSubmissions = submissions.filter((s: any) => {
      if (!s.assignments?.due_date || !s.submitted_at) return false;
      return new Date(s.submitted_at) > new Date(s.assignments.due_date);
    }).length;
    const lateRatio = submissions.length > 0 ? (lateSubmissions / submissions.length) * 100 : 0;

    // Analyze behavior patterns
    const positiveBehavior = behavior.filter(b => b.note_type === "praise" || b.note_type === "positive").length;
    const negativeBehavior = behavior.filter(b => b.note_type === "warning" || b.note_type === "concern").length;

    const contextData = `
Student Analysis Data:
- Name: ${student?.first_name} ${student?.last_name}
- Class: ${enrollment?.class_sections?.academic_classes?.name || "?"} (Grade ${enrollment?.class_sections?.academic_classes?.grade_level ?? "?"}) - Section ${enrollment?.class_sections?.name || "?"}
- Date of Birth: ${student?.date_of_birth || "Unknown"}
- Gender: ${student?.gender || "Unknown"}
- Status: ${student?.status}
- Attendance Rate (last 90 days): ${attendanceRate.toFixed(1)}%
- Average Academic Performance: ${avgPercentage.toFixed(1)}%
- Late Submission Rate: ${lateRatio.toFixed(1)}%
- Positive Behavior Notes: ${positiveBehavior}
- Negative Behavior Notes: ${negativeBehavior}
- Total Assessments Taken: ${marks.length}
- Recent Behavior: ${behavior.slice(0, 3).map(b => b.content).join("; ")}
- Recent Marks (last 10): ${validMarks.slice(0,10).map((m:any)=>`${m.academic_assessments?.title || "Test"}: ${m.marks}/${m.academic_assessments?.max_marks}`).join("; ")}
- Upcoming Assignments: ${upcomingAssignments.slice(0,10).map((a:any)=>`${a.title} (due ${a.due_date?.split("T")[0]})`).join("; ")}
- Today's Date: ${new Date().toISOString().split("T")[0]}
`;

    const systemPrompt = `You are a senior AI education analyst creating a COMPREHENSIVE, DEEP digital twin profile for a student. Analyze ALL the provided data and produce a heavy, detailed, personalized profile that teachers, parents, and the student can actually use. Return ONLY valid JSON (no markdown fences) with this exact structure:

{
  "learning_style": "visual" | "auditory" | "kinesthetic" | "reading_writing" | "unknown",
  "learning_style_confidence": 0-100,
  "strong_subjects": ["array of subjects"],
  "weak_subjects": ["array of subjects"],
  "attention_span_minutes": 15-60,
  "best_learning_time": "morning" | "midday" | "afternoon" | "evening",
  "risk_score": 0-100,
  "burnout_probability": 0-100,
  "dropout_risk": 0-100,
  "focus_drop_detected": true/false,
  "learning_speed": "slow" | "below_average" | "average" | "above_average" | "accelerated",
  "needs_extra_support": true/false,
  "needs_remedial_classes": true/false,
  "needs_counseling": true/false,
  "should_be_accelerated": true/false,
  "emotional_trend": "declining" | "stable" | "improving" | "concerning",
  "key_insights": ["array of 3-5 key insights"],
  "recommended_actions": ["array of specific recommended actions"],
  "executive_summary": "2-3 paragraph narrative profile of the student as a learner and person",
  "personality_traits": ["5-7 traits inferred from behavior + performance"],
  "strengths": ["5-7 concrete strengths"],
  "weaknesses": ["5-7 specific weaknesses or growth areas"],
  "motivators": ["3-5 things that likely motivate this student"],
  "study_routine": {
    "weekly_schedule": [
      { "day": "Monday", "blocks": [ { "time": "16:00-17:00", "subject": "Math", "activity": "Practice problems", "why": "..." } ] }
    ],
    "daily_tips": ["3-5 daily habits"],
    "session_structure": "Recommended pomodoro / block structure"
  },
  "next_30_days_tasks": [
    { "week": 1, "title": "...", "description": "...", "category": "academic|behavior|wellbeing|skill", "priority": "high|medium|low", "due_in_days": 7 }
  ],
  "predictions": {
    "next_term_grade_percent": 0-100,
    "expected_attendance_percent": 0-100,
    "promotion_probability": 0-100,
    "academic_trajectory": "improving|stable|declining",
    "12_month_outlook": "narrative paragraph",
    "career_pathways": ["3-5 plain string sentences, e.g. 'Software Engineer — strong logic and math fluency'. Each item MUST be a string, NOT an object."]
  },
  "interventions": [
    { "type": "academic|emotional|behavioral|skill", "action": "...", "owner": "teacher|parent|counselor|student", "urgency": "now|this_week|this_month" }
  ],
  "parent_guidance": ["4-6 actionable tips for parents"],
  "teacher_guidance": ["4-6 actionable tips for teachers"],
  "milestones_3_months": ["3-5 measurable milestones to track"]
}

Base your analysis on attendance, academic trends, submission patterns, behavior sentiment, and engagement. Be specific to THIS student — never generic. Reference real subjects, real upcoming assignments, and real numbers in the narrative. Return ONLY valid JSON.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextData },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "{}";
    
    // Parse JSON from response
    let analysis;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      analysis = JSON.parse(jsonStr.trim());
    } catch {
      analysis = { error: "Failed to parse AI response", raw: content };
    }

    // Upsert to ai_student_profiles (only existing columns; rest goes into analysis_data)
    if (analysis && !analysis.error) {
      const riskScore = Number(analysis.risk_score || 0);
      const riskLevel = riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low";
      const { error: upErr } = await supabase.from("ai_student_profiles").upsert({
        school_id: schoolId,
        student_id: studentId,
        learning_style: analysis.learning_style || "unknown",
        personality_type: (analysis.personality_traits && analysis.personality_traits[0]) || null,
        risk_score: riskScore,
        risk_level: riskLevel,
        needs_counseling: !!analysis.needs_counseling,
        needs_extra_support: !!analysis.needs_extra_support,
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        analysis_data: analysis,
        last_analyzed_at: new Date().toISOString(),
      }, { onConflict: "school_id,student_id" });
      if (upErr) console.error("upsert ai_student_profiles error:", upErr);
    }

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-student-analyzer error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
