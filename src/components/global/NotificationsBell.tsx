import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { Bell, Check, CheckCheck, MessageSquare, AlertTriangle, Info, Calendar, GraduationCap, Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNotifications, AppNotification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import NotificationPreferencesDialog from "./NotificationPreferencesDialog";

interface NotificationsBellProps {
  schoolId: string | null;
  schoolSlug?: string;
  role?: string;
}

// Get icon based on notification type
function getNotificationIcon(type: string, entityType: string | null) {
  if (entityType === "admin_message" || type === "message") {
    return <MessageSquare className="h-4 w-4 text-primary" />;
  }
  if (type === "alert" || type === "error") {
    return <AlertTriangle className="h-4 w-4 text-destructive" />;
  }
  if (type === "warning") {
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  }
  if (entityType === "attendance") {
    return <Calendar className="h-4 w-4 text-blue-500" />;
  }
  if (entityType === "grade") {
    return <GraduationCap className="h-4 w-4 text-emerald-500" />;
  }
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

// Format time ago
function formatTimeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return new Date(dateStr).toLocaleString();
  }
}

// Helper to compute target path for any notification type based on role
function getNotificationTargetRoute(notification: AppNotification, schoolSlug: string, role: string): string {
  const t = (notification.entity_type || notification.type || "").toLowerCase();
  
  const getRolePath = (r: string): string => {
    switch (r) {
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
        return r || "";
    }
  };

  const rolePath = getRolePath(role);
  const base = `/${schoolSlug}/${rolePath}`;

  if (t.includes("admin_message") || t.includes("message")) {
    if (role === "parent") {
      return `/${schoolSlug}/parent/messages`;
    }
    const rolePathMap: Record<string, string> = {
      parent: "parent",
      student: "student",
      hr_manager: "hr",
      accountant: "accountant",
      marketing_staff: "marketing",
      principal: "principal",
      vice_principal: "vice_principal",
      school_admin: "school_admin",
      academic_coordinator: "academic_coordinator",
      school_owner: "school_owner",
      super_admin: "super_admin",
      teacher: "teacher",
    };
    const targetRolePath = rolePathMap[role] || rolePath;
    return `/${schoolSlug}/${targetRolePath}/messages?open_message=${notification.entity_id || ""}`;
  }
  
  if (t.includes("notice")) return `${base}/notices`;
  if (t.includes("homework") || t.includes("diary")) return `${base}/diary`;
  if (t.includes("assignment")) return `${base}/assignments`;
  if (t.includes("exam") || t.includes("assessment")) return `${base}/exams`;
  if (t.includes("report_card") || t.includes("report-card") || t.includes("reportcard")) {
    const suffix = notification.entity_id ? `?view_card=${notification.entity_id}` : "";
    return rolePath === "student" || rolePath === "parent"
      ? `${base}/report-card${suffix}`
      : `${base}/report-cards${suffix}`;
  }
  if (t.includes("grade") || t.includes("report")) {
    return rolePath === "student" || rolePath === "parent"
      ? `${base}/grades`
      : `${base}/report-cards`;
  }
  if (t.includes("attendance")) return `${base}/attendance`;
  
  const isFeeNotif =
    notification.type === "fee_voucher" ||
    notification.type === "fee_proof_submitted" ||
    notification.type === "fee_proof_pending" ||
    notification.type === "fee_proof_verified" ||
    notification.type === "fee_proof_rejected" ||
    notification.entity_type === "fee_invoice";

  if (isFeeNotif) {
    const rolePathMap: Record<string, string> = {
      parent: "parent",
      student: "student",
      hr_manager: "hr",
      accountant: "accountant",
      marketing_staff: "marketing",
      principal: "principal",
      vice_principal: "vice_principal",
      school_admin: "school_admin",
      academic_coordinator: "academic_coordinator",
      school_owner: "school_owner",
      super_admin: "super_admin",
      teacher: "teacher",
    };
    const targetRolePath = rolePathMap[role] || rolePath;
    return role === "parent" || role === "student"
      ? `/${schoolSlug}/${targetRolePath}/fees`
      : `/${schoolSlug}/${targetRolePath}/fee-vouchers`;
  }
  
  return base;
}

