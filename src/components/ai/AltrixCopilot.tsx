import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  Brain, Send, X, MessageSquare, Loader2, Download, Printer, 
  ArrowUpRight, AlertTriangle, CheckCircle, RefreshCw, Sparkles 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useUserRole } from "@/hooks/useUserRole";
import { generateVoucherPdf, type VoucherCopyData } from "@/lib/fee-voucher-pdf";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

type Message = {
  role: "user" | "assistant";
  content: string;
  action?: {
    type: string;
    studentId?: string;
    invoiceId?: string;
    sectionId?: string;
    fromDate?: string;
    toDate?: string;
    examId?: string;
  };
};

export default function AltrixCopilot() {
  const { schoolSlug } = useParams<{ schoolSlug: string }>();
  const navigate = useNavigate();
  const { user } = useSession();
  const tenant = useTenantOptimized(schoolSlug || "");
  const schoolId = tenant.schoolId;
  const { roles, primaryRole } = useUserRole(schoolId, user?.id ?? null);

  const [isOpen, setIsOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Fetch System Settings on Mount
  useEffect(() => {
    const checkAiStatus = async () => {
      try {
        const res = await apiClient.get<{ enabled: boolean }>("/ai/settings");
        setAiEnabled(res.data.enabled);
      } catch (err) {
        console.error("Failed to fetch AI status settings:", err);
      }
    };
    if (user) {
      checkAiStatus();
    }
  }, [user]);

  // Scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Load welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: `Hello! I am your AltRix Enterprise AI Copilot. How can I assist you in managing your school ERP today?`
        }
      ]);
    }
  }, [isOpen]);

  // 2. Predefined Suggestions based on Active User Role
  const suggestions = useMemo(() => {
    if (!primaryRole) return [];
    
    const roleBasedSuggestions: Record<string, string[]> = {
      super_admin: [
        "Show revenue summary",
        "Show attendance trends",
        "Show pending admissions",
        "Compare campus performance"
      ],
      school_owner: [
        "Show revenue summary",
        "Show attendance trends",
        "Show pending admissions",
        "Compare campus performance"
      ],
      principal: [
        "Show fee defaulters",
        "Show weak students",
        "Show top performers",
        "Show attendance trends"
      ],
      vice_principal: [
        "Show weak students",
        "Show top performers",
        "Show attendance trends"
      ],
      accountant: [
        "Show revenue summary",
        "Show fee defaulters",
        "Show pending invoices"
      ],
      hr_manager: [
        "Show active staff directory",
        "Show recent leave requests"
      ],
      teacher: [
        "Show my assigned classes",
        "Show attendance trends for my classes",
        "Find weak students in my sections"
      ],
      parent: [
        "Show my children attendance",
        "Check outstanding fee invoices",
        "Show recent exam marks"
      ],
      student: [
        "Show my attendance rate",
        "Show my recent exam grades"
      ]
    };

    return roleBasedSuggestions[primaryRole] || ["Explain ERP features", "Help me navigate"];
  }, [primaryRole]);

  if (!aiEnabled) return null;

  // Extract action tag if present: <altrix_action>JSON</altrix_action>
  const parseMessageContent = (text: string) => {
    const tagRegex = /<altrix_action>([\s\S]*?)<\/altrix_action>/i;
    const match = text.match(tagRegex);
    
    if (match) {
      try {
        const actionData = JSON.parse(match[1].trim());
        const cleanedText = text.replace(tagRegex, "").trim();
        return {
          content: cleanedText,
          action: actionData
        };
      } catch (e) {
        console.error("Failed to parse action json", e);
      }
    }
    
    return { content: text };
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isStreaming) return;

    // Add user message
    const userMsg: Message = { role: "user", content: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    setLoading(true);

    try {
      // Build conversation history
      const history = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call FastAPI Copilot Chat
      const response = await fetch(`${apiClient.defaults.baseURL || "/api"}/ai/copilot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
          "X-School-Id": schoolId || ""
        },
        body: JSON.stringify({
          message: textToSend,
          history: history
        })
      });

      setLoading(false);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Request failed with status ${response.status}`);
      }

      if (!response.body) throw new Error("No response stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      
      // Add empty message for streaming
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.trim().startsWith("data: ")) {
            const jsonStr = line.replace("data: ", "").trim();
            if (jsonStr === "[DONE]") break;
            
            try {
              const data = JSON.parse(jsonStr);
              if (data.error) {
                toast.error(data.error);
                assistantText += `\n\n[Error: ${data.error}]`;
              } else {
                const textChunk = data.choices?.[0]?.delta?.content || "";
                assistantText += textChunk;
              }

              // Update the last assistant message
              setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.role === "assistant") {
                  const parsed = parseMessageContent(assistantText);
                  last.content = parsed.content;
                  last.action = parsed.action;
                }
                return copy;
              });
            } catch (e) {
              // incomplete JSON lines can happen, wait for next buffer
            }
          }
        }
      }

    } catch (err: any) {
      console.error("Copilot stream error:", err);
      toast.error(err.message || "Failed to stream Copilot completion.");
      setMessages(prev => [
        ...prev,
        { 
          role: "assistant", 
          content: "I apologize, but I encountered an error communicating with the local Ollama backend service. Please check your connection." 
        }
      ]);
    } finally {
      setIsStreaming(false);
      setLoading(false);
    }
  };

  // 3. Action Tag Handlers
  const handleExecuteAction = async (msg: Message) => {
    if (!msg.action) return;
    const { type, studentId, invoiceId, sectionId, fromDate, toDate, examId } = msg.action;

    if (type === "GENERATE_VOUCHER") {
      if (!invoiceId) return toast.error("Missing invoice context");
      const loadingToast = toast.loading("Fetching invoice data and generating PDF...");
      try {
        // Fetch invoice with items
        const { data: invoice, error: invErr } = await supabase
          .from("fee_invoices")
          .select("*, fee_invoice_items(*)")
          .eq("id", invoiceId)
          .single();

        if (invErr || !invoice) throw new Error("Invoice not found in system.");

        // Fetch student
        const { data: student, error: stdErr } = await supabase
          .from("students")
          .select("first_name, last_name, roll_number, student_code, parent_name, parent_phone")
          .eq("id", invoice.student_id)
          .single();

        if (stdErr || !student) throw new Error("Student not found.");

        // Fetch school meta details
        const { data: school } = await supabase
          .from("schools")
          .select("*")
          .eq("id", schoolId!)
          .single();

        const { data: branding } = await supabase
          .from("school_branding")
          .select("*")
          .eq("school_id", schoolId!)
          .maybeSingle();

        const HslColor = branding ? { h: branding.accent_hue || 35, s: branding.accent_saturation || 96, l: branding.accent_lightness || 178 } : null;

        // Build Voucher Data
        const items = (invoice.fee_invoice_items || []).map((it: any) => ({
          label: it.label,
          amount: Number(it.amount)
        }));

        const subtotal = items.reduce((s: number, i: any) => s + i.amount, 0);

        const data: VoucherCopyData = {
          invoiceNumber: invoice.invoice_number,
          issueDate: invoice.created_at.slice(0, 10),
          dueDate: invoice.due_date,
          school: {
            name: school?.name || "School",
            address: school?.address || null,
            phone: school?.phone || null,
            email: school?.email || null,
            website: school?.website || null,
            logoUrl: school?.logo_url || null,
            motto: school?.motto || null
          },
          student: {
            name: `${student.first_name} ${student.last_name || ""}`.trim(),
            rollNumber: student.roll_number || null,
            studentCode: student.student_code || null,
            className: "Class Context",
            sectionName: "Section Context",
            parentName: student.parent_name || null,
            parentPhone: student.parent_phone || null
          },
          items,
          subtotal,
          baseDiscount: 0,
          meritDiscount: 0,
          siblingDiscount: 0,
          total: invoice.total_amount,
          currency: "PKR",
          accentHsl: HslColor,
          notes: invoice.notes
        };

        const doc = generateVoucherPdf(data);
        doc.save(`${invoice.invoice_number}_Voucher.pdf`);
        toast.success("Fee Voucher generated and downloaded successfully!", { id: loadingToast });
      } catch (e: any) {
        console.error("Voucher PDF download error:", e);
        toast.error(e.message || "Failed to generate PDF voucher.", { id: loadingToast });
      }
    } 
    
    else if (type === "GENERATE_RESULT_CARD") {
      // Navigate to Report Card Module where the layout is ready
      navigate(`/${schoolSlug}/${primaryRole}/report-cards`);
      setIsOpen(false);
      toast.info("Navigated to Report Cards. Prefill the parameters to print the card.");
    } 
    
    else if (type === "EXPORT_ATTENDANCE") {
      // Navigate to Reports Module and run
      navigate(`/${schoolSlug}/${primaryRole}/reports`);
      setIsOpen(false);
      toast.info("Navigated to Attendance Reports dashboard.");
    } 
    
    else if (type === "EXPORT_GRADES") {
      // Navigate to Grades Reports
      navigate(`/${schoolSlug}/${primaryRole}/reports`);
      setIsOpen(false);
      toast.info("Navigated to Grades Reports dashboard.");
    }
  };

  return (
    <>
      {/* Floating Copilot Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 shadow-[0_8px_30px_rgb(124,58,237,0.3)] transition-all duration-300 hover:scale-105 hover:shadow-[0_8px_30px_rgb(124,58,237,0.6)] cursor-pointer active:scale-95 group border-0 focus:outline-none"
        aria-label="Toggle AI Copilot"
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes glow-ring {
            0% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.15); opacity: 0.3; }
            100% { transform: scale(1); opacity: 0.8; }
          }
          .pulse-glow {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 100%;
            background: inherit;
            z-index: -1;
            animation: glow-ring 2.5s infinite ease-in-out;
          }
        `}} />
        <div className="pulse-glow" />
        <Brain className="h-6 w-6 text-white group-hover:rotate-6 transition-transform" />
      </button>

      {/* AI Panel Slider */}
      {isOpen && (
        <div 
          className="fixed bottom-24 right-6 w-96 h-[560px] z-50 rounded-3xl border border-zinc-800 bg-zinc-950 shadow-[0_10px_50px_rgba(0,0,0,0.65)] flex flex-col overflow-hidden backdrop-blur-xl animate-in slide-in-from-bottom-6 fade-in duration-200"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-purple-500/10 p-2 border border-purple-500/20">
                <Sparkles className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white flex items-center gap-1.5 leading-none">
                  AltRix Copilot
                </p>
                <p className="text-[10px] text-zinc-400 mt-1 capitalize font-medium">
                  Active Role: {primaryRole?.replace("_", " ")}
                </p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Conversation History Area */}
          <ScrollArea className="flex-1 p-4 bg-zinc-950/40">
            <div ref={scrollRef} className="space-y-4 max-h-[380px] overflow-y-auto pr-2 no-scrollbar">
              {messages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div 
                    className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                      msg.role === "user" 
                        ? "bg-purple-600 text-white rounded-br-none" 
                        : "bg-zinc-900 text-zinc-200 border border-zinc-800/80 rounded-bl-none"
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.content}</p>
                    
                    {/* Render Action Interceptor Card */}
                    {msg.action && (
                      <div className="mt-3 rounded-xl border border-purple-500/20 bg-purple-500/5 p-2.5 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-purple-300 font-semibold text-[11px]">
                          {msg.action.type === "GENERATE_VOUCHER" ? <Printer className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                          <span>
                            {msg.action.type === "GENERATE_VOUCHER" && "Official Fee Voucher Generator"}
                            {msg.action.type === "GENERATE_RESULT_CARD" && "Official Result Card Generator"}
                            {msg.action.type === "EXPORT_ATTENDANCE" && "Attendance Reports Dashboard"}
                            {msg.action.type === "EXPORT_GRADES" && "Grades Reports Dashboard"}
                          </span>
                        </div>
                        <Button 
                          onClick={() => handleExecuteAction(msg)}
                          size="sm"
                          className="w-full bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold rounded-lg py-1 h-7 border-0 cursor-pointer"
                        >
                          {msg.action.type === "GENERATE_VOUCHER" && "Download Official PDF"}
                          {msg.action.type === "GENERATE_RESULT_CARD" && "Open Generator Layout"}
                          {msg.action.type === "EXPORT_ATTENDANCE" && "Open Attendance Analytics"}
                          {msg.action.type === "EXPORT_GRADES" && "Open Grades Analytics"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-2 text-zinc-500 pl-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-[10px] italic">Fetching live ERP records...</span>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Quick Suggestions Chips */}
          {messages.length > 0 && !isStreaming && !loading && (
            <div className="px-4 py-2 border-t border-zinc-900 bg-zinc-950 flex gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSend(suggestion)}
                  className="rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-[10px] px-3 py-1 font-semibold transition-all cursor-pointer active:scale-95 whitespace-nowrap flex-shrink-0"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Text Input Panel */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
            className="p-3 border-t border-zinc-800 bg-zinc-950 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isStreaming ? "Streaming response..." : "Ask AltRix Copilot..."}
              disabled={isStreaming}
              className="flex-1 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs px-3.5 py-2.5 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500/50"
            />
            <Button
              type="submit"
              disabled={isStreaming || !input.trim()}
              size="icon"
              className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white w-9 h-9 border-0 cursor-pointer flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
