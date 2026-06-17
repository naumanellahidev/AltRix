import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Brain,
  Send,
  X,
  Loader2,
  Printer,
  ArrowUpRight,
  Sparkles,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Trash2,
  Square,
  ChevronDown,
  Keyboard,
  RefreshCw,
  CreditCard,
  FileText,
  ClipboardList,
  ShieldAlert,
  BookOpen,
  Bell,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useUserRole } from "@/hooks/useUserRole";
import { generateVoucherPdf, type VoucherCopyData } from "@/lib/fee-voucher-pdf";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

// ── Types ────────────────────────────────────────────────────────────────────

type ActionPayload = {
  type: string;
  studentId?: string;
  invoiceId?: string;
  sectionId?: string;
  fromDate?: string;
  toDate?: string;
  examId?: string;
  route?: string;
  label?: string;
  // Generic API Action parameters
  method?: "POST" | "PATCH" | "DELETE" | "PUT";
  path?: string;
  payload?: Record<string, any>;
  // Write action parameters
  voucherId?: string;
  amount?: number;
  paymentMethod?: string;
  notes?: string;
  totalAmount?: number;
  dueDate?: string;
  classSectionId?: string;
  title?: string;
  description?: string;
  maxMarks?: number;
  content?: string;
  noteType?: string;
  entryDate?: string;
  targetRoles?: string[];
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  action?: ActionPayload;
  isError?: boolean;
};

const genId = () => Math.random().toString(36).slice(2, 9);