export function NotificationsBell({ schoolId, schoolSlug, role }: NotificationsBellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, unreadCount, isLoading, markRead, markAllRead, clearNotification, error } = useNotifications(schoolId);
  const [open, setOpen] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");

  // Filter notifications by category
  const filteredNotifications = useMemo(() => {
    const list = data ?? [];
    if (activeTab === "all") return list;
    if (activeTab === "academics") {
      return list.filter(n => n.category === "exams" || n.category === "grades" || (n.entity_type && ["exam", "report_card", "datesheet", "grade", "assessment"].includes(n.entity_type.toLowerCase())));
    }
    if (activeTab === "billing") {
      return list.filter(n => n.category === "billing" || (n.entity_type && ["fee_invoice", "fee_voucher"].includes(n.entity_type.toLowerCase())));
    }
    if (activeTab === "notices") {
      return list.filter(n => n.category === "notices" || n.entity_type === "notice");
    }
    return list;
  }, [data, activeTab]);

  // Handle notification click - navigate to relevant page
  const handleNotificationClick = useCallback(
    async (notification: AppNotification) => {
      // Mark as read first
      if (!notification.read_at) {
        await markRead(notification.id);
      }

      // Close dropdown
      setOpen(false);

      if (!schoolSlug || !role) {
        toast.warning("Unable to open notification", {
          description: `Missing ${!schoolSlug ? "school" : "role"} information. Please refresh and try again.`,
        });
        return;
      }

      // If notification has a direct action_url payload, deep-link to it
      if (notification.action_url) {
        navigate(notification.action_url);
        return;
      }

      // If already on messages page and clicking a message, dispatch custom event to open chat
      const t = (notification.entity_type || notification.type || "").toLowerCase();
      if (
        (t.includes("admin_message") || t.includes("message")) &&
        location.pathname.includes("/messages") &&
        notification.entity_id
      ) {
        window.dispatchEvent(
          new CustomEvent("eduverse:open-chat-from-notification", {
            detail: { messageId: notification.entity_id },
          })
        );
        return;
      }

      const route = getNotificationTargetRoute(notification, schoolSlug, role);
      navigate(route);
    },
    [markRead, navigate, location.pathname, schoolSlug, role]
  );

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="soft" size="icon" aria-label="Notifications" className="relative">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span
                className={cn(
                  "absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full px-1",
                  "bg-destructive text-destructive-foreground text-[10px] font-bold shadow-lg",
                  "animate-in zoom-in-50 duration-200"
                )}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[380px] p-0 rounded-2xl shadow-elevated border border-slate-100 overflow-hidden bg-white">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <DropdownMenuLabel className="p-0 text-sm font-bold text-slate-800">Notifications</DropdownMenuLabel>
              {unreadCount > 0 && (
                <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100/50">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-500 hover:text-slate-800"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowPreferences(true);
                  setOpen(false);
                }}
                title="Preferences"
              >
                <Settings className="h-4 w-4" />
              </Button>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] font-bold text-blue-600 hover:text-blue-700"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void markAllRead();
                  }}
                >
                  Mark all read
                </Button>
              )}
            </div>
          </div>

          {/* Categories Tab Bar */}
          <div className="px-2 py-1.5 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {[
                { id: "all", label: "All" },
                { id: "academics", label: "Academics" },
                { id: "billing", label: "Billing" },
                { id: "notices", label: "Notices" }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveTab(tab.id);
                  }}
                  className={cn(
                    "text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors shrink-0",
                    activeTab === tab.id
                      ? "bg-white text-blue-600 border-slate-200 shadow-sm"
                      : "text-slate-500 border-transparent hover:bg-slate-100/70"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notification List Scroll Area */}
          {error ? (
            <div className="px-4 py-8 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Failed to load notifications</p>
            </div>
          ) : isLoading ? (
            <div className="px-4 py-12 text-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Loading notifications…</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <Bell className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-xs font-bold text-slate-700">You're all caught up!</p>
              <p className="text-[10px] text-slate-400 mt-1">No notifications in this category</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[350px] overflow-y-auto">
              <div className="py-1 divide-y divide-slate-50">
                {filteredNotifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "group relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
                      "hover:bg-slate-50/50",
                      !n.read_at && "bg-blue-50/20"
                    )}
                    onClick={() => handleNotificationClick(n)}
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        "flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center border",
                        !n.read_at ? "bg-blue-50/50 border-blue-100" : "bg-slate-50 border-slate-100"
                      )}
                    >
                      {getNotificationIcon(n.type, n.entity_type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-xs leading-tight line-clamp-1",
                            !n.read_at ? "font-bold text-slate-800" : "font-semibold text-slate-550"
                          )}
                        >
                          {n.title}
                        </p>
                        {!n.read_at && (
                          <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-blue-600 mt-1.5 animate-pulse" />
                        )}
                      </div>
                      {n.body && (
                        <p className="text-[10px] text-slate-450 line-clamp-2 leading-relaxed">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[9px] font-semibold text-slate-400 mt-1">
                        {formatTimeAgo(n.created_at)}
                      </p>
                    </div>

                    {/* Hover Actions */}
                    <div className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white border border-slate-100 rounded-lg shadow-sm p-0.5">
                      {!n.read_at && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-blue-600 hover:text-blue-700 rounded-md"
                          onClick={(e) => {
                            e.stopPropagation();
                            void markRead(n.id);
                          }}
                          title="Mark as read"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-slate-400 hover:text-rose-600 rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          void clearNotification(n.id);
                        }}
                        title="Remove"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Footer */}
          {filteredNotifications.length > 0 && (
            <>
              <DropdownMenuSeparator className="m-0" />
              <div className="p-2 bg-slate-50/50">
                <Button
                  variant="ghost"
                  className="w-full h-8 text-[10px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void markAllRead();
                    setOpen(false);
                  }}
                >
                  Mark all read & close
                </Button>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Preference center dialogue */}
      <NotificationPreferencesDialog
        open={showPreferences}
        onOpenChange={setShowPreferences}
      />
    </>
  );
}
