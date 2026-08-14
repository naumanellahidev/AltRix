import { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  GraduationCap,
  Megaphone,
  MessageSquare,
  X,
  CheckCheck,
  ExternalLink,
  DollarSign,
  Info,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import NotificationCenter from "@/components/global/NotificationCenter";

interface Props {
  schoolId: string | null;
  schoolSlug: string;
  role: string;
  inline?: boolean;
}

function getRolePath(role: string): string {
  switch (role) {
    case "principal":
      return "principal";
    case "vice_principal":
      return "vice_principal";
    case "school_admin":
      return "school_admin";
    case "academic_coordinator":
      return "academic_coordinator";
    case "hr_manager":
      return "hr";
    case "marketing_staff":
      return "marketing";
    default:
      return role || "";
  }
}

function getNotificationStyle(n: AppNotification) {
  const t = (n.entity_type || n.type || "").toLowerCase();
  
  if (t.includes("exam") || t.includes("assessment") || t.includes("grade") || t.includes("datesheet")) {
    return {
      icon: GraduationCap,
      wrapper: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-800/40",
      accent: "bg-indigo-500",
    };
  }
  if (t.includes("notice") || t.includes("announcement")) {
    return {
      icon: Megaphone,
      wrapper: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/40",
      accent: "bg-amber-500",
    };
  }
  if (t.includes("homework") || t.includes("diary")) {
    return {
      icon: BookOpen,
      wrapper: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200/50 dark:border-purple-800/40",
      accent: "bg-purple-500",
    };
  }
  if (t.includes("assignment")) {
    return {
      icon: FileText,
      wrapper: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/40",
      accent: "bg-blue-500",
    };
  }
  if (t.includes("attendance")) {
    return {
      icon: Calendar,
      wrapper: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200/50 dark:border-sky-800/40",
      accent: "bg-sky-500",
    };
  }
  if (t.includes("message") || t.includes("admin_message")) {
    return {
      icon: MessageSquare,
      wrapper: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/40",
      accent: "bg-rose-500",
    };
  }
  if (t.includes("fee") || t.includes("invoice") || t.includes("voucher") || t.includes("billing")) {
    return {
      icon: DollarSign,
      wrapper: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/40",
      accent: "bg-emerald-500",
    };
  }
  return {
    icon: Bell,
    wrapper: "bg-primary/10 text-primary border-primary/20",
    accent: "bg-primary",
  };
}

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

export function DashboardNotificationsBanner({ schoolId, schoolSlug, role, inline }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, unreadCount, markRead, markAllRead } = useNotifications(schoolId);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [dismissedAll, setDismissedAll] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [showCenter, setShowCenter] = useState(false);

  const rolePath = getRolePath(role);

  // Suppress top banner on owner overview dashboard if not inline
  const isOwnerOverview = role === "school_owner" && (
    location.pathname.endsWith("/school_owner") || 
    location.pathname.endsWith("/school_owner/")
  );

  const unreadItems = useMemo(() => {
    return (data ?? []).filter((n) => !n.read_at && !dismissed.has(n.id));
  }, [data, dismissed]);

  const items = useMemo(() => {
    return unreadItems.slice(0, 5);
  }, [unreadItems]);

  const filteredItems = useMemo(() => {
    if (activeFilter === "all") return items;
    if (activeFilter === "academics") {
      return items.filter((n) => {
        const t = (n.entity_type || n.type || "").toLowerCase();
        return t.includes("exam") || t.includes("assessment") || t.includes("grade") || t.includes("datesheet");
      });
    }
    if (activeFilter === "notices") {
      return items.filter((n) => {
        const t = (n.entity_type || n.type || "").toLowerCase();
        return t.includes("notice") || t.includes("announcement");
      });
    }
    return items;
  }, [items, activeFilter]);

  if (!inline && isOwnerOverview) {
    return null;
  }

  if (!items.length || dismissedAll) return null;

  // Render Collapsed Pill Widget
  if (collapsed) {
    return (
      <div className="flex justify-end w-full mb-3">
        <button
          onClick={() => setCollapsed(false)}
          className="group inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 shadow-md hover:shadow-xl hover:border-primary/40 transition-all text-xs font-semibold text-foreground cursor-pointer"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
          </span>
          <Bell className="h-3.5 w-3.5 text-primary group-hover:rotate-12 transition-transform" />
          <span>{items.length} new update{items.length > 1 ? "s" : ""}</span>
          <span className="hidden sm:inline text-muted-foreground text-[11px] truncate max-w-[200px] font-normal">
            • {items[0]?.title}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-y-0.5 transition-transform" />
        </button>
      </div>
    );
  }

  // Render Full Compact Floating Panel
  return (
    <div className={cn("w-full mb-4", !inline && "flex justify-end")}>
      <div
        className={cn(
          "w-full rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-xl shadow-slate-900/5 dark:shadow-black/40 overflow-hidden transition-all duration-300 animate-rise",
          !inline && "max-w-xl"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/25 shadow-xs">
              <Bell className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold tracking-tight text-foreground">Updates & Notices</h4>
                <Badge variant="default" className="h-4.5 rounded-full px-2 text-[10px] font-bold bg-primary text-primary-foreground shadow-xs">
                  {items.length} new
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">Stay updated with institution activity</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-lg gap-1.5"
              onClick={() => markAllRead()}
              title="Mark all as read"
            >
              <CheckCheck className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Mark all read</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed(true)}
              title="Minimize panel"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setDismissedAll(true)}
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Category Tabs if > 2 items */}
        {items.length > 2 && (
          <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/40 bg-muted/20 overflow-x-auto no-scrollbar">
            {[
              { id: "all", label: "All updates" },
              { id: "academics", label: "Academics" },
              { id: "notices", label: "Notices" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={cn(
                  "px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all shrink-0 cursor-pointer",
                  activeFilter === tab.id
                    ? "bg-white dark:bg-slate-800 text-primary border border-border/60 shadow-xs"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Notifications List */}
        <ul className="divide-y divide-border/30 max-h-[280px] overflow-y-auto">
          {filteredItems.length === 0 ? (
            <li className="p-6 text-center text-xs text-muted-foreground">
              <Info className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground/60" />
              No updates in this filter category.
            </li>
          ) : (
            filteredItems.map((n) => {
              const { icon: Icon, wrapper } = getNotificationStyle(n);
              return (
                <li
                  key={n.id}
                  className="group relative flex items-start gap-3 px-4 py-2.5 transition-all hover:bg-accent/40"
                >
                  <button
                    className="flex flex-1 items-start gap-3 text-left cursor-pointer min-w-0"
                    onClick={async () => {
                      await markRead(n.id);
                      navigate(targetPath(n, schoolSlug, rolePath));
                    }}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border shadow-xs mt-0.5",
                        wrapper
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                          {n.title}
                        </p>
                        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                          {(() => {
                            try {
                              return formatDistanceToNow(new Date(n.created_at), {
                                addSuffix: true,
                              });
                            } catch {
                              return "";
                            }
                          })()}
                        </span>
                      </div>
                      {n.body && (
                        <p className="line-clamp-1 text-[11px] text-muted-foreground/90 mt-0.5 leading-relaxed">
                          {n.body}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5 self-center" />
                  </button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/80 self-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDismissed((prev) => new Set(prev).add(n.id));
                      void markRead(n.id);
                    }}
                    aria-label="Dismiss item"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              );
            })
          )}
        </ul>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-t border-border/40 text-[11px]">
          <span className="text-[10px] text-muted-foreground font-medium">
            {unreadItems.length} total unread notification{unreadItems.length > 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setShowCenter(true)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
          >
            Notification Center <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Side Sheet NotificationCenter */}
      <NotificationCenter
        open={showCenter}
        onOpenChange={setShowCenter}
        schoolId={schoolId}
      />
    </div>
  );
}