// ── Simple Markdown Renderer ─────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  if (!text) return "";
  
  let formatted = text;
  
  // Handle <think>...</think> block beautifully for reasoning models
  if (formatted.includes("<think>")) {
    if (formatted.includes("</think>")) {
      formatted = formatted.replace(
        /<think>([\s\S]*?)<\/think>/g,
        '<details class="mb-3 border border-slate-200 rounded-xl bg-slate-50/50 overflow-hidden"><summary class="px-3 py-2 text-[10px] font-semibold text-slate-500 cursor-pointer hover:bg-slate-100 select-none flex items-center gap-1.5">🧠 Thought Process (click to expand)</summary><div class="px-3 pb-3 pt-1 text-[11px] text-slate-500 border-t border-slate-100 bg-white/50 whitespace-pre-wrap leading-relaxed">$1</div></details>'
      );
    } else {
      // Still thinking (unclosed tag during streaming)
      const parts = formatted.split("<think>");
      const beforeThink = parts[0];
      const thinkingContent = parts[1] || "";
      formatted = beforeThink + `<details open class="mb-3 border border-slate-200 rounded-xl bg-slate-50/50 overflow-hidden"><summary class="px-3 py-2 text-[10px] font-semibold text-slate-500 cursor-pointer hover:bg-slate-100 select-none flex items-center gap-1.5">🧠 Thinking...</summary><div class="px-3 pb-3 pt-1 text-[11px] text-slate-500 border-t border-slate-100 bg-white/50 whitespace-pre-wrap leading-relaxed">${thinkingContent}</div></details>`;
    }
  }

  return formatted
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 text-primary px-1 rounded text-[10px]">$1</code>')
    // Bullet points
    .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc list-outside">$1</li>')
    // Numbered list
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-3 list-decimal list-outside">$1</li>')
    // Headers
    .replace(/^### (.+)$/gm, '<p class="font-bold text-primary mt-2 mb-1 text-[11px] uppercase tracking-wide">$1</p>')
    .replace(/^## (.+)$/gm, '<p class="font-bold text-slate-800 mt-2 mb-1 text-[12px]">$1</p>')
    .replace(/^# (.+)$/gm, '<p class="font-bold text-slate-900 mt-2 mb-1 text-[13px]">$1</p>')
    // Newlines
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// ── Typing Dots Animation ────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-primary"
          style={{
            animation: "copilot-dot 1.2s infinite ease-in-out",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}

// ── Action Card Map ──────────────────────────────────────────────────────────

const ACTION_META: Record<string, { icon: any; label: string; cta: string; color: string }> = {
  GENERATE_VOUCHER: {
    icon: Printer,
    label: "Fee Voucher Generator",
    cta: "Download PDF Voucher",
    color: "from-purple-600/20 to-indigo-600/20 border-purple-500/30",
  },
  GENERATE_RESULT_CARD: {
    icon: ArrowUpRight,
    label: "Result Card Generator",
    cta: "Open Result Card Module",
    color: "from-blue-600/20 to-cyan-600/20 border-blue-500/30",
  },
  EXPORT_ATTENDANCE: {
    icon: ArrowUpRight,
    label: "Attendance Analytics",
    cta: "Open Attendance Reports",
    color: "from-emerald-600/20 to-teal-600/20 border-emerald-500/30",
  },
  EXPORT_GRADES: {
    icon: ArrowUpRight,
    label: "Grades Analytics",
    cta: "Open Grades Reports",
    color: "from-amber-600/20 to-orange-600/20 border-amber-500/30",
  },
  NAVIGATE_TO: {
    icon: ArrowUpRight,
    label: "Navigate to Module",
    cta: "Go There",
    color: "from-slate-600/20 to-zinc-600/20 border-zinc-500/30",
  },
  RECORD_PAYMENT: {
    icon: CreditCard,
    label: "Record Payment in System",
    cta: "Record Payment",
    color: "from-emerald-600/20 to-green-600/20 border-emerald-500/30",
  },
  CREATE_INVOICE: {
    icon: FileText,
    label: "Generate Fee Invoice",
    cta: "Create Invoice",
    color: "from-blue-600/20 to-indigo-600/20 border-blue-500/30",
  },
  CREATE_ASSIGNMENT: {
    icon: ClipboardList,
    label: "Create Homework Assignment",
    cta: "Publish Assignment",
    color: "from-purple-600/20 to-pink-600/20 border-purple-500/30",
  },
  CREATE_BEHAVIOR_NOTE: {
    icon: ShieldAlert,
    label: "Save Behavior Note",
    cta: "Save Note",
    color: "from-rose-600/20 to-red-600/20 border-rose-500/30",
  },
  CREATE_DIARY_ENTRY: {
    icon: BookOpen,
    label: "Save Diary Entry",
    cta: "Save Entry",
    color: "from-amber-600/20 to-yellow-600/20 border-amber-500/30",
  },
  CREATE_NOTICE: {
    icon: Bell,
    label: "Publish Notice",
    cta: "Publish Notice",
    color: "from-cyan-600/20 to-sky-600/20 border-cyan-500/30",
  },
  API_ACTION: {
    icon: Zap,
    label: "Execute Action",
    cta: "Execute",
    color: "from-violet-600/20 to-purple-600/20 border-violet-500/30",
  },
};

// ── Role Suggestions ─────────────────────────────────────────────────────────

const ROLE_SUGGESTIONS: Record<string, string[]> = {
  super_admin: [
    "Show overall revenue summary",
    "Attendance trends this month",
    "How many pending admissions?",
    "Compare all campuses",
  ],
  school_owner: [
    "Show revenue vs expenses",
    "Attendance trends",
    "Outstanding fee defaulters",
    "Pending admission applications",
  ],
  principal: [
    "Show top 5 fee defaulters",
    "Which students are at risk?",
    "Class attendance rate today",
    "Show top performers",
  ],
  vice_principal: [
    "Weak students this term",
    "Top performers by class",
    "Attendance trends",
  ],
  accountant: [
    "Show unpaid invoice summary",
    "List top fee defaulters",
    "What is MTD revenue?",
    "Show pending invoices",
  ],
  hr_manager: [
    "Show active staff directory",
    "Recent leave requests",
    "Staff pending approvals",
  ],
  teacher: [
    "Show my assigned classes",
    "Find weak students in my sections",
    "Attendance trends for my classes",
  ],
  parent: [
    "Show my child's attendance",
    "Any outstanding fee invoices?",
    "Recent exam marks",
  ],
  student: ["Show my attendance rate", "My recent exam grades"],
};

// ── Storage Key ──────────────────────────────────────────────────────────────

const getStorageKey = (schoolId: string | null | undefined, userId: string | undefined) =>
  `altrix_copilot_history_${schoolId}_${userId}`;

// ── Main Component ───────────────────────────────────────────────────────────

export default function AltrixCopilot() {
  const { schoolSlug: paramSlug } = useParams<{ schoolSlug: string }>();
  const location = useLocation();
  const schoolSlug = useMemo(() => {
    if (paramSlug) return paramSlug;
    const parts = location.pathname.split("/").filter(Boolean);
    const first = parts[0];
    if (!first || ["super_admin", "auth", "reset-password", "platform"].includes(first)) return "";
    return first;
  }, [paramSlug, location.pathname]);
  const navigate = useNavigate();
  const { user } = useSession();
  const tenant = useTenantOptimized(schoolSlug || "");
  const schoolId = tenant.schoolId;
  const { primaryRole } = useUserRole(schoolId, user?.id ?? null);

  const getRolePathSegment = (role: string | null) => {
    if (!role) return "";
    if (role === "hr_manager") return "hr";
    if (role === "marketing_staff") return "marketing";
    return role;
  };

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const storageKey = getStorageKey(schoolId, user?.id);

  // ── Fetch AI Settings ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const params = schoolId ? `?school_id=${encodeURIComponent(schoolId)}` : "";
    apiClient
      .get<{ enabled: boolean }>(`/ai/settings${params}`)
      .then((res) => setAiEnabled(res.data.enabled))
      .catch(() => {});
  }, [user, schoolId]);

  // ── Restore Chat History ──────────────────────────────────────────────────
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setMessages(
          parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
        );
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  // ── Persist History ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!storageKey || messages.length === 0) return;
    try {
      // Store last 40 messages only
      localStorage.setItem(
        storageKey,
        JSON.stringify(messages.slice(-40))
      );
    } catch {
      /* quota exceeded – ignore */
    }
  }, [messages, storageKey]);

  // ── Scroll to Bottom ──────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 80);
  };

  // ── Welcome Message ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: genId(),
          role: "assistant",
          content: `👋 Hi! I'm your **AltRix AI Copilot** — deeply connected to your ERP.\n\nI can help you:\n- 📊 Analyze fee collection & defaulters\n- 👥 Monitor student attendance & performance\n- 📋 Generate official reports & vouchers\n- 🧭 Navigate any ERP module\n\nWhat would you like to know?`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [isOpen]);

  // ── Open via Keyboard Shortcut ────────────────────────────────────────────
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if ((e.altKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [isOpen]);

  // ── Focus input on open ───────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // ── Suggestions ───────────────────────────────────────────────────────────
  const suggestions = useMemo(
    () => (primaryRole ? ROLE_SUGGESTIONS[primaryRole] || [] : []),
    [primaryRole]
  );

  if (!aiEnabled) return null;

  // ── Parse Action Tag ──────────────────────────────────────────────────────
  const parseMessageContent = (text: string): { content: string; action?: ActionPayload } => {
    const tagRegex = /<altrix_action>([\s\S]*?)<\/altrix_action>/i;
    const match = text.match(tagRegex);
    if (match) {
      try {
        const actionData = JSON.parse(match[1].trim());
        return { content: text.replace(tagRegex, "").trim(), action: actionData };
      } catch {
        /* ignore bad JSON */
      }
    }
    return { content: text };
  };

  // ── Copy Message ──────────────────────────────────────────────────────────
  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // ── Clear Conversation ────────────────────────────────────────────────────
  const handleClear = () => {
    setMessages([]);
    if (storageKey) localStorage.removeItem(storageKey);
  };

  // ── Stop Streaming ────────────────────────────────────────────────────────
  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setIsThinking(false);
  };

  // ── Send Message ──────────────────────────────────────────────────────────
  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isStreaming) return;

    const userMsg: Message = {
      id: genId(),
      role: "user",
      content: textToSend,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);
    setIsStreaming(true);

    abortRef.current = new AbortController();

    try {
      const history = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || "";

      const response = await fetch(
        `${apiClient.defaults.baseURL || "/api"}/ai/copilot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-School-Id": schoolId || "",
          },
          body: JSON.stringify({ message: textToSend, history }),
          signal: abortRef.current.signal,
        }
      );

      setIsThinking(false);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Error ${response.status}`);
      }
      if (!response.body) throw new Error("No response stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      const assistantId = genId();

      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", timestamp: new Date() },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.trim().startsWith("data: ")) continue;
          const jsonStr = line.replace("data: ", "").trim();
          if (jsonStr === "[DONE]") break;
          try {
            const data = JSON.parse(jsonStr);
            if (data.error) {
              toast.error(data.error);
              assistantText += `\n\n⚠️ ${data.error}`;
            } else {
              assistantText += data.choices?.[0]?.delta?.content || "";
            }
            const parsed = parseMessageContent(assistantText);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: parsed.content, action: parsed.action }
                  : m
              )
            );
          } catch {
            /* partial JSON chunk */
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User stopped generation
        return;
      }
      console.error("Copilot stream error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          role: "assistant",
          content: `I couldn't reach the AI backend. Please check:\n- Is the backend server running?\n- Is the AI Copilot enabled in platform settings?\n\n_Error: ${err.message}_`,
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
    }
  };

  // ── Execute Action ────────────────────────────────────────────────────────
  const handleExecuteAction = async (msg: Message) => {
    if (!msg.action) return;
    const { type, invoiceId, route } = msg.action;

    if (type === "GENERATE_VOUCHER") {
      if (!invoiceId) return toast.error("Missing invoice ID in action context");
      const t = toast.loading("Generating PDF Voucher...");
      try {
        const { data: invoice, error: invErr } = await supabase
          .from("fee_invoices")
          .select("*, fee_invoice_items(*)")
          .eq("id", invoiceId)
          .single();
        if (invErr || !invoice) throw new Error("Invoice not found");

        const { data: student } = await supabase
          .from("students")
          .select("first_name, last_name, roll_number, student_code, parent_name, parent_phone")
          .eq("id", invoice.student_id)
          .single();

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

        const items = (invoice.fee_invoice_items || []).map((it: any) => ({
          label: it.label,
          amount: Number(it.amount),
        }));

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
            motto: school?.motto || null,
          },
          student: {
            name: `${student?.first_name || ""} ${student?.last_name || ""}`.trim(),
            rollNumber: student?.roll_number || null,
            studentCode: student?.student_code || null,
            className: "",
            sectionName: "",
            parentName: student?.parent_name || null,
            parentPhone: student?.parent_phone || null,
          },
          items,
          subtotal: items.reduce((s: number, i: any) => s + i.amount, 0),
          baseDiscount: 0,
          meritDiscount: 0,
          siblingDiscount: 0,
          total: invoice.total_amount,
          currency: "PKR",
          accentHsl: branding
            ? { h: branding.accent_hue || 35, s: branding.accent_saturation || 96, l: branding.accent_lightness || 178 }
            : null,
          notes: invoice.notes,
        };
        const doc = generateVoucherPdf(data);
        doc.save(`${invoice.invoice_number}_Voucher.pdf`);
        toast.success("Voucher downloaded!", { id: t });
      } catch (e: any) {
        toast.error(e.message || "Failed to generate voucher", { id: t });
      }
    } else if (type === "NAVIGATE_TO" && route) {
      // Ensure the route starts with the correct role prefix if it is role-guarded
      let finalRoute = route;
      const roleSegment = getRolePathSegment(primaryRole);
      if (roleSegment) {
        const isPrefixed = /^\/(teacher|hr|accountant|marketing|student|parent|school_owner|principal|vice_principal|school_admin|academic_coordinator)\b/.test(route);
        if (!isPrefixed) {
          finalRoute = `/${roleSegment}${route.startsWith('/') ? '' : '/'}${route}`;
        }
      }
      navigate(`/${schoolSlug}${finalRoute}`);
      setIsOpen(false);
    } else if (type === "GENERATE_RESULT_CARD") {
      const roleSegment = getRolePathSegment(primaryRole);
      navigate(`/${schoolSlug}/${roleSegment}/report-cards`);
      setIsOpen(false);
    } else if (type === "EXPORT_ATTENDANCE" || type === "EXPORT_GRADES") {
      const roleSegment = getRolePathSegment(primaryRole);
      navigate(`/${schoolSlug}/${roleSegment}/reports`);
      setIsOpen(false);
    } else if (type === "RECORD_PAYMENT") {
      if (!msg.action.studentId) return toast.error("Missing student ID in action context");
      if (msg.action.amount === undefined) return toast.error("Missing payment amount in action context");
      const t = toast.loading("Recording payment in system...");
      try {
        await apiClient.post("/finance/payments", {
          student_id: msg.action.studentId,
          voucher_id: msg.action.voucherId || msg.action.invoiceId || null,
          amount: Number(msg.action.amount),
          payment_date: new Date().toISOString().split('T')[0],
          payment_method: msg.action.paymentMethod || "cash",
          notes: msg.action.notes || ""
        });
        toast.success("Payment recorded successfully!", { id: t });
      } catch (err: any) {
        toast.error(err.response?.data?.detail || err.message || "Failed to record payment", { id: t });
      }
    } else if (type === "CREATE_INVOICE") {
      if (!msg.action.studentId) return toast.error("Missing student ID in action context");
      if (msg.action.totalAmount === undefined) return toast.error("Missing invoice amount in action context");
      const t = toast.loading("Generating fee invoice...");
      try {
        await apiClient.post("/finance/vouchers", {
          student_id: msg.action.studentId,
          month: new Date().toLocaleString('default', { month: 'long' }),
          academic_year: new Date().getFullYear().toString(),
          total_amount: Number(msg.action.totalAmount),
          discount_amount: 0,
          net_amount: Number(msg.action.totalAmount),
          due_date: msg.action.dueDate || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
          notes: msg.action.notes || ""
        });
        toast.success("Fee invoice generated successfully!", { id: t });
      } catch (err: any) {
        toast.error(err.response?.data?.detail || err.message || "Failed to generate fee invoice", { id: t });
      }
    } else if (type === "CREATE_ASSIGNMENT") {
      const classSectionId = msg.action.classSectionId || msg.action.sectionId;
      if (!classSectionId) return toast.error("Missing class section ID in action context");
      if (!msg.action.title) return toast.error("Missing assignment title in action context");
      const t = toast.loading("Creating homework assignment...");
      try {
        await apiClient.post("/assignments", {
          class_section_id: classSectionId,
          title: msg.action.title,
          description: msg.action.description || "",
          due_date: msg.action.dueDate || new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0],
          max_marks: msg.action.maxMarks !== undefined ? Number(msg.action.maxMarks) : 100
        });
        toast.success("Homework assignment created successfully!", { id: t });
      } catch (err: any) {
        toast.error(err.response?.data?.detail || err.message || "Failed to create assignment", { id: t });
      }
    } else if (type === "CREATE_BEHAVIOR_NOTE") {
      if (!msg.action.studentId) return toast.error("Missing student ID in action context");
      if (!msg.action.title) return toast.error("Missing note title in action context");
      const t = toast.loading("Saving behavior note...");
      try {
        await apiClient.post("/behavior", {
          student_id: msg.action.studentId,
          title: msg.action.title,
          content: msg.action.content || "",
          note_type: msg.action.noteType || "general",
          is_shared_with_parents: true
        });
        toast.success("Behavior note saved successfully!", { id: t });
      } catch (err: any) {
        toast.error(err.response?.data?.detail || err.message || "Failed to save behavior note", { id: t });
      }
    } else if (type === "CREATE_DIARY_ENTRY") {
      const classSectionId = msg.action.classSectionId || msg.action.sectionId;
      if (!classSectionId) return toast.error("Missing class section ID in action context");
      if (!msg.action.title) return toast.error("Missing diary title in action context");
      const t = toast.loading("Saving diary entry...");
      try {
        await apiClient.post("/diary", {
          class_section_id: classSectionId,
          title: msg.action.title,
          content: msg.action.content || "",
          entry_date: msg.action.entryDate || new Date().toISOString().split('T')[0]
        });
        toast.success("Diary entry saved successfully!", { id: t });
      } catch (err: any) {
        toast.error(err.response?.data?.detail || err.message || "Failed to save diary entry", { id: t });
      }
    } else if (type === "CREATE_NOTICE") {
      if (!msg.action.title) return toast.error("Missing notice title in action context");
      const t = toast.loading("Publishing notice...");
      try {
        await apiClient.post("/notices", {
          title: msg.action.title,
          content: msg.action.content || "",
          notice_type: "general",
          target_roles: msg.action.targetRoles || ["parent", "teacher", "student"]
        });
        toast.success("Notice published successfully!", { id: t });
      } catch (err: any) {
        toast.error(err.response?.data?.detail || err.message || "Failed to publish notice", { id: t });
      }
    } else if (type === "API_ACTION" || (msg.action.method && msg.action.path)) {
      const method = msg.action.method;
      const path = msg.action.path;
      if (!method || !path) {
        return toast.error("Missing method or path in action context");
      }
      const t = toast.loading(`Executing: ${msg.action.label || "Action"}...`);
      try {
        await apiClient.post("/ai/execute", {
          method,
          path,
          payload: msg.action.payload || {}
        });
        toast.success(`${msg.action.label || "Action"} completed successfully!`, { id: t });
      } catch (err: any) {
        toast.error(err.response?.data?.detail || err.message || "Action failed", { id: t });
      }
    }
  };

  // ── Panel Dimensions ──────────────────────────────────────────────────────
  const panelClass = isExpanded
    ? "fixed inset-4 sm:inset-6 z-[60]"
    : "fixed bottom-24 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-96 max-h-[75vh] sm:max-h-[600px] z-50";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Inject CSS keyframes */}
      <style>{`
        @keyframes copilot-dot {
          0%, 80%, 100% { opacity: 0; transform: scale(0.5); }
          40% { opacity: 1; transform: scale(1); }
        }
        @keyframes copilot-pulse-ring {
          0% { transform: scale(1); opacity: 0.7; }
          70% { transform: scale(1.22); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes copilot-slide-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .copilot-panel {
          animation: copilot-slide-up 0.22s ease-out both;
        }
        .copilot-pulse-ring {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 9999px;
          background: hsl(var(--primary));
          animation: copilot-pulse-ring 2.2s infinite ease-out;
          z-index: -1;
        }
        .copilot-msg-content strong { font-weight: 700; }
        .copilot-msg-content em { font-style: italic; }
        .copilot-msg-content li { margin: 2px 0; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ── Floating Button ──────────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {!isOpen && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
            <span className="bg-white/95 backdrop-blur text-slate-700 text-[10px] font-medium px-2.5 py-1 rounded-full border border-slate-200 shadow-sm whitespace-nowrap">
              <Keyboard className="inline h-3 w-3 mr-1 text-primary" />
              Alt+K
            </span>
          </div>
        )}

        <button
          id="altrix-copilot-btn"
          onClick={() => setIsOpen((o) => !o)}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-[0_8px_30px_hsl(var(--primary)/0.35)] transition-all duration-300 hover:scale-110 hover:shadow-[0_8px_35px_hsl(var(--primary)/0.6)] cursor-pointer active:scale-95 border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Toggle AI Copilot (Alt+K)"
          title="AltRix AI Copilot — Alt+K"
        >
          <div className="copilot-pulse-ring" />
          {isOpen ? (
            <X className="h-6 w-6 text-primary-foreground" />
          ) : (
            <Brain className="h-6 w-6 text-primary-foreground" />
          )}
        </button>
      </div>

      {/* ── Chat Panel ───────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className={`${panelClass} rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.15)] flex flex-col overflow-hidden copilot-panel`}
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-white via-blue-50/50 to-white px-4 py-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm">
                <Sparkles className="h-4 w-4 text-white" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 leading-none tracking-tight">
                  AltRix Copilot
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 capitalize">
                  {primaryRole?.replace(/_/g, " ")} · ERP Connected
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 1 && (
                <button
                  onClick={handleClear}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Clear conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsExpanded((e) => !e)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* ── Messages ───────────────────────────────────────────────── */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4 no-scrollbar"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                {/* Avatar */}
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="h-5 w-5 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                      <Brain className="h-3 w-3 text-white" />
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">AltRix AI</span>
                    <span className="text-[10px] text-slate-400">
                      {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}

                {/* Bubble */}
                <div
                  className={`group relative max-w-[88%] rounded-2xl px-3 py-2.5 text-[12px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-br-sm shadow-md"
                      : msg.isError
                      ? "bg-rose-50 text-rose-800 border border-rose-200 rounded-bl-sm"
                      : "bg-slate-50 text-slate-800 border border-slate-200/60 rounded-bl-sm shadow-sm"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  ) : (
                    <div
                      className="copilot-msg-content whitespace-normal break-words leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  )}

                  {/* Copy button */}
                  {msg.content && (
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-slate-700 transition-all cursor-pointer shadow-sm"
                      title="Copy"
                    >
                      {copiedId === msg.id ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  )}

                  {/* Action Card */}
                  {msg.action && (() => {
                    const meta = ACTION_META[msg.action.type] || ACTION_META["API_ACTION"];
                    const Icon = meta.icon;
                    return (
                      <div className={`mt-3 rounded-xl bg-gradient-to-br ${meta.color} border p-3 flex flex-col gap-2`}>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                          <Icon className="h-3.5 w-3.5" />
                          <span>{msg.action.label || meta.label}</span>
                        </div>
                        <button
                          onClick={() => handleExecuteAction(msg)}
                          className="w-full text-center bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold rounded-lg py-1.5 px-3 transition-colors cursor-pointer border border-slate-200 shadow-sm"
                        >
                          {meta.cta}
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Timestamp for user */}
                {msg.role === "user" && (
                  <span className="text-[9px] text-slate-400 mt-1 mr-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            ))}

            {/* Thinking/streaming indicator */}
            {isThinking && (
              <div className="flex items-start gap-2">
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="h-3 w-3 text-white" />
                </div>
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1.5 shadow-sm">
                  <span className="text-[11px] text-slate-500 italic">Analyzing ERP data</span>
                  <TypingDots />
                </div>
              </div>
            )}
          </div>

          {/* Scroll to bottom button */}
          {showScrollBtn && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2.5 py-1 text-[10px] text-slate-600 shadow-md cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <ChevronDown className="h-3 w-3" />
              Scroll to bottom
            </button>
          )}

          {/* ── Suggestions ────────────────────────────────────────────── */}
          {!isStreaming && !isThinking && suggestions.length > 0 && (
            <div className="px-3 py-2 border-t border-slate-100 bg-white flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s)}
                  className="rounded-full bg-slate-50 border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 text-slate-600 hover:text-blue-600 text-[10px] px-3 py-1 font-medium transition-all cursor-pointer active:scale-95 whitespace-nowrap flex-shrink-0"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* ── Input Area ─────────────────────────────────────────────── */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 py-2.5 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isStreaming ? "Generating response..." : "Ask AltRix Copilot…"}
              disabled={isStreaming}
              className="flex-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-[12px] px-3.5 py-2 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/60 transition-shadow disabled:opacity-50"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center justify-center h-9 w-9 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border-0 cursor-pointer shrink-0 transition-colors"
                title="Stop generation"
              >
                <Square className="h-3.5 w-3.5 fill-white" />
              </button>
            ) : (
              <Button
                type="submit"
                disabled={!input.trim()}
                size="icon"
                className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0 cursor-pointer flex-shrink-0 shadow-sm"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </form>

          {/* ── Footer Branding ─────────────────────────────────────────── */}
          <div className="text-center py-1.5 bg-slate-50 border-t border-slate-100">
            <p className="text-[9px] text-slate-400 font-medium tracking-wider uppercase">
              AltRix AI · Powered by Qwen &amp; DeepSeek R1
            </p>
          </div>
        </div>
      )}
    </>
  );
}
