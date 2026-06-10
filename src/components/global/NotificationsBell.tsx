import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { Bell, Check, CheckCheck, MessageSquare, AlertTriangle, Info, Calendar, GraduationCap, Trash2 } from "lucide-react";
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

export function NotificationsBell({ schoolId, schoolSlug, role }: NotificationsBellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, unreadCount, isLoading, markRead, markAllRead, clearNotification, error } = useNotifications(schoolId);
  const [open, setOpen] = useState(false);

  // Handle notification click - navigate to relevant page
  const handleNotificationClick = useCallback(
    async (notification: AppNotification) => {
      // Mark as read first
      if (!notification.read_at) {
        await markRead(notification.id);
      }

      // Close dropdown
      setOpen(false);
      
      // If it's a message notification, navigate to messages with the sender's ID
      if (notification.entity_type === "admin_message" && notification.entity_id && schoolSlug) {
        // Map role to the correct route path for messages
        // Each role has its own dashboard with a messages module
        const getRolePath = (r: string | undefined): string => {
          switch (r) {
            case "principal":
              return "principal";
            case "vice_principal":
              return "vice_principal";
            case "school_admin":
              return "school_admin";
            case "academic_coordinator":
              return "academic_coordinator";
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
              return r || "";
          }
        };
        
        const rolePath = getRolePath(role);
        const messagesPath = `/${schoolSlug}/${rolePath}/messages`;
        
        // If already on messages page, dispatch custom event to open chat
        if (location.pathname.includes("/messages")) {
          window.dispatchEvent(
            new CustomEvent("eduverse:open-chat-from-notification", {
              detail: { messageId: notification.entity_id },
            })
          );
        } else {
          // Navigate to messages with query param
          navigate(`${messagesPath}?open_message=${notification.entity_id}`);
        }
        return;
      }

      // Fee voucher / proof → navigate to fees module
      const isFeeNotif =
        notification.type === "fee_voucher" ||
        notification.type === "fee_proof_submitted" ||
        notification.type === "fee_proof_pending" ||
        notification.type === "fee_proof_verified" ||
        notification.type === "fee_proof_rejected" ||
        notification.entity_type === "fee_invoice";

      if (isFeeNotif) {
        // Hard-guard: never build a malformed URL that could bounce to /auth
        if (!schoolSlug || !role) {
          toast.warning("Unable to open notification", {
            description: `Missing ${!schoolSlug ? "school" : "role"} information. Please refresh and try again.`,
          });
          return;
        }
        const rolePathMap: Record<string, string> = {
          parent: "parent", student: "student",
          hr_manager: "hr", accountant: "accountant", marketing_staff: "marketing",
          principal: "principal", vice_principal: "vice_principal",
          school_admin: "school_admin", academic_coordinator: "academic_coordinator",
          school_owner: "school_owner", super_admin: "super_admin", teacher: "teacher",
        };
        const rolePath = rolePathMap[role];
        if (!rolePath) {
          toast.warning("Unable to open notification", {
            description: `Unknown role "${role}". Please contact support.`,
          });
          return;
        }
        const feesPath = role === "parent" || role === "student"
          ? `/${schoolSlug}/${rolePath}/fees`
          : `/${schoolSlug}/${rolePath}/fee-vouchers`;
        navigate(feesPath);
        return;
      }
    },
    [markRead, navigate, location.pathname, schoolSlug, role]
  );

  return (
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
      <DropdownMenuContent align="end" className="w-[380px] p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <DropdownMenuLabel className="p-0 text-base font-semibold">Notifications</DropdownMenuLabel>
            {unreadCount > 0 && (
              <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void markAllRead();
              }}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        {error ? (
          <div className="px-4 py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load notifications</p>
          </div>
        ) : isLoading ? (
          <div className="px-4 py-8 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="px-4 py-12 text-center">
            <Bell className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">You're all caught up!</p>
            <p className="text-xs text-muted-foreground mt-1">No new notifications</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[420px]">
            <div className="py-1">
              {(data ?? []).map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "group relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
                    "hover:bg-accent/50",
                    !n.read_at && "bg-primary/5"
                  )}
                  onClick={() => handleNotificationClick(n)}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      "flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center",
                      !n.read_at ? "bg-primary/10" : "bg-muted"
                    )}
                  >
                    {getNotificationIcon(n.type, n.entity_type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          "text-sm line-clamp-1",
                          !n.read_at ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                        )}
                      >
                        {n.title}
                      </p>
                      {!n.read_at && (
                        <span className="flex-shrink-0 h-2 w-2 rounded-full bg-primary mt-1.5" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {formatTimeAgo(n.created_at)}
                    </p>
                  </div>

                  {/* Actions on hover */}
                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    {!n.read_at && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          void markRead(n.id);
                        }}
                        title="Mark as read"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        void clearNotification(n.id);
                      }}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Footer */}
        {(data?.length ?? 0) > 0 && (
          <>
            <DropdownMenuSeparator className="m-0" />
            <div className="p-2">
              <Button
                variant="ghost"
                className="w-full h-8 text-xs text-muted-foreground"
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
  );
}
