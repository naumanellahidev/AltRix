import { ReactNode, useState, useEffect } from "react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { DashboardNotificationsBanner } from "@/components/global/DashboardNotificationsBanner";

function getNotificationTargetRoute(notification: any, schoolSlug: string, role: string): string {
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
      parent: "parent", student: "student",
      hr_manager: "hr", accountant: "accountant", marketing_staff: "marketing",
      principal: "principal", vice_principal: "vice_principal",
      school_admin: "school_admin", academic_coordinator: "academic_coordinator",
      school_owner: "school_owner", super_admin: "super_admin", teacher: "teacher",
    };
    const targetRolePath = rolePathMap[role] || rolePath;
    return `/${schoolSlug}/${targetRolePath}/messages?open_message=${notification.entity_id || ""}`;
  }
  
  if (t.includes("notice")) return `${base}/notices`;
  if (t.includes("homework") || t.includes("diary")) return `${base}/diary`;
  if (t.includes("assignment")) return `${base}/assignments`;
  if (t.includes("exam") || t.includes("assessment")) return `${base}/exams`;
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
      parent: "parent", student: "student",
      hr_manager: "hr", accountant: "accountant", marketing_staff: "marketing",
      principal: "principal", vice_principal: "vice_principal",
      school_admin: "school_admin", academic_coordinator: "academic_coordinator",
      school_owner: "school_owner", super_admin: "super_admin", teacher: "teacher",
    };
    const targetRolePath = rolePathMap[role] || rolePath;
    return role === "parent" || role === "student"
      ? `/${schoolSlug}/${targetRolePath}/fees`
      : `/${schoolSlug}/${targetRolePath}/fee-vouchers`;
  }
  
  return base;
}
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Home,
  Calendar,
  GraduationCap,
  Receipt,
  MessageSquare,
  Clock,
  Bell,
  LifeBuoy,
  LogOut,
  ChevronDown,
  Sparkles,
  Menu,
  Brain,
  FileText,
  Megaphone,
  NotebookPen,
  PartyPopper,
  HeartHandshake,
  ShieldAlert,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChildInfo } from "@/hooks/useMyChildren";
import { GlobalCommandPalette } from "@/components/global/GlobalCommandPalette";
import { NotificationsBell } from "@/components/global/NotificationsBell";
import { useUnreadMessagesOptimized } from "@/hooks/useUnreadMessagesOptimized";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useSession } from "@/hooks/useSession";
import { useOfflineUniversal } from "@/hooks/useOfflineUniversal";
import { OfflineStatusIndicator } from "@/components/offline/OfflineStatusIndicator";

interface ParentShellProps {
  children: ReactNode;
  schoolName: string;
  schoolSlug: string;
  childList: ChildInfo[];
  selectedChild: ChildInfo | null;
  onSelectChild: (child: ChildInfo) => void;
  onLogout: () => void;
}

