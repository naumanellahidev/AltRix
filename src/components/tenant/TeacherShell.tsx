import { PropsWithChildren, useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { VoiceController } from "@/components/common/VoiceController";
import { VOICE_COMMANDS } from "@/utils/voiceCommands";
import { toast } from "sonner";
import {
  BookCheck,
  BookOpen,
  Brain,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Mic,
  NotebookPen,
  PartyPopper,
  ShieldAlert,
  Sparkles,
  TableIcon,
  TrendingUp,
  Umbrella,
  Users,
  HeartHandshake,
} from "lucide-react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { DashboardNotificationsBanner } from "@/components/global/DashboardNotificationsBanner";
import { GlobalCommandPalette } from "@/components/global/GlobalCommandPalette";
import { NotificationsBell } from "@/components/global/NotificationsBell";
import { StaffAttendanceWidget } from "./StaffAttendanceWidget";
import { useTeacherBadges } from "@/hooks/useTeacherBadges";
import { useUnreadMessagesOptimized } from "@/hooks/useUnreadMessagesOptimized";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useOfflineUniversal } from "@/hooks/useOfflineUniversal";
import { OfflineStatusIndicator } from "@/components/offline/OfflineStatusIndicator";

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

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  schoolSlug: string;
}>;

export function TeacherShell({ title, subtitle, schoolSlug, children }: Props) {
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const { user } = useSession();
  
  // Use optimized tenant hook that caches and applies branding automatically
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.schoolId;
  
  const badges = useTeacherBadges(schoolId, user?.id ?? null);
  const { unreadCount: unreadAdminMessages, unreadParentCount } = useUnreadMessagesOptimized(schoolId, user?.id ?? null);

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
      const route = getNotificationTargetRoute(notification, schoolSlug, "teacher");
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
    role: "teacher",
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate(`/${schoolSlug}/auth`);
  };

  const handleVoiceCommand = (cmd: string) => {
    const cfg = VOICE_COMMANDS[cmd.toLowerCase().trim()];
    if (!cfg) {
      toast.error(`Unrecognized command: ${cmd}`);
      // audible feedback
      new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=').play();
      return;
    }
    if (cfg.roles && !cfg.roles.includes("teacher")) {
      toast.warning('Command not allowed for your role');
      return;
    }
    if (cfg.action === 'logout') {
      handleLogout();
      return;
    }
    if (cfg.route) {
      navigate(cfg.route);
    }
  };

  const basePath = `/${schoolSlug}/teacher`;

  const navItems = [
    { to: basePath, icon: LayoutGrid, label: "Dashboard", end: true, badge: 0 },
    { to: `${basePath}/timetable`, icon: CalendarDays, label: "Timetable", badge: 0 },
    { to: `${basePath}/attendance`, icon: ClipboardCheck, label: "Attendance", badge: 0 },
    { to: `${basePath}/students`, icon: Users, label: "My Students", badge: 0 },
    { to: `${basePath}/gradebook`, icon: TableIcon, label: "Gradebook", badge: 0 },
    { to: `${basePath}/assignments`, icon: FileText, label: "Assignments", badge: badges.pendingAssignments },
    { to: `${basePath}/homework`, icon: BookOpen, label: "Homework", badge: 0 },
    { to: `${basePath}/lesson-plans`, icon: BookCheck, label: "Lesson Planner", badge: 0 },
    { to: `${basePath}/diary`, icon: BookOpen, label: "Diary", badge: 0 },
    { to: `${basePath}/exams`, icon: GraduationCap, label: "Exams", badge: 0 },
    { to: `${basePath}/report-cards`, icon: FileText, label: "Report Cards", badge: 0 },
    { to: `${basePath}/progress`, icon: TrendingUp, label: "Student Progress", badge: 0 },
    { to: `${basePath}/reports`, icon: GraduationCap, label: "Reports", badge: 0 },
    { to: `${basePath}/messages`, icon: MessageSquare, label: "Messages", badge: unreadAdminMessages },
    { to: `${basePath}/parent-notes`, icon: HeartHandshake, label: "Parent Notes", badge: badges.unreadMessages },
    { to: `${basePath}/behavior`, icon: NotebookPen, label: "Behavior Notes", badge: 0 },
    { to: `${basePath}/complaints`, icon: ShieldAlert, label: "Complaints", badge: 0 },
    { to: `${basePath}/notices`, icon: Megaphone, label: "Notices", badge: 0 },
    { to: `${basePath}/holidays`, icon: PartyPopper, label: "Holidays", badge: 0 },
    { to: `${basePath}/presence-history`, icon: ClipboardCheck, label: "Presence History", badge: 0 },
    { to: `${basePath}/leaves`, icon: Umbrella, label: "Apply Leave", badge: 0 },
    { to: `${basePath}/ai-insights`, icon: Brain, label: "AI Insights", badge: 0 },
  ];

  const bottomNavItems = [
    { to: basePath, icon: LayoutGrid, label: "Home", end: true },
    { to: `${basePath}/messages`, icon: MessageSquare, label: "Messages", badge: unreadAdminMessages },
    { to: `${basePath}/attendance`, icon: ClipboardCheck, label: "Attendance" },
    { to: `${basePath}/students`, icon: Users, label: "Students" },
  ];

  const NavContent = () => (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-lg font-semibold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">AltRix</p>
          <p className="text-xs text-muted-foreground">/{schoolSlug} • Teacher</p>
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
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="teacher" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Voice command"
            onClick={() => setVoiceListening((prev) => !prev)}
            className={voiceListening ? "animate-pulse" : ""}
          >
            <Mic className="h-5 w-5" />
          </Button>
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

      <nav className="mt-6 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all duration-300 ease-out"
            activeClassName="bg-gradient-to-r from-blue-50/90 to-blue-50/40 text-blue-700 shadow-sm border-l-[3px] border-blue-600 font-bold"
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
        <p className="text-sm font-medium text-accent-foreground">Teacher Panel</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage your classes, students, and daily tasks.
        </p>
      </div>

      <div className="mt-6">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          onClick={handleLogout}
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
        <div className="flex items-center gap-3 min-w-0 flex-1">
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
          <div className="min-w-0">
            <p className="font-display text-base font-semibold tracking-tight truncate">{title}</p>
            {user?.email && (
              <p className="text-[11px] text-muted-foreground truncate">
                You are signed in as {user.email}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
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
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="teacher" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.dispatchEvent(new Event("eduverse:open-search"))}
          >
            <Sparkles className="h-5 w-5" />
          </Button>
          {schoolId && <StaffAttendanceWidget schoolId={schoolId} />}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleLogout}
            aria-label="Logout"
          >
            <LogOut className="h-5 w-5" />
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
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
                {user?.email && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    You are signed in as {user.email}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {schoolId && <StaffAttendanceWidget schoolId={schoolId} />}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="rounded-xl"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Logout
                </Button>
              </div>
            </div>
          </header>
          <div className="mb-4 lg:mb-5">
            <DashboardNotificationsBanner schoolId={schoolId} schoolSlug={schoolSlug} role="teacher" />
          </div>
          {children}
        </section>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t bg-background/95 px-2 py-2 backdrop-blur lg:hidden">
        {bottomNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-muted-foreground transition-colors relative"
            activeClassName="text-primary-foreground bg-primary shadow-sm"
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
            {"badge" in item && item.badge !== undefined && item.badge > 0 && (
              <span className="absolute -top-0.5 right-1/4 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-destructive-foreground">
                {item.badge > 9 ? "9+" : item.badge}
              </span>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setMobileNavOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-muted-foreground transition-colors"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">More</span>
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

      {/* Voice Controller */}
      {voiceListening && (
        <VoiceController
          onCommand={handleVoiceCommand}
          onClose={() => setVoiceListening(false)}
        />
      )}
    </div>
  );
}
