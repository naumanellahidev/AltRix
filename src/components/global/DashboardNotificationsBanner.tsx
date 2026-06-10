import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Calendar,
  ChevronRight,
  FileText,
  GraduationCap,
  Megaphone,
  MessageSquare,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";

interface Props {
  schoolId: string | null;
  schoolSlug: string;
  role: string;
}

function getRolePath(role: string): string {
  switch (role) {
    case "principal":
    case "vice_principal":
    case "school_admin":
    case "academic_coordinator":
      return "admin";
    case "teacher":
      return "teacher";
    case "student":
      return "student";
    case "parent":
      return "parent";
    case "hr_manager":
      return "hr";
    case "accountant":
      return "accountant";
    case "marketing_staff":
      return "marketing";
    case "school_owner":
      return "school_owner";
    default:
      return role || "admin";
  }
}

function iconFor(n: AppNotification) {
  const t = (n.entity_type || n.type || "").toLowerCase();
  if (t.includes("notice")) return Megaphone;
  if (t.includes("homework") || t.includes("diary")) return BookOpen;
  if (t.includes("assignment")) return FileText;
  if (t.includes("exam") || t.includes("assessment") || t.includes("grade"))
    return GraduationCap;
  if (t.includes("attendance")) return Calendar;
  if (t.includes("message") || t.includes("admin_message")) return MessageSquare;
  return Bell;
}

function toneFor(n: AppNotification): "info" | "success" | "warning" | "danger" {
  const type = (n.type || "").toLowerCase();
  if (type === "error" || type === "alert") return "danger";
  if (type === "warning") return "warning";
  if (type === "success") return "success";
  return "info";
}

const TONE_CLASSES: Record<string, string> = {
  info: "bg-info/10 text-info border-info/30",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
};

function targetPath(n: AppNotification, slug: string, rolePath: string): string {
  const t = (n.entity_type || n.type || "").toLowerCase();
  const base = `/${slug}/${rolePath}`;
  if (t.includes("notice")) return `${base}/notices`;
  if (t.includes("homework") || t.includes("diary")) return `${base}/diary`;
  if (t.includes("assignment")) return `${base}/assignments`;
  if (t.includes("exam") || t.includes("assessment")) return `${base}/exams`;
  if (t.includes("grade") || t.includes("report"))
    return rolePath === "student" || rolePath === "parent"
      ? `${base}/grades`
      : `${base}/report-cards`;
  if (t.includes("attendance")) return `${base}/attendance`;
  if (t.includes("message")) return `${base}/messages`;
  return base;
}

export function DashboardNotificationsBanner({ schoolId, schoolSlug, role }: Props) {
  const navigate = useNavigate();
  const { data, markRead, markAllRead } = useNotifications(schoolId);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  const rolePath = getRolePath(role);

  const items = useMemo(() => {
    const unread = (data ?? []).filter((n) => !n.read_at && !dismissed.has(n.id));
    return unread.slice(0, 5);
  }, [data, dismissed]);

  if (!items.length) return null;

  return (
    <div className="card-premium overflow-hidden p-0 animate-rise">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-gradient-to-r from-primary/5 via-info/5 to-transparent px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <Bell className="h-4 w-4 text-primary" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive" />
          </span>
          <p className="text-sm font-semibold">
            New updates
            <Badge variant="secondary" className="ml-2 h-5 rounded-full px-1.5 text-[10px]">
              {items.length}
            </Badge>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 rounded-lg text-xs text-muted-foreground hover:text-foreground"
            onClick={() => markAllRead()}
          >
            Mark all read
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            <ChevronRight
              className={cn("h-4 w-4 transition-transform", !collapsed && "rotate-90")}
            />
          </Button>
        </div>
      </div>

      {!collapsed && (
        <ul className="divide-y divide-border/40">
          {items.map((n) => {
            const Icon = iconFor(n);
            const tone = toneFor(n);
            return (
              <li
                key={n.id}
                className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <button
                  className="flex flex-1 items-start gap-3 text-left"
                  onClick={async () => {
                    await markRead(n.id);
                    navigate(targetPath(n, schoolSlug, rolePath));
                  }}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                      TONE_CLASSES[tone],
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                      {(() => {
                        try {
                          return formatDistanceToNow(new Date(n.created_at), {
                            addSuffix: true,
                          });
                        } catch {
                          return "";
                        }
                      })()}
                    </p>
                  </div>
                  <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDismissed((prev) => new Set(prev).add(n.id));
                    void markRead(n.id);
                  }}
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
