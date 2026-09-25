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
  Paperclip,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useUserRole } from "@/hooks/useUserRole";
import { generateVoucherPdf, prepareVoucherData, type VoucherCopyData, voucherFileName } from "@/lib/fee-voucher-pdf";
import { lateFeeTerms, loadSchoolVoucherMeta, voucherStatusFor } from "@/lib/voucher-data";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { renderMarkdown } from "@/lib/copilot-markdown";
import { apiClient } from "@/lib/api-client";
import { useActiveCampus } from "@/hooks/useActiveCampus";
import { useActiveChild } from "@/context/ActiveChildContext";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  CartesianGrid,
} from "recharts";

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
  cta?: string;
  execute?: boolean;
  auto_execute?: boolean;
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

type ChartPayload = {
  type: "bar" | "line" | "pie";
  title: string;
  xKey: string;
  yKeys: string[];
  data: Record<string, any>[];
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  action?: ActionPayload;
  actions?: ActionPayload[];
  chart?: ChartPayload;
  fileAttachment?: { name: string; size: number };
  isError?: boolean;
  /** When the figures in this answer were read, and from which tables. */
  asOf?: string;
  tables?: string[];
  /** The question it answered, so it can be asked again. */
  question?: string;
  /** The data behind it has changed since it was read. */
  stale?: boolean;
};

/** The most a file can contribute: the model on the server reads about sixty
 * tokens a second, so four thousand characters is already a long wait. */
const ATTACHMENT_LIMIT = 4000;

/** How long to wait for the first word before saying the model is not answering. */
const FIRST_WORD_TIMEOUT_MS = 90_000;

/** What went wrong, in words the reader can act on. */
function describeFailure(status: number | null, detail: string): string {
  if (status === 403) return detail || "You do not have access to the Copilot for this school.";
  if (status === 429) return "Too many requests at once. Wait a few seconds and ask again.";
  if (status === 400) return detail || "That question could not be sent.";
  if (status && status >= 500) return `The server could not answer (error ${status}). Please try again in a moment.`;
  if (status === null) return detail || "Could not reach the server. Check the connection and try again.";
  return detail || `The request failed (error ${status}).`;
}

const genId = () => Math.random().toString(36).slice(2, 9);

// ── Simple Markdown Renderer ─────────────────────────────────────────────────

const routeNames = [
  "academic", "timetable", "attendance", "exams", "report-cards", "diary",
  "users", "staff-attendance", "leaves", "salaries", "contracts", "reviews",
  "documents", "recruitment", "onboarding", "offboarding", "hr-analytics",
  "admissions", "crm", "leads", "follow-ups", "calls", "sources",
  "campaigns", "inquiries", "finance", "fees", "invoices", "payments",
  "expenses", "payroll", "ledger", "vendors", "tax", "budget-simulator",
  "complaints", "parent-notes", "counseling", "attendance-heatmap",
  "reports", "notices", "holidays", "ai-counselor", "messages",
  "collaboration", "support", "at-risk", "behavior", "student-cards",
  "admin", "schools", "students", "directory", "transport", "library",
  "assignments", "lesson-plans", "branding", "settings"
];

const getRouteLabel = (route: string): string => {
  const clean = route.toLowerCase();
  
  if (clean.includes("report-cards") || clean.includes("report_cards")) return "Report Cards";
  if (clean.includes("staff-attendance") || clean.includes("staff_attendance")) return "Staff Attendance";
  if (clean.includes("hr-analytics") || clean.includes("hr_analytics")) return "HR Analytics";
  if (clean.includes("follow-ups") || clean.includes("follow_ups")) return "Follow-ups";
  if (clean.includes("budget-simulator") || clean.includes("budget_simulator")) return "Budget Simulator";
  if (clean.includes("attendance-heatmap") || clean.includes("attendance_heatmap")) return "Attendance Heatmap";
  if (clean.includes("ai-counselor") || clean.includes("ai_counselor")) return "AI Counselor";
  if (clean.includes("student-cards") || clean.includes("student_cards")) return "Student ID Cards";
  if (clean.includes("parent-notes") || clean.includes("parent_notes")) return "Parent Notes";
  
  if (clean.includes("transport") || clean.includes("routes") || clean.includes("vehicles") || clean.includes("fleet")) return "Transport & Fleet";
  if (clean.includes("library") || clean.includes("books")) return "Library & Books";
  if (clean.includes("assignments") || clean.includes("homework")) return "Assignments Hub";
  if (clean.includes("directory")) return "Student Directory";
  if (clean.includes("invoices")) return "Invoices";
  if (clean.includes("payments")) return "Payments";
  if (clean.includes("expenses")) return "Expenses";
  if (clean.includes("payroll")) return "Payroll";
  if (clean.includes("ledger")) return "Cash Ledger";
  if (clean.includes("vendors")) return "Vendors";
  if (clean.includes("tax")) return "Tax Center";
  if (clean.includes("fees")) return "Fees Center";
  if (clean.includes("finance")) return "Finance & Cashflow";
  if (clean.includes("academic")) return "Academics";
  if (clean.includes("timetable")) return "Timetable";
  if (clean.includes("attendance")) return "Attendance";
  if (clean.includes("exams")) return "Exams";
  if (clean.includes("diary")) return "Diary";
  if (clean.includes("users")) return "Staff Management";
  if (clean.includes("leaves")) return "Leaves";
  if (clean.includes("salaries")) return "Salaries";
  if (clean.includes("contracts")) return "Contracts";
  if (clean.includes("reviews")) return "Performance Reviews";
  if (clean.includes("documents")) return "Documents";
  if (clean.includes("recruitment")) return "Recruitment";
  if (clean.includes("onboarding")) return "Onboarding";
  if (clean.includes("offboarding")) return "Offboarding";
  if (clean.includes("admissions")) return "Admissions";
  if (clean.includes("crm")) return "CRM Dashboard";
  if (clean.includes("leads")) return "Leads";
  if (clean.includes("calls")) return "Call Logs";
  if (clean.includes("sources")) return "Lead Sources";
  if (clean.includes("campaigns")) return "Campaigns";
  if (clean.includes("inquiries")) return "Inquiries Center";
  if (clean.includes("complaints")) return "Complaints";
  if (clean.includes("counseling")) return "Counseling Center";
  if (clean.includes("reports")) return "Reports";
  if (clean.includes("notices")) return "Notices";
  if (clean.includes("holidays")) return "Holidays";
  if (clean.includes("messages")) return "Messages";
  if (clean.includes("collaboration")) return "Collaboration Hub";
  if (clean.includes("support")) return "Support";
  if (clean.includes("at-risk")) return "At-Risk Students";
  if (clean.includes("behavior")) return "Behavior Notes";
  if (clean.includes("admin")) return "Admin Console";
  if (clean.includes("schools")) return "Schools";
  if (clean.includes("students")) return "Students";
  
  // Format nicely if none matched
  const lastSegment = route.split("/").filter(Boolean).pop() || route;
  return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1).replace(/[-_]/g, " ");
};


