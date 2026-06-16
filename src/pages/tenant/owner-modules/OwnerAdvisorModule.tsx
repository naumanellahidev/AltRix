import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Send, Sparkles, Lightbulb, TrendingUp, Users, Coins, AlertTriangle, Building2, GraduationCap, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { startOfMonth, startOfYear, subDays } from "date-fns";

interface Props {
  schoolId: string | null;
}

type Message = { role: "user" | "assistant"; content: string };

export function OwnerAdvisorModule({ schoolId }: Props) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Date ranges for KPI fetch
  const monthStart = useMemo(() => startOfMonth(new Date()), []);
  const yearStart = useMemo(() => startOfYear(new Date()), []);
  const d7Ago = useMemo(() => subDays(new Date(), 7), []);

  // Fetch school data for AI context
  const { data: schoolData } = useQuery({
    queryKey: ["owner_advisor_context", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;

      const [studentsRes, paymentsRes, expensesRes, attendanceRes, leadsRes, invoicesRes, staffRes, teachersRes, marksRes] = await Promise.all([
        supabase.from("students").select("id,status").eq("school_id", schoolId),
        supabase.from("fee_payments").select("amount,paid_at").eq("school_id", schoolId).eq("status", "success"),
        supabase.from("finance_expenses").select("amount,expense_date").eq("school_id", schoolId),
        supabase.from("attendance_entries").select("status").eq("school_id", schoolId).gte("created_at", d7Ago.toISOString()),
        supabase.from("crm_leads").select("id,status,created_at").eq("school_id", schoolId),
        supabase.from("fee_invoices").select("id,status,total:total_amount").eq("school_id", schoolId),
        supabase.from("school_memberships").select("id").eq("school_id", schoolId),
        supabase.from("user_roles").select("id").eq("school_id", schoolId).eq("role", "teacher"),
        supabase.from("student_marks").select("marks,assessment_id").eq("school_id", schoolId).not("marks", "is", null),
      ]);

      const students = studentsRes.data || [];
      const payments = paymentsRes.data || [];
      const expenses = expensesRes.data || [];
      const attendance = attendanceRes.data || [];
      const leads = leadsRes.data || [];
      const invoices = invoicesRes.data || [];
      const staff = staffRes.data || [];
      const teachers = teachersRes.data || [];
      const marks = marksRes.data || [];

      const totalStudents = students.length;
      const activeStudents = students.filter((s) => s.status === "enrolled" || s.status === "active").length;

      const mtdPayments = payments.filter((p) => new Date(p.paid_at) >= monthStart);
      const ytdPayments = payments.filter((p) => new Date(p.paid_at) >= yearStart);
      const revenueMtd = mtdPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const revenueYtd = ytdPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const mtdExpenses = expenses.filter((e) => new Date(e.expense_date) >= monthStart);
      const ytdExpenses = expenses.filter((e) => new Date(e.expense_date) >= yearStart);
      const expensesMtd = mtdExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const expensesYtd = ytdExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const profit = revenueMtd - expensesMtd;
      const profitMargin = revenueMtd > 0 ? Math.round((profit / revenueMtd) * 100) : 0;

      const totalAttendance = attendance.length;
      const presentCount = attendance.filter((a) => a.status === "present" || a.status === "late").length;
      const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

      const avgMark = marks.length > 0 ? marks.reduce((sum, m) => sum + Number(m.marks || 0), 0) / marks.length : 0;
      const academicIndex = Math.min(100, Math.round(avgMark));

      const openLeads = leads.filter((l) => l.status === "open" || !l.status).length;
      const wonLeads = leads.filter((l) => l.status === "won").length;
      const conversionRate = leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0;

      const inactiveStudents = students.filter((s) => s.status === "inactive" || s.status === "withdrawn").length;
      const dropoutRisk = Math.max(0, Math.round((inactiveStudents / Math.max(1, totalStudents)) * 100));

      const pendingInvoices = invoices.filter((i) => i.status === "pending" || i.status === "unpaid").length;
      const paidInvoices = invoices.filter((i) => i.status === "paid").length;
      const unpaidAmount = invoices.filter((i) => i.status !== "paid").reduce((sum, i) => sum + Number(i.total || 0), 0);
      const collectionRate = invoices.length > 0 ? Math.round((paidInvoices / invoices.length) * 100) : 0;

      return {
        totalStudents,
        activeStudents,
        revenueMtd,
        revenueYtd,
        expensesMtd,
        expensesYtd,
        profit,
        profitMargin,
        attendanceRate,
        academicIndex,
        openLeads,
        conversionRate,
        dropoutRisk,
        totalTeachers: teachers.length,
        totalStaff: staff.length,
        pendingInvoices,
        unpaidAmount,
        collectionRate,
      };
    },
    enabled: !!schoolId,
  });

  const suggestedQuestions = [
    { icon: TrendingUp, text: "Should I open a new campus based on current performance?", color: "text-emerald-600" },
    { icon: Coins, text: "Can I increase fees next year? What's the optimal percentage?", color: "text-amber-600" },
    { icon: Users, text: "Which departments are underperforming and need attention?", color: "text-blue-600" },
    { icon: AlertTriangle, text: "What are the biggest risks to my institution right now?", color: "text-red-600" },
    { icon: GraduationCap, text: "How can I improve my admission conversion rate?", color: "text-purple-600" },
    { icon: Building2, text: "Give me an executive summary of my institution's health", color: "text-primary" },
  ];

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (customQuery?: string) => {
    const messageToSend = customQuery || query;
    if (!messageToSend.trim() || isStreaming) return;

    const userMessage: Message = { role: "user", content: messageToSend };
    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setIsStreaming(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/owner-ai-advisor`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            message: messageToSend,
            schoolId,
            schoolData,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let textBuffer = "";

      // Add empty assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (err: any) {
      console.error("AI Advisor error:", err);
      toast.error(err.message || "Failed to get AI response");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I apologize, but I encountered an error processing your request. Please try again." },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" /> AI Strategy Advisor
        </h1>
        <p className="text-muted-foreground">
          Your digital board of directors - strategic insights powered by AI
        </p>
      </div>

      {/* Quick Stats Context */}
      {schoolData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Students</p>
            <p className="font-display text-lg font-bold">{schoolData.totalStudents}</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Profit Margin</p>
            <p className="font-display text-lg font-bold">{schoolData.profitMargin}%</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Attendance</p>
            <p className="font-display text-lg font-bold">{schoolData.attendanceRate}%</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Collection Rate</p>
            <p className="font-display text-lg font-bold">{schoolData.collectionRate}%</p>
          </div>
        </div>
      )}

      {/* Suggested Questions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suggestedQuestions.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q.text)}
            disabled={isStreaming}
            className="flex items-center gap-3 rounded-xl bg-muted/50 p-4 text-left hover:bg-muted transition-colors disabled:opacity-50"
          >
            <q.icon className={`h-5 w-5 shrink-0 ${q.color}`} />
            <span className="text-sm font-medium line-clamp-2">{q.text}</span>
          </button>
        ))}
      </div>

      {/* Chat Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Ask the Advisor
            {isStreaming && <Badge variant="secondary" className="ml-2">Thinking...</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] mb-4 rounded-xl bg-muted/30 p-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground max-w-sm">
                  Ask strategic questions about your institution. The AI will analyze your real-time data and provide actionable insights.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl p-4 ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground ml-8"
                        : "bg-background border mr-8"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{m.content || (isStreaming && idx === messages.length - 1 ? "..." : "")}</p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="flex gap-2">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a strategic question about your institution..."
              className="min-h-[56px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isStreaming}
            />
            <Button onClick={() => handleSend()} disabled={!query.trim() || isStreaming} className="shrink-0 h-14 w-14">
              {isStreaming ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