export function ParentShell({
  children,
  schoolName,
  schoolSlug,
  childList,
  selectedChild,
  onSelectChild,
  onLogout,
}: ParentShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user } = useSession();
  
  // Use optimized tenant hook that caches and applies branding automatically
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.schoolId;
  const { unreadParentCount } = useUnreadMessagesOptimized(schoolId, user?.id ?? null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleOpenNotification = (e: Event) => {
      const customEvent = e as CustomEvent;
      const notification = customEvent.detail?.notification;
      if (!notification || !schoolSlug) return;
      
      // Mark as read
      if (!notification.read_at) {
        if (USE_FASTAPI) {
          apiClient.post(`/notifications/${notification.id}/read`).catch(console.error);
        } else {
          supabase
            .from("app_notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("id", notification.id)
            .then();
        }
      }
      
      // Navigate to target path
      const route = getNotificationTargetRoute(notification, schoolSlug, "parent");
      navigate(route);
    };

    window.addEventListener("eduverse:open-notification", handleOpenNotification as EventListener);
    return () => {
      window.removeEventListener("eduverse:open-notification", handleOpenNotification as EventListener);
    };
  }, [schoolSlug, navigate]);

  // Offline support
  const offline = useOfflineUniversal({
    schoolId,
    userId: user?.id ?? null,
    role: "parent",
  });

  const basePath = `/${schoolSlug}/parent`;

  const formatChildName = (child: ChildInfo) => {
    const name = [child.first_name, child.last_name].filter(Boolean).join(" ") || "Student";
    const classSection = [child.class_name, child.section_name].filter(Boolean).join(" / ");
    return classSection ? `${name} • ${classSection}` : name;
  };

  const navItems = [
    { to: basePath, icon: Home, label: "Home", end: true, badge: 0 },
    { to: `${basePath}/ai-insights`, icon: Brain, label: "AI Insights", badge: 0 },
    { to: `${basePath}/attendance`, icon: Calendar, label: "Attendance", badge: 0 },
    { to: `${basePath}/grades`, icon: GraduationCap, label: "Grades", badge: 0 },
    { to: `${basePath}/report-card`, icon: FileText, label: "Report Card", badge: 0 },
    { to: `${basePath}/exams`, icon: GraduationCap, label: "Exams", badge: 0 },
    { to: `${basePath}/diary`, icon: NotebookPen, label: "Diary", badge: 0 },
    { to: `${basePath}/behavior`, icon: HeartHandshake, label: "Behavior Notes", badge: 0 },
    { to: `${basePath}/notices`, icon: Megaphone, label: "Notices", badge: 0 },
    { to: `${basePath}/holidays`, icon: PartyPopper, label: "Holidays", badge: 0 },
    { to: `${basePath}/fees`, icon: Receipt, label: "Fees", badge: 0 },
    { to: `${basePath}/messages`, icon: MessageSquare, label: "Messages", badge: unreadParentCount },
    { to: `${basePath}/complaints`, icon: ShieldAlert, label: "Complaints", badge: 0 },
    { to: `${basePath}/timetable`, icon: Clock, label: "Timetable", badge: 0 },
    { to: `${basePath}/notifications`, icon: Bell, label: "Notifications", badge: 0 },
    { to: `${basePath}/support`, icon: LifeBuoy, label: "Support", badge: 0 },
  ];

  const bottomNavItems = [
    { to: basePath, icon: Home, label: "Home", end: true },
    { to: `${basePath}/messages`, icon: MessageSquare, label: "Messages", badge: unreadParentCount },
    { to: `${basePath}/grades`, icon: GraduationCap, label: "Grades" },
    { to: `${basePath}/attendance`, icon: Calendar, label: "Attendance" },
  ];

  const NavContent = () => (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-lg font-semibold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">AltRix</p>
          <p className="text-xs text-muted-foreground">/{schoolSlug} • Parent</p>
        </div>
        <div className="flex items-center gap-2">
          <OfflineStatusIndicator
            isOnline={offline.isOnline}
            isSyncing={offline.isSyncing}
            stats={offline.stats}
            lastSyncAt={offline.lastSyncAt}
            syncProgress={offline.syncProgress}
            storageInfo={offline.storageInfo}
            onSync={offline.syncPendingItems}
            variant="compact"
          />
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="parent" />
          <Button
            variant="soft"
            size="icon"
            aria-label="Search"
            onClick={() => window.dispatchEvent(new Event("eduverse:open-search"))}
          >
            <Sparkles />
          </Button>
        </div>
      </div>

      {/* Child Selector */}
      {childList.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            {childList.length > 1 ? "Viewing child" : "Your child"}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={childList.length <= 1}>
              <button
                className="w-full flex items-center gap-3 rounded-2xl border border-border/60 bg-surface px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:opacity-90 disabled:cursor-default"
                aria-label="Switch child"
              >
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {selectedChild?.profile_image_url ? (
                    <img
                      src={selectedChild.profile_image_url}
                      alt={selectedChild.first_name ?? "Child"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (selectedChild?.first_name?.[0] ?? "S").toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {selectedChild
                      ? [selectedChild.first_name, selectedChild.last_name]
                          .filter(Boolean)
                          .join(" ")
                      : "Select child"}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {selectedChild
                      ? [selectedChild.class_name, selectedChild.section_name]
                          .filter(Boolean)
                          .join(" • ") || (selectedChild.roll_number ? `Roll ${selectedChild.roll_number}` : "Student")
                      : ""}
                  </span>
                </span>
                {childList.length > 1 && (
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {childList.map((child) => {
                const isActive = child.student_id === selectedChild?.student_id;
                return (
                  <DropdownMenuItem
                    key={child.student_id}
                    onClick={() => onSelectChild(child)}
                    className="gap-3 py-2"
                  >
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {child.profile_image_url ? (
                        <img
                          src={child.profile_image_url}
                          alt={child.first_name ?? "Child"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        (child.first_name?.[0] ?? "S").toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {[child.first_name, child.last_name].filter(Boolean).join(" ") || "Student"}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {[child.class_name, child.section_name].filter(Boolean).join(" • ") ||
                          (child.roll_number ? `Roll ${child.roll_number}` : "")}
                      </span>
                    </span>
                    {isActive && (
                      <Badge className="bg-primary/15 text-primary text-[10px] h-5 px-1.5">Active</Badge>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <nav className="mt-6 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-primary transition-all duration-300 ease-out"
            activeClassName="bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm border-l-[3px] border-primary font-bold"
            onClick={() => setMobileNavOpen(false)}
          >
            <span className="flex items-center gap-2">
              <item.icon className="h-4 w-4" /> {item.label}
            </span>
            {item.badge > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                {item.badge > 99 ? "99+" : item.badge}
              </Badge>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 rounded-2xl bg-accent p-4">
        <p className="text-sm font-medium text-accent-foreground">Parent Portal</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Monitor your child's attendance, grades, and school activities.
        </p>
      </div>

      <div className="mt-6">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-0">
      <GlobalCommandPalette basePath={basePath} />

      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-4 overflow-y-auto">
              <NavContent />
            </SheetContent>
          </Sheet>
          <div>
            <p className="font-display text-base font-semibold tracking-tight">{schoolName}</p>
            {selectedChild && (
              <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                {formatChildName(selectedChild)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <OfflineStatusIndicator
            isOnline={offline.isOnline}
            isSyncing={offline.isSyncing}
            stats={offline.stats}
            lastSyncAt={offline.lastSyncAt}
            syncProgress={offline.syncProgress}
            storageInfo={offline.storageInfo}
            onSync={offline.syncPendingItems}
            variant="compact"
          />
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="parent" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.dispatchEvent(new Event("eduverse:open-search"))}
          >
            <Sparkles className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="grid w-full grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[280px_1fr] lg:gap-6 lg:px-6 lg:py-6">
        {/* Desktop Sidebar */}
        <aside className="sticky top-6 hidden self-start max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl bg-surface p-4 shadow-elevated lg:block">
          <NavContent />
        </aside>

        {/* Main Content */}
        <section className="rounded-2xl bg-surface p-4 shadow-elevated lg:rounded-3xl lg:p-6">
          <header className="mb-4 hidden lg:mb-6 lg:block">
            <p className="font-display text-2xl font-semibold tracking-tight">{schoolName}</p>
            {selectedChild && (
              <p className="mt-1 text-sm text-muted-foreground">
                Viewing: <span className="font-medium text-foreground">{formatChildName(selectedChild)}</span>
              </p>
            )}
          </header>
          <div className="mb-4 lg:mb-5">
            <DashboardNotificationsBanner schoolId={schoolId} schoolSlug={schoolSlug} role="parent" />
          </div>
          {children}
        </section>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center justify-around gap-0.5 rounded-3xl border border-border/60 bg-background/90 px-1.5 py-1.5 shadow-elevated backdrop-blur-xl lg:hidden w-[calc(100%-1rem)] max-w-md">
        {bottomNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-muted-foreground transition-all duration-200 min-w-0"
            activeClassName="text-primary-foreground bg-primary shadow-soft"
          >
            <item.icon className="h-[18px] w-[18px]" />
            <span className="text-[9px] font-medium leading-tight truncate max-w-full">{item.label}</span>
            {"badge" in item && item.badge !== undefined && item.badge > 0 && (
              <span className="absolute -top-0.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[8px] font-bold text-destructive-foreground">
                {item.badge > 9 ? "9+" : item.badge}
              </span>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setMobileNavOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-muted-foreground transition-colors min-w-0"
        >
          <Menu className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-medium leading-tight">More</span>
        </button>
      </nav>

      {/* Floating offline indicator for desktop */}
      <div className="hidden lg:block">
        <OfflineStatusIndicator
          isOnline={offline.isOnline}
          isSyncing={offline.isSyncing}
          stats={offline.stats}
          lastSyncAt={offline.lastSyncAt}
          syncProgress={offline.syncProgress}
          storageInfo={offline.storageInfo}
          onSync={offline.syncPendingItems}
          variant="floating"
        />
      </div>
    </div>
  );
}