const extractRoutesFromText = (text: string): string[] => {
  if (!text) return [];
  const matches: string[] = [];
  const routePattern = new RegExp(`\\/(${routeNames.join("|")})(\\/[a-zA-Z0-9_\\-]+)?\\b`, "g");
  let match;
  while ((match = routePattern.exec(text)) !== null) {
    matches.push(match[0]);
  }
  // Deduplicate
  return Array.from(new Set(matches));
};


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
};

// ── Role Suggestions ─────────────────────────────────────────────────────────

const ROLE_SUGGESTIONS: Record<string, string[]> = {
  super_admin: [
    "Show overall school performance",
    "Compare all campuses",
    "Show revenue summaries",
    "Top outstanding fee defaulters",
    "Today's staff turnout",
  ],
  school_owner: [
    "Show overall school performance",
    "Compare all campuses",
    "Show revenue summaries",
    "Top outstanding fee defaulters",
    "Today's staff turnout",
  ],
  principal: [
    "Show school analytics",
    "Show finance insights",
    "Class enrollment breakdown",
    "Today's staff attendance",
    "Recent complaints and notices",
  ],
  vice_principal: [
    "Show school analytics",
    "Exam schedule and trends",
    "Class enrollment breakdown",
    "Today's scheduled timetable",
  ],
  school_admin: [
    "Show overall school performance",
    "List top fee defaulters",
    "Class enrollment breakdown",
    "Recent notices and updates",
  ],
  accountant: [
    "Show unpaid invoice summary",
    "List top fee defaulters",
    "What is MTD revenue?",
    "Recent fee payments collected",
    "Operational expenses breakdown",
  ],
  hr_manager: [
    "Show active staff directory",
    "Today's staff attendance",
    "Recent leave requests",
    "Recent payroll and salary records",
  ],
  teacher: [
    "My assigned classes and subjects",
    "Class attendance rates",
    "Active homework and diary logs",
    "Exam performance & weak students",
    "My weekly lecture timetable",
  ],
  parent: [
    "Show my child's attendance",
    "Outstanding fee status",
    "Recent exam results and grades",
    "Active homework assignments",
    "Recent class diary entries",
  ],
  student: [
    "Show my attendance percentage",
    "My recent exam grades & results",
    "Active homework tasks",
    "Upcoming school holidays",
  ],
  marketing: [
    "Recent CRM leads overview",
    "Leads by stage breakdown",
    "Active marketing campaigns",
    "New admission applications",
  ],
  admissions_officer: [
    "Recent admission applications",
    "CRM leads pipeline",
    "Class vacancy details",
  ],
  counselor: [
    "Student wellbeing notes",
    "At-risk attendance alerts",
    "Recent behavior logs",
  ],
  librarian: [
    "Library catalog summary",
    "Issued books and overdue loans",
    "Pending library fines",
  ],
  transport_manager: [
    "Active bus routes overview",
    "Vehicle fleet status",
    "Driver contact roster",
  ],
  academic_coordinator: [
    "Exams and term schedules",
    "Teacher subject allocations",
    "Class grade distributions",
  ],
};

const getStorageKey = (schoolId: string | null | undefined, userId: string | undefined) =>
  `altrix_copilot_history_${schoolId}_${userId}`;

// ── Chart Renderer Component ──────────────────────────────────────────────────
function CopilotChart({ chart }: { chart: ChartPayload }) {
  if (!chart) return null;
  const { type, title, xKey, yKeys, data } = chart;
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  if (!xKey || !yKeys || !Array.isArray(yKeys)) return null;

  // Dynamic brand colors (primary, green, amber, red, indigo, pink, teal)
  const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#6366f1", "#ec4899", "#14b8a6"];

  const safeData = useMemo(() => {
    return data.filter(item => item && typeof item === "object");
  }, [data]);

  const renderChart = () => {
    if (type === "bar") {
      return (
        <BarChart data={safeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
          <RechartsTooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
          {yKeys.map((key, index) => (
            <Bar key={key} dataKey={key} fill={COLORS[index % COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      );
    }

    if (type === "line") {
      return (
        <LineChart data={safeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
          <RechartsTooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
          {yKeys.map((key, index) => (
            <Line key={key} type="monotone" dataKey={key} stroke={COLORS[index % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </LineChart>
      );
    }

    if (type === "pie") {
      return (
        <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <Pie
            data={safeData}
            dataKey={yKeys[0] || "value"}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            outerRadius={65}
            fill="hsl(var(--primary))"
            label={{ fontSize: 9 }}
          >
            {safeData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <RechartsTooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
        </PieChart>
      );
    }

    return null;
  };

  return (
    <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm">
      <h4 className="text-xs font-bold text-slate-800 mb-3 tracking-tight">{title}</h4>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart() || <div>No chart data</div>}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const getErrorMessage = (err: any, fallback: string): string => {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  
  const data = err.response?.data;
  if (data) {
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((d: any) => {
          const locStr = d.loc ? d.loc.filter((l: any) => l !== "body" && l !== "query").join(".") : "";
          return `${locStr ? locStr + ": " : ""}${d.msg || JSON.stringify(d)}`;
        })
        .join(", ");
    }
    if (typeof data.detail === "object" && data.detail !== null) {
      return data.detail.message || data.detail.error || JSON.stringify(data.detail);
    }
    if (typeof data.error === "string") return data.error;
    if (typeof data.error === "object" && data.error !== null) {
      return data.error.message || data.error.details || JSON.stringify(data.error);
    }
    return JSON.stringify(data);
  }
  
  if (err.message && typeof err.message === "string") return err.message;
  return fallback;
};

const isValidUuid = (id: any): boolean => {
  if (!id || typeof id !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

const camelToSnake = (str: string): string => {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase();
};

const sanitizePayload = (obj: any): any => {
  if (!obj || typeof obj !== "object") return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizePayload);
  }
  
  const newObj: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key);
    if (typeof val === "string") {
      const lowerVal = val.toLowerCase().trim();
      if (
        lowerVal === "none" ||
        lowerVal === "n/a" ||
        lowerVal === "null" ||
        lowerVal === "undefined" ||
        lowerVal.includes("uuid") ||
        lowerVal.includes("placeholder")
      ) {
        continue;
      } else {
        newObj[snakeKey] = val;
      }
    } else if (typeof val === "object" && val !== null) {
      newObj[snakeKey] = sanitizePayload(val);
    } else {
      newObj[snakeKey] = val;
    }
  }
  return newObj;
};

// ── Main Component ───────────────────────────────────────────────────────────

export default function AltrixCopilot() {
  const { schoolSlug: paramSlug } = useParams<{ schoolSlug: string }>();
  const location = useLocation();
  const schoolSlug = useMemo(() => {
    if (paramSlug) return paramSlug;
    const parts = location.pathname.split("/").filter(Boolean);
    const first = parts[0];
    if (!first || ["super_admin", "auth", "reset-password", "platform", "activate-account", "api", "assets"].includes(first)) return "";
    return first;
  }, [paramSlug, location.pathname]);
  const navigate = useNavigate();
  const { user } = useSession();
  const tenant = useTenantOptimized(schoolSlug || "");
  const schoolId = tenant.schoolId;
  const { primaryRole } = useUserRole(schoolId, user?.id ?? null);
  const activeCampusId = useActiveCampus(schoolId);
  const { activeChild } = useActiveChild();
  const activeStudentId = activeChild?.student_id || null;

  const getRolePathSegment = (role: string | null) => {
    if (!role) return "";
    if (role === "hr_manager") return "hr";
    if (role === "marketing_staff") return "marketing";
    return role;
  };

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [aiHealth, setAiHealth] = useState<{
    ready: boolean;
    provider: string;
    local_model: string | null;
    cloud: { name: string } | null;
  } | null>(null);
  const [aiEnabled, setAiEnabled] = useState(() => {
    const saved = localStorage.getItem("altrix_global_ai_enabled");
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    const handleGlobalAiChange = (e: Event) => {
      const customEv = e as CustomEvent<boolean>;
      if (typeof customEv.detail === "boolean") {
        setAiEnabled(customEv.detail);
      }
    };
    window.addEventListener("altrix:global-ai-changed", handleGlobalAiChange);
    return () => {
      window.removeEventListener("altrix:global-ai-changed", handleGlobalAiChange);
    };
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  // What the Copilot says it is doing ("Reading fee records…"), from the
  // server's status events, shown under the typing indicator.
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string; size: number } | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Advanced features states
  const [isRecording, setIsRecording] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Answers from the records are read live, at the moment they are asked. If
  // the tables behind the latest one change afterwards — a payment recorded,
  // attendance marked — it is flagged, so nobody acts on a figure that has
  // moved since.
  const liveAnswer = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === "assistant" && m.tables?.length && !m.stale) return { id: m.id, tables: m.tables };
    }
    return null;
  }, [messages]);
  const liveKey = liveAnswer ? `${liveAnswer.id}:${liveAnswer.tables.join(",")}` : "";

  useEffect(() => {
    if (!liveAnswer || !schoolId || typeof schoolId !== "string") return;
    const channels = liveAnswer.tables.map((table) =>
      api
        .channel(`copilot-${liveAnswer.id}-${table}`)
        .on(
          "postgres_changes",
          // anyWrite: also changes made through the app's own endpoints
          // (fees, attendance), announced by the database.
          { event: "*", schema: "public", table, filter: `school_id=eq.${schoolId}`, anyWrite: true },
          () => setMessages((prev) => prev.map((m) => (m.id === liveAnswer.id ? { ...m, stale: true } : m))),
        )
        .subscribe(),
    );
    return () => {
      channels.forEach((ch) => {
        void api.removeChannel(ch);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, schoolId]);
  const recognitionRef = useRef<any>(null);
  const storageKey = getStorageKey(schoolId, user?.id);

  // Cleanup speech synthesis & recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  const handleToggleRecord = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech Recognition is not supported in this browser.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    let initialText = input;

    rec.onstart = () => {
      setIsRecording(true);
    };

    rec.onerror = (e: any) => {
      console.error("Speech recognition error:", e);
      if (e.error !== "no-speech") {
        toast.error(`Speech recognition error: ${e.error}`);
      }
      setIsRecording(false);
    };

    rec.onend = () => {
      setIsRecording(false);
    };

    rec.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setInput(initialText + (initialText ? " " : "") + finalTranscript);
      }
    };

    recognitionRef.current = rec;
    rec.start();
  };

  const stripMarkdownAndTags = (text: string): string => {
    let clean = text.replace(/<altrix_action>[\s\S]*?<\/altrix_action>/gi, "");
    clean = clean.replace(/<altrix_chart[\s\S]*?\/>/gi, "");
    clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, "");
    clean = clean.replace(/<[^>]*>/g, "");
    clean = clean
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/#+\s+/g, "")
      .replace(/^[*-]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "");
    return clean.trim();
  };

  const handleToggleSpeech = (msgId: string, content: string) => {
    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const textToSpeak = stripMarkdownAndTags(content);
    if (!textToSpeak) return;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.onend = () => {
      setSpeakingMsgId(null);
    };
    utterance.onerror = () => {
      setSpeakingMsgId(null);
    };

    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };


  // ── Fetch AI Settings ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const rawSchoolId = typeof schoolId === "string" ? schoolId : (schoolId && typeof schoolId === "object" ? ((schoolId as any).id || String(schoolId)) : "");
    // On super_admin pages, don't fall back to stale localStorage school IDs —
    // query the global AI toggle instead of a per-school toggle.
    const isSuperAdminPage = location.pathname.startsWith("/super_admin");
    const effectiveId = isSuperAdminPage ? "" : (rawSchoolId || schoolSlug || localStorage.getItem("eduverse_active_school_id") || "");
    const params = effectiveId ? `?school_id=${encodeURIComponent(String(effectiveId))}` : "";

    const fetchSettings = async () => {
      try {
        const res = await apiClient.get<{ enabled: boolean }>(`/ai/settings${params}`);
        let enabled = res.data?.enabled !== false;

        // If in school tenant context, also verify feature flags
        if (enabled && effectiveId && effectiveId !== "__none__") {
          try {
            const flagRes = await apiClient.get(`/feature-flags/${effectiveId}`);
            if (flagRes.data?.ai_features_enabled === false) {
              enabled = false;
            }
          } catch {
            // Ignore flag check error
          }
        }

        setAiEnabled(enabled);
        if (!effectiveId) {
          localStorage.setItem("altrix_global_ai_enabled", String(enabled));
        }
      } catch {
        const saved = localStorage.getItem("altrix_global_ai_enabled");
        if (saved !== null) {
          setAiEnabled(saved === "true");
        }
      }
    };
    fetchSettings();
  }, [user, schoolId, schoolSlug, location.pathname]);

  // Whether a model can actually be reached. Without this the screen could not
  // tell "thinking" from "nothing is listening", so a service that was simply
  // down looked like a slow one.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get<{ ready: boolean; provider: string; local_model: string | null; cloud: { name: string } | null }>(
          "/ai/health",
        );
        if (!cancelled) setAiHealth(res.data);
      } catch {
        // A health check that itself fails says nothing about the model; the
        // first message will report the truth either way.
        if (!cancelled) setAiHealth(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

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

  // ── Scroll Handlers ───────────────────────────────────────────────────────
  const scrollToStartOfReply = useCallback((messageId?: string) => {
    if (!scrollRef.current) return;
    if (messageId) {
      const el = document.getElementById(`copilot-msg-${messageId}`);
      if (el && scrollRef.current) {
        const containerTop = scrollRef.current.getBoundingClientRect().top;
        const elTop = el.getBoundingClientRect().top;
        const currentScroll = scrollRef.current.scrollTop;
        const targetScroll = currentScroll + (elTop - containerTop) - 16;
        scrollRef.current.scrollTo({ top: Math.max(0, targetScroll), behavior: "smooth" });
        return;
      }
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, []);

  // When panel is opened, scroll to latest position once
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      const t = setTimeout(scrollToBottom, 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

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
          content: `👋 Hi! I'm your **AltRix AI Copilot**. I answer from your school's live records — in English or Roman Urdu.\n\nTry asking:\n- 📊 *Who has unpaid fees?* · *Is mahine kitni fee aayi?*\n- 👥 *Aaj kaun absent hai?* · *Class 5 ke students*\n- 📝 *Upcoming exams* · *Latest results*\n- 🧑‍🏫 *Staff on leave today* · *Open complaints*\n\nEvery figure comes straight from the database, with the time it was read.`,
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
  const suggestions = useMemo(() => {
    const path = location.pathname.toLowerCase();
    
    if (
      path.includes("/fees") ||
      path.includes("/invoices") ||
      path.includes("/payments") ||
      path.includes("/accountant")
    ) {
      return ["Outstanding fees summary", "List unpaid invoices", "Defaulter analytics"];
    }
    
    if (path.includes("/attendance")) {
      return ["Absentees today", "Attendance rate trends"];
    }
    
    if (path.includes("/exams") || path.includes("/results")) {
      return ["Class-wise exam performance", "Generate student report card"];
    }

    return primaryRole ? ROLE_SUGGESTIONS[primaryRole] || [] : [];
  }, [location.pathname, primaryRole]);

  if (!aiEnabled) return null;

  // ── Parse Action & Chart Tags ──────────────────────────────────────────────
  const parseMessageContent = (text: string): { content: string; action?: ActionPayload; actions?: ActionPayload[]; chart?: ChartPayload } => {
    let cleanText = text;
    const actionsList: ActionPayload[] = [];
    let chartData: ChartPayload | undefined = undefined;

    // 1. Extract all <altrix_action> tags
    const tagRegexGlobal = /<altrix_action>([\s\S]*?)<\/altrix_action>/gi;
    let match;
    while ((match = tagRegexGlobal.exec(text)) !== null) {
      try {
        let rawJson = match[1].trim();
        // Clean double braces if present
        if (rawJson.startsWith("{{") && rawJson.endsWith("}}")) {
          rawJson = rawJson.slice(1, -1);
        }
        const parsed = JSON.parse(rawJson);
        if (parsed) {
          actionsList.push(parsed);
        }
      } catch (e) {
        console.error("Failed to parse action json from tag:", e);
      }
    }
    cleanText = cleanText.replace(tagRegexGlobal, "").trim();

    // 2. If no <altrix_action> tags were found, search for loose JSON block in double braces: {{...}}
    if (actionsList.length === 0) {
      const doubleBraceRegex = /(\{\{[\s\S]*?\}\})/g;
      const dbMatches = cleanText.match(doubleBraceRegex);
      if (dbMatches) {
        for (const matchStr of dbMatches) {
          try {
            let cleaned = matchStr.trim().slice(1, -1);
            const parsed = JSON.parse(cleaned);
            if (parsed && (parsed.type || parsed.method || parsed.route || parsed.path)) {
              actionsList.push(parsed);
              cleanText = cleanText.replace(matchStr, "").trim();
            }
          } catch {
            // Not valid JSON
          }
        }
      }
    }

    // 3. Search for loose JSON block in single braces: {...} if action not parsed yet
    if (actionsList.length === 0) {
      const singleBraceRegex = /(\{[\s\S]*?\})/g;
      const sbMatches = cleanText.match(singleBraceRegex);
      if (sbMatches) {
        for (const matchStr of sbMatches) {
          try {
            const parsed = JSON.parse(matchStr.trim());
            if (parsed && (parsed.type || parsed.method || parsed.route || parsed.path)) {
              actionsList.push(parsed);
              cleanText = cleanText.replace(matchStr, "").trim();
            }
          } catch {
            // Not valid JSON
          }
        }
      }
    }

    // 4. Parse chart tag: <altrix_chart type="..." title="..." xKey="..." yKeys="..." data='...' />
    const chartTagRegex = /<altrix_chart([\s\S]*?)\/>/i;
    const chartMatch = cleanText.match(chartTagRegex);
    if (chartMatch) {
      try {
        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(chartMatch[0], "text/html");
        const chartElem = parsedDoc.querySelector("altrix_chart");
        if (chartElem) {
          const type = chartElem.getAttribute("type") as "bar" | "line" | "pie" | null;
          const title = chartElem.getAttribute("title") || "Analytics";
          const xKey = chartElem.getAttribute("xkey") || chartElem.getAttribute("xKey") || chartElem.getAttribute("xkeys") || chartElem.getAttribute("xKeys") || "label";
          const yKeysStr = chartElem.getAttribute("ykeys") || chartElem.getAttribute("yKeys") || "";
          const yKeys = yKeysStr.split(",").map(k => k.trim()).filter(Boolean);
          const rawData = chartElem.getAttribute("data") || "[]";
          const data = JSON.parse(rawData);
          if (type && data && Array.isArray(data)) {
            chartData = { type, title, xKey, yKeys, data };
          }
        }
        cleanText = cleanText.replace(chartTagRegex, "").trim();
      } catch (e) {
        console.error("Failed to parse chart tag", e);
      }
    }

    return { content: cleanText, action: actionsList[0], actions: actionsList, chart: chartData };
  };

  const handleDirectRouteNavigation = (routeAttr: string) => {
    // 1. Clean up the route (strip any existing role prefix if present)
    let cleanRoute = routeAttr;
    const rolePrefixPattern = /^\/(teacher|hr|accountant|marketing|student|parent|school_owner|principal|vice_principal|school_admin|academic_coordinator)\b/;
    cleanRoute = cleanRoute.replace(rolePrefixPattern, "");
    
    // 2. Resolve sub-routes (e.g., /finance/invoices -> /invoices)
    const segments = cleanRoute.split("/").filter(Boolean);
    let resolvedRelativePath = "";
    for (let i = segments.length - 1; i >= 0; i--) {
      if (routeNames.includes(segments[i])) {
        resolvedRelativePath = "/" + segments.slice(i).join("/");
        break;
      }
    }
    if (!resolvedRelativePath) {
      resolvedRelativePath = cleanRoute.startsWith("/") ? cleanRoute : "/" + cleanRoute;
    }
    
    // 3. Prepend current role path segment
    const roleSegment = getRolePathSegment(primaryRole);
    const finalRoute = roleSegment ? `/${roleSegment}${resolvedRelativePath}` : resolvedRelativePath;
    
    // 4. Prepend school slug
    const slugPrefix = schoolSlug ? `/${schoolSlug}` : "";
    navigate(`${slugPrefix}${finalRoute}`);
    setIsOpen(false);
  };

  // ── Intercept clicks on inline route buttons ──────────────────────────────
  const handleBubbleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const button = target.closest("[data-route]");
    const routeAttr = button?.getAttribute("data-route");
    if (routeAttr) {
      e.preventDefault();
      handleDirectRouteNavigation(routeAttr);
    }
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

  // ── File Upload Handler ───────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Only text the model can actually read. A 2 MB limit here used to let a
    // file through that the server then refused, because it was stuffed into
    // a message capped at 2,000 characters — a silent 400 on every real file.
    if (file.size > 2 * 1024 * 1024) {
      toast.error("That file is too large. Attach a text file of a few pages at most.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        if (text.length > ATTACHMENT_LIMIT) {
          toast.error(
            `The Copilot can read up to ${ATTACHMENT_LIMIT.toLocaleString()} characters of a file ` +
              `(this one has ${text.length.toLocaleString()}). Paste the part you need instead.`,
          );
          return;
        }
        setAttachedFile({
          name: file.name,
          content: text,
          size: file.size
        });
        toast.success(`Attached file: ${file.name}`);
      } else {
        toast.error("Failed to read file contents.");
      }
    };
    reader.onerror = () => {
      toast.error("Error reading file.");
    };
    reader.readAsText(file);
    
    // Clear target value so the same file can be uploaded again if cleared
    e.target.value = "";
  };

  // ── Send Message ──────────────────────────────────────────────────────────
  const handleSend = async (textToSend: string) => {
    if ((!textToSend.trim() && !attachedFile) || isStreaming) return;

    // Capture current file attachment to submit and then clear
    const fileToAttach = attachedFile;
    setAttachedFile(null);

    const userMsg: Message = {
      id: genId(),
      role: "user",
      content: textToSend || `Analyzed file: ${fileToAttach?.name}`,
      timestamp: new Date(),
      fileAttachment: fileToAttach ? { name: fileToAttach.name, size: fileToAttach.size } : undefined,
    };
    const userMsgId = userMsg.id;
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);
    setIsStreaming(true);
    setStreamStatus(null);

    // Smoothly focus viewport on the start of the user question / reply
    setTimeout(() => {
      scrollToStartOfReply(userMsgId);
    }, 60);

    abortRef.current = new AbortController();

    try {
      // The last few turns, without the panel's own error messages — the
      // model used to read "I couldn't reach the AI backend" as something it
      // had said.
      const history = messages
        .filter((msg) => !msg.isError && msg.content)
        .slice(-8)
        .map((msg) => ({ role: msg.role, content: msg.content.slice(0, 600) }));

      const promptToSend = textToSend || (fileToAttach ? "Summarise the attached file." : "");

      const session = await api.auth.getSession();
      const token = session.data.session?.access_token || "";

      const getModuleFromPath = (path: string): string => {
        const p = path.toLowerCase();
        // The server uses this to break ties ("pending" on the admissions
        // screen means admissions), so the more specific screens come first.
        if (p.includes("/library")) return "Library";
        if (p.includes("/transport")) return "Transport";
        if (p.includes("/hostel")) return "Hostel";
        if (p.includes("/timetable")) return "Timetable";
        if (p.includes("/homework")) return "Homework";
        if (p.includes("/assignment")) return "Assignments";
        if (p.includes("/holiday")) return "Holidays";
        if (p.includes("/leave")) return "Leave";
        if (p.includes("/payroll") || p.includes("/payslip") || p.includes("/salar")) return "Payroll";
        if (p.includes("/inventory")) return "Inventory";
        if (p.includes("/visitor")) return "Visitors";
        if (p.includes("/event")) return "Events";
        if (p.includes("/alumni")) return "Alumni";
        if (p.includes("/certificate")) return "Certificates";
        if (p.includes("/recruit") || p.includes("/job")) return "Recruitment";
        if (p.includes("/finance") || p.includes("/fees") || p.includes("/invoices") || p.includes("/payments") || p.includes("/expenses")) return "Finance";
        if (p.includes("/attendance")) return "Attendance";
        if (p.includes("/exam") || p.includes("/result") || p.includes("/report-card")) return "Exams & Results";
        if (p.includes("/student")) return "Students";
        if (p.includes("/teacher") || p.includes("/users")) return "Staff & HR";
        if (p.includes("/admission") || p.includes("/crm") || p.includes("/lead")) return "Admissions & CRM";
        if (p.includes("/complaint")) return "Complaints";
        if (p.includes("/diary") || p.includes("/notice")) return "Communication";
        return "General";
      };


      const response = await fetch(
        `${apiClient.defaults.baseURL || "/api"}/ai/copilot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-School-Id": typeof schoolId === "string" ? schoolId : (schoolId && typeof schoolId === "object" ? ((schoolId as any).id || "") : ""),
          },
          body: JSON.stringify({
            message: promptToSend,
            history,
            current_screen: location.pathname,
            current_module: getModuleFromPath(location.pathname),
            active_campus_id: activeCampusId || null,
            // Only the student the user has chosen. Any id in the URL used to
            // be sent as a student id — an invoice's, a report card's.
            active_student_id: activeStudentId || null,
            attachment_name: fileToAttach?.name ?? null,
            attachment_text: fileToAttach?.content ?? null,
          }),
          signal: abortRef.current.signal,
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        let errorMsg = "";
        if (errData.detail) {
          if (typeof errData.detail === "string") {
            errorMsg = errData.detail;
          } else if (Array.isArray(errData.detail)) {
            errorMsg = errData.detail.map((err: any) => err.msg || JSON.stringify(err)).join(", ");
          } else if (typeof errData.detail === "object") {
            errorMsg = errData.detail.message || errData.detail.error || JSON.stringify(errData.detail);
          }
        }
        const failure = new Error(describeFailure(response.status, errorMsg));
        (failure as any).handled = true;
        throw failure;
      }
      if (!response.body) throw new Error("No response stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let streamError: string | null = null;
      // A chunk boundary can fall in the middle of a line, so the tail of one
      // read has to be carried into the next. Without this, tokens - and
      // occasionally a whole event - were dropped without trace.
      let buffered = "";
      const assistantId = genId();
      // The bubble is added with the first word, not before: an empty bubble
      // under a spinner looked like an answer that had failed to arrive.
      let bubbleAdded = false;
      let meta: { asOf?: string; tables?: string[] } = {};
      const firstWordTimer = window.setTimeout(() => {
        if (!bubbleAdded) {
          abortRef.current?.abort();
          setMessages((prev) => [
            ...prev,
            {
              id: genId(),
              role: "assistant",
              content:
                "The model on the school's server did not start answering in time. Questions about records — fees, attendance, results, staff — are answered straight from the database and are quick; open-ended questions depend on the model and can be slow when it is busy.",
              timestamp: new Date(),
              isError: true,
            },
          ]);
        }
      }, FIRST_WORD_TIMEOUT_MS);

      const applyEvent = (jsonStr: string) => {
        if (!jsonStr || jsonStr === "[DONE]") return;
        let data: any;
        try {
          data = JSON.parse(jsonStr);
        } catch {
          return; // not a whole event yet
        }
        if (typeof data.status === "string") {
          setStreamStatus(data.status);
          return;
        }
        if (data.meta && typeof data.meta === "object") {
          meta = { asOf: data.meta.as_of, tables: Array.isArray(data.meta.tables) ? data.meta.tables : [] };
          return;
        }
        if (data.error) {
          // The Copilot could not reach a model. Say so. This used to answer
          // with a cheerful paragraph and three hard-coded links, so a user
          // could not tell a working Copilot from a broken one.
          streamError =
            typeof data.error === "object"
              ? data.error.message || JSON.stringify(data.error)
              : String(data.error);
          return;
        }
        const piece = data.choices?.[0]?.delta?.content || "";
        if (!piece) return;
        assistantText += piece;
        const parsed = parseMessageContent(assistantText);
        if (!bubbleAdded) {
          bubbleAdded = true;
          window.clearTimeout(firstWordTimer);
          setIsThinking(false);
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: "assistant",
              content: parsed.content,
              timestamp: new Date(),
              asOf: meta.asOf,
              tables: meta.tables,
              question: promptToSend,
            },
          ]);
          return;
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: parsed.content } : m))
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          applyEvent(trimmed.slice(5).trim());
        }
      }
      if (buffered.trim().startsWith("data:")) applyEvent(buffered.trim().slice(5).trim());
      window.clearTimeout(firstWordTimer);

      if (streamError && !assistantText) {
        const failure = new Error(streamError);
        (failure as any).handled = true;
        throw failure;
      }
      if (streamError) {
        toast.warning("The answer stopped early: " + streamError, { duration: 9000 });
      }

      // Nothing in a reply is ever executed by itself. This used to run any
      // action the model's text flagged with `execute: true` — generating
      // vouchers, navigating, exporting — without a click, on the say-so of a
      // small model that had been told never to emit actions at all.
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User stopped generation
        return;
      }
      console.error("Copilot stream error:", err);
      // The reason, not a guess at one. Every failure used to read "Is the
      // backend server running?" — including a 403 for a disabled Copilot
      // and a 429 for a busy one.
      const reason = err?.handled ? err.message : describeFailure(null, "");
      setMessages((prev) => [
        ...prev,
        { id: genId(), role: "assistant", content: reason, timestamp: new Date(), isError: true },
      ]);
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      setStreamStatus(null);
    }
  };

  // ── Execute Action Direct ──────────────────────────────────────────────────
  const handleExecuteActionDirect = async (action: ActionPayload) => {
    const { type, invoiceId, route } = action;

    if (type === "GENERATE_VOUCHER") {
      if (!invoiceId) return toast.error("Missing invoice ID in action context");
      const t = toast.loading("Generating PDF Voucher...");
      try {
        const { data: invoice, error: invErr } = await api
          .from("fee_invoices")
          .select("*, fee_invoice_items(*)")
          .eq("id", invoiceId)
          .single();
        if (invErr || !invoice) throw new Error("Invoice not found");

        // The same loader and the same invoice fields the fee screens use, so a
        // voucher from the assistant is identical to one from the fee module:
        // the discounts that make the lines add up to the total, the bank
        // details, the late fee and the invoice's paid status.
        const [{ data: student }, meta] = await Promise.all([
          api
            .from("students")
            .select("first_name, last_name, roll_number, student_code, parent_name, parent_phone")
            .eq("id", invoice.student_id)
            .maybeSingle(),
          loadSchoolVoucherMeta(schoolId!),
        ]);

        const inv = invoice as any;
        const base: VoucherCopyData = {
          invoiceNumber: inv.invoice_number,
          issueDate: String(inv.created_at ?? new Date().toISOString()).slice(0, 10),
          dueDate: inv.due_date,
          periodLabel: inv.period_label ?? null,
          school: {
            name: meta.school?.name ?? "School",
            address: meta.school?.address ?? null,
            phone: meta.school?.phone ?? null,
            email: meta.school?.email ?? null,
            website: meta.school?.website ?? null,
            logoUrl: meta.school?.logo_url ?? null,
            motto: meta.school?.motto ?? null,
          },
          student: {
            name: `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim(),
            rollNumber: student?.roll_number ?? null,
            studentCode: student?.student_code ?? null,
            className: null,
            sectionName: null,
            parentName: student?.parent_name ?? null,
            parentPhone: student?.parent_phone ?? null,
          },
          items: [...(inv.fee_invoice_items ?? [])]
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((it: any) => ({ label: it.label, amount: String(it.amount) })),
          subtotal: inv.subtotal,
          baseDiscount: inv.discount_amount,
          meritDiscount: inv.merit_discount_amount,
          meritReason: inv.merit_discount_reason ?? null,
          siblingDiscount: inv.sibling_discount_amount,
          total: inv.total_amount,
          paidAmount: inv.paid_amount ?? null,
          status: voucherStatusFor(inv.status, inv.due_date),
          currency: meta.currency ?? "PKR",
          accentHsl: meta.branding,
          notes: inv.notes ?? null,
          bank: meta.bank,
          footerNote: meta.footerNote,
          ...lateFeeTerms(meta, inv.due_date),
        };
        const { data, warnings } = await prepareVoucherData(base);
        const doc = generateVoucherPdf(data);
        doc.save(voucherFileName(data));
        if (warnings.length) {
          toast.warning(`Voucher downloaded without the school logo: ${warnings[0].reason}`, { id: t });
        } else {
          toast.success("Voucher downloaded!", { id: t });
        }
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
      const slugPrefix = schoolSlug ? `/${schoolSlug}` : "";
      navigate(`${slugPrefix}${finalRoute}`);
      setIsOpen(false);
    } else if (type === "GENERATE_RESULT_CARD") {
      const roleSegment = getRolePathSegment(primaryRole);
      const slugPrefix = schoolSlug ? `/${schoolSlug}` : "";
      navigate(`${slugPrefix}/${roleSegment}/report-cards`);
      setIsOpen(false);
    } else if (type === "EXPORT_ATTENDANCE" || type === "EXPORT_GRADES") {
      const roleSegment = getRolePathSegment(primaryRole);
      const slugPrefix = schoolSlug ? `/${schoolSlug}` : "";
      navigate(`${slugPrefix}/${roleSegment}/reports`);
      setIsOpen(false);
    }
  };

  // ── Execute Action ────────────────────────────────────────────────────────
  const handleExecuteAction = async (msg: Message) => {
    if (msg.actions && msg.actions.length > 0) {
      for (const action of msg.actions) {
        await handleExecuteActionDirect(action);
      }
    } else if (msg.action) {
      await handleExecuteActionDirect(msg.action);
    }
  };

  // ── Panel Dimensions ──────────────────────────────────────────────────────
  const panelClass = isExpanded
    ? "fixed inset-2 sm:inset-6 z-[60]"
    : "fixed bottom-24 right-2 sm:right-6 w-[calc(100vw-1rem)] sm:w-96 max-h-[75vh] sm:max-h-[600px] z-50";

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
      <div
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-2 pointer-events-auto print:hidden no-print copilot-trigger"
        data-html2canvas-ignore="true"
      >
        {!isOpen && (
          <div className="hidden sm:flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
            <span className="bg-white/95 backdrop-blur text-slate-700 text-[10px] font-medium px-2.5 py-1 rounded-full border border-slate-200 shadow-sm whitespace-nowrap">
              <Keyboard className="inline h-3 w-3 mr-1 text-primary" />
              Alt+K
            </span>
          </div>
        )}

        <button
          id="altrix-copilot-btn"
          onClick={() => setIsOpen((o) => !o)}
          className="relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-primary shadow-[0_8px_30px_hsl(var(--primary)/0.35)] transition-all duration-300 hover:scale-110 hover:shadow-[0_8px_35px_hsl(var(--primary)/0.6)] cursor-pointer active:scale-95 border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Toggle AI Copilot (Alt+K)"
          title="AltRix AI Copilot"
        >
          <div className="copilot-pulse-ring" />
          {isOpen ? (
            <X className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
          ) : (
            <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
          )}
        </button>
      </div>

      {/* ── Chat Panel ───────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          data-html2canvas-ignore="true"
          className={`${panelClass} rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.15)] flex flex-col overflow-hidden copilot-panel print:hidden no-print`}
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-white via-primary/5 to-white px-4 py-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-sm">
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
                id={`copilot-msg-${msg.id}`}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                {/* Avatar */}
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-1 w-full">
                    <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
                      <Brain className="h-3 w-3 text-white" />
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">AltRix AI</span>
                    <span className="text-[10px] text-slate-400">
                      {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button
                      onClick={() => handleToggleSpeech(msg.id, msg.content)}
                      className="ml-auto p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                      title={speakingMsgId === msg.id ? "Stop Reading" : "Read Aloud"}
                    >
                      {speakingMsgId === msg.id ? (
                        <VolumeX className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {/* Bubble */}
                <div
                  className={`group relative max-w-[88%] rounded-2xl px-3 py-2.5 text-[12px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-br-sm shadow-md"
                      : msg.isError
                      ? "bg-rose-50 text-rose-800 border border-rose-200 rounded-bl-sm"
                      : "bg-slate-50 text-slate-800 border border-slate-200/60 rounded-bl-sm shadow-sm"
                  }`}
                >
                  {msg.role === "user" ? (
                    <div className="flex flex-col gap-1.5">
                      {msg.fileAttachment && (
                        <div className="flex items-center gap-2 rounded-lg bg-white/15 px-2.5 py-1.5 border border-white/10 text-[10px] select-none mr-auto">
                          <Paperclip className="h-3.5 w-3.5 text-white/95" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold truncate max-w-[150px] text-white leading-tight">{msg.fileAttachment.name}</span>
                            <span className="text-[8px] text-white/75 leading-none mt-0.5">{(msg.fileAttachment.size / 1024).toFixed(1)} KB</span>
                          </div>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div
                        className="copilot-msg-content whitespace-normal break-words leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    </div>
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

                  {/* Chart Visual if requested */}
                  {msg.chart && <CopilotChart chart={msg.chart} />}
                </div>

                {/* Timestamp for user */}
                {msg.role === "assistant" && msg.stale && msg.question && (
                  <button
                    type="button"
                    onClick={() => void handleSend(msg.question!)}
                    disabled={isStreaming}
                    className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    title="The records behind this answer have changed since it was read"
                  >
                    The figures have changed since — ask again
                  </button>
                )}
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
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="h-3 w-3 text-white" />
                </div>
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1.5 shadow-sm">
                  <span className="text-[11px] text-slate-500 italic">{streamStatus || "Understanding your question…"}</span>
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

          {/* No model can be reached. Said here, before anyone types,
              rather than after a question has been thought about and lost. */}
          {aiHealth && !aiHealth.ready && (
            <div className="px-3 py-2 border-t border-amber-200 bg-amber-50 text-[11px] text-amber-800 shrink-0">
              <span className="font-semibold">The Copilot has no model to answer with.</span>{" "}
              No AI provider is configured and the school's own server has no model installed.
              Ask your administrator to set an AI key, or to run
              <code className="mx-1 rounded bg-amber-100 px-1">ollama pull qwen2.5:3b</code>
              on the server.
            </div>
          )}

          {/* ── Suggestions ────────────────────────────────────────────── */}
          {!isStreaming && !isThinking && suggestions.length > 0 && (
            <div className="px-3 py-2 border-t border-slate-100 bg-white flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s)}
                  className="rounded-full bg-slate-50 border border-slate-200 hover:border-primary hover:bg-primary/5 text-slate-600 hover:text-primary text-[10px] px-3 py-1 font-medium transition-all cursor-pointer active:scale-95 whitespace-nowrap flex-shrink-0"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* ── Input Area ─────────────────────────────────────────────── */}
          {attachedFile && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Paperclip className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold truncate max-w-[200px] text-slate-700">{attachedFile.name}</span>
                <span className="text-[9px] text-slate-400">({(attachedFile.size / 1024).toFixed(1)} KB)</span>
              </div>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title="Remove attachment"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 py-2.5 shrink-0"
          >
            {/* Hidden File Input */}
            <input
              type="file"
              id="copilot-file-upload"
              accept=".txt,.csv,.json,.xml,.html,.css,.js,.ts,.tsx,.py,.md"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isStreaming}
            />
            {/* Attachment Button */}
            <label
              htmlFor="copilot-file-upload"
              className={`flex items-center justify-center h-9 w-9 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer shrink-0 transition-colors ${
                isStreaming ? "opacity-50 pointer-events-none" : ""
              }`}
              title="Attach text or CSV document"
            >
              <Paperclip className="h-4 w-4" />
            </label>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isStreaming ? "Generating response..." : "Ask AltRix Copilot…"}
              disabled={isStreaming}
              className="flex-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-[12px] px-3.5 py-2 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 transition-shadow disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleToggleRecord}
              disabled={isStreaming}
              className={`relative flex items-center justify-center h-9 w-9 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer shrink-0 transition-all ${
                isRecording ? "border-red-500/40 text-red-600 bg-red-50/50" : ""
              }`}
              title={isRecording ? "Stop voice recording" : "Record voice input"}
            >
              {isRecording && <span className="absolute inset-0 rounded-xl border-2 border-red-500 animate-ping opacity-60 pointer-events-none" style={{ animationDuration: '1.2s' }} />}
              {isRecording ? (
                <MicOff className="h-4 w-4 text-red-600" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
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
                disabled={!input.trim() && !attachedFile}
                size="icon"
                className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/95 hover:from-primary/95 hover:to-primary/90 text-primary-foreground border-0 cursor-pointer flex-shrink-0 shadow-sm"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </form>

          {/* ── Footer Branding ─────────────────────────────────────────── */}
          <div className="text-center py-1.5 bg-slate-50 border-t border-slate-100">
            <p className="text-[9px] text-slate-400 font-medium tracking-wider uppercase">
              AltRix AI · Powered by{" "}
              <a
                href="https://naumanellahi.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-blue-700 hover:underline font-bold transition-colors inline-block"
              >
                NAUMAN ELLAHI
              </a>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
