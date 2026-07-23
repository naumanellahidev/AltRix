import { PropsWithChildren, useMemo, useState, useEffect } from "react";
import { OfflineStatusIndicator } from "@/components/offline/OfflineStatusIndicator";
import { useNavigate, useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { LogOut, Menu, Settings, Sparkles, Mic, GraduationCap, MessageSquare, Users, LayoutGrid, CalendarDays, ClipboardCheck, FileSpreadsheet, HeartHandshake, ChevronDown, Activity } from "lucide-react";
import type { EduverseRole } from "@/lib/eduverse-roles";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { GlobalCommandPalette } from "@/components/global/GlobalCommandPalette";
import { NotificationsBell } from "@/components/global/NotificationsBell";
import { VoiceController } from "@/components/common/VoiceController";
import { VOICE_COMMANDS } from "@/utils/voiceCommands";
import { DashboardNotificationsBanner } from "@/components/global/DashboardNotificationsBanner";
import { useUnreadMessagesOptimized } from "@/hooks/useUnreadMessagesOptimized";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useSession } from "@/hooks/useSession";
import { useUserRole } from "@/hooks/useUserRole";
import { useOfflineUniversal } from "@/hooks/useOfflineUniversal";
import { buildMergedNav, GROUP_LABELS, GROUP_ORDER, DROPDOWN_MAPPING } from "@/lib/role-navigation";
import { resolvePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { StaffAttendanceWidget } from "./StaffAttendanceWidget";

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
  if (t.includes("report_card") || t.includes("report-card") || t.includes("reportcard")) {
    const suffix = notification.entity_id ? `?view_card=${notification.entity_id}` : "";
    return role === "student" || role === "parent"
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
  role: EduverseRole;
  schoolSlug: string;
}>;

export function TenantShell({ title, subtitle, role, schoolSlug, children }: Props) {
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
const [voiceOpen, setVoiceOpen] = useState(false);
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const isGroupExpanded = (groupKey: string, childUrls: string[]) => {
    if (expandedGroups[groupKey] !== undefined) {
      return expandedGroups[groupKey];
    }
    return childUrls.some(
      (url) => location.pathname === url || location.pathname.startsWith(url + "/")
    );
  };

  const { user } = useSession();


  // Use optimized tenant hook that caches and applies branding automatically
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.schoolId;

  const isStaff = useMemo(() => {
    return ["teacher", "principal", "vice_principal", "academic_coordinator", "counselor", "hr_manager", "accountant", "marketing_staff"].includes(role);
  }, [role]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = `/${schoolSlug}/auth`;
  };

  const handleVoiceCommand = (cmd: string) => {
    const key = cmd.toLowerCase().trim();
    const cfg = VOICE_COMMANDS[key];

    if (!cfg) {
      import("sonner").then(({ toast }) => toast.error(`Unknown command: "${cmd}"`));
      return;
    }
    if (cfg.roles && cfg.roles.length > 0 && !cfg.roles.includes(role as any)) {
      import("sonner").then(({ toast }) => toast.warning("Command not available for your role"));
      return;
    }

    // Audible confirmation via Web Speech API
    const speak = (text: string) => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.volume = 0.6; u.rate = 1.1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch { /* silently ignore if speechSynthesis unsupported */ }
    };

    if (cfg.action === "logout") { speak("Signing out"); handleLogout(); return; }
    if (cfg.action === "open-search") {
      speak("Opening search");
      window.dispatchEvent(new Event("eduverse:open-search"));
      return;
    }
    if (cfg.route !== undefined) {
      const fullPath = `/${schoolSlug}/${role}${cfg.route}`;
      speak(`Opening ${key}`);
      navigate(fullPath);
    }
  };


  // Offline support
  const offline = useOfflineUniversal({
    schoolId,
    userId: user?.id ?? null,
    role,
  });
  const { unreadCount, unreadParentCount } = useUnreadMessagesOptimized(schoolId, user?.id ?? null);

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
      
      // Navigate to route
      const route = getNotificationTargetRoute(notification, schoolSlug, role);
      navigate(route);
    };

    window.addEventListener("eduverse:open-notification", handleOpenNotification as EventListener);
    return () => {
      window.removeEventListener("eduverse:open-notification", handleOpenNotification as EventListener);
    };
  }, [schoolSlug, role, navigate]);

  // WordPress-style permission-driven sidebar.
  // The catalog is filtered by the union of the user's actual assigned roles
  // (read from user_roles). The visible URL role prefix stays as the current
  // route's role so existing dashboards & routes keep working unchanged.
  const { roles: assignedRoles } = useUserRole(schoolId, user?.id ?? null);
  const effectiveRoles = useMemo<EduverseRole[]>(() => {
    // Fall back to the current shell role until roles load, so the UI never
    // flashes empty for users whose user_roles row hasn't loaded yet.
    if (assignedRoles.length === 0) return [role];
    // Always include the current shell role (defensive).
    return Array.from(new Set<EduverseRole>([...assignedRoles, role]));
  }, [assignedRoles, role]);

  // Fetch feature flags to enforce Super Master Admin module controls per school tenant
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!schoolId) return;
    apiClient.get(`/feature-flags/${schoolId}`).then((res) => {
      if (res.data) setFeatureFlags(res.data);
    }).catch(() => {});
  }, [schoolId]);

  // Build sidebar from the centralized permission resolver so visibility
  // stays in lockstep with route-guard access checks.
  const { grouped } = useMemo(() => {
    const perms = resolvePermissions(effectiveRoles);

    const flagPathMap: Record<string, string> = {
      transport: "transport_enabled",
      library: "library_enabled",
      "student-wellbeing": "wellbeing_enabled",
      inventory: "inventory_enabled",
      alumni: "alumni_enabled",
      hostel: "hostel_enabled",
      "doc-management": "document_cert_enabled",
      "public-admissions": "public_admissions_enabled",
    };

    const items = perms.visibleModules.filter((item) => {
      const flagKey = flagPathMap[item.path];
      if (flagKey && featureFlags[flagKey] === false) {
        return false;
      }
      return true;
    });

    const g: Record<string, typeof items> = {
      overview: [], academics: [], people: [], finance: [],
      operations: [], communication: [], admin: [],
    };
    for (const it of items) g[it.group].push(it);
    return { grouped: g as ReturnType<typeof buildMergedNav>["grouped"] };
  }, [effectiveRoles, featureFlags]);

  // Mobile bottom bar ΓÇö role-aware. Keep to 5 items + "More" so nothing overflows.
  const bottomNavItems = useMemo<Array<{ to: string; icon: typeof LayoutGrid; label: string; badge?: number }>>(() => {
    const base = (path: string) => `/${schoolSlug}/${role}${path ? `/${path}` : ""}`;
    const home = { to: base(""), icon: LayoutGrid, label: "Home" };
    const messages = { to: base("messages"), icon: MessageSquare, label: "Messages", badge: unreadCount };

    if (role === "academic_coordinator") {
      return [
        home,
        { to: base("academic"), icon: GraduationCap, label: "Academic" },
        { to: base("timetable"), icon: CalendarDays, label: "Timetable" },
        { to: base("attendance"), icon: ClipboardCheck, label: "Attend" },
        { to: base("exams"), icon: FileSpreadsheet, label: "Exams" },
      ];
    }

    return [
      home,
      messages,
      { to: base("academic"), icon: GraduationCap, label: "Academic" },
      { to: base("users"), icon: Users, label: "Staff" },
    ];
  }, [role, schoolSlug, unreadCount]);

  const NavContent = () => (
    <>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-tight bg-gradient-to-r from-brand to-brand/60 bg-clip-text text-transparent">
            AltRix
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {tenant.school?.name ?? schoolSlug} • {role}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role={role} />
            {/* Voice Button */}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Voice command"
              onClick={() => setVoiceOpen(true)}
              className="rounded-xl"
            >
              <Mic className="h-5 w-5" />
            </Button>
          <Button
            variant="soft"
            size="icon"
            aria-label="Search"
            className="rounded-xl"
            onClick={() => window.dispatchEvent(new Event("eduverse:open-search"))}
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="mt-5 space-y-3">
        {GROUP_ORDER.map((g) => {
          const items = grouped[g];
          if (!items?.length) return null;

          const directItems: typeof items = [];
          const dropdownGroups: Record<string, { label: string; icon: any; items: typeof items }> = {};

          items.forEach((item) => {
            const mapping = DROPDOWN_MAPPING[item.key];
            if (mapping) {
              if (!dropdownGroups[mapping.groupKey]) {
                dropdownGroups[mapping.groupKey] = {
                  label: mapping.label,
                  icon: mapping.icon,
                  items: []
                };
              }
              dropdownGroups[mapping.groupKey].items.push(item);
            } else {
              directItems.push(item);
            }
          });

          return (
            <div key={g}>
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {GROUP_LABELS[g]}
              </p>
              <div className="space-y-0.5">
                {/* Direct Items */}
                {directItems.map((item) => {
                  const to = item.path ? `/${schoolSlug}/${role}/${item.path}` : `/${schoolSlug}/${role}`;
                  const badge = item.key === "messages" 
                    ? unreadCount 
                    : item.key === "parent-notes" 
                      ? unreadParentCount 
                      : 0;
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.key}
                      to={to}
                      end={!item.path}
                      className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-primary transition-all duration-300 ease-out"
                      activeClassName="bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm border-l-[3px] border-primary font-bold"
                      onClick={() => setMobileNavOpen(false)}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" /> {item.label}
                      </span>
                      {badge > 0 && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-[10px] rounded-full">
                          {badge > 99 ? "99+" : badge}
                        </Badge>
                      )}
                    </NavLink>
                  );
                })}

                {/* Collapsible Dropdown Groups */}
                {Object.entries(dropdownGroups).map(([groupKey, groupInfo]) => {
                  const childUrls = groupInfo.items.map(item =>
                    item.path ? `/${schoolSlug}/${role}/${item.path}` : `/${schoolSlug}/${role}`
                  );
                  const isOpen = isGroupExpanded(groupKey, childUrls);
                  const isDropdownActive = childUrls.some(url => location.pathname === url || location.pathname.startsWith(url + "/"));
                  const GroupIcon = groupInfo.icon;

                  return (
                    <div key={groupKey} className="space-y-0.5">
                      <button
                        onClick={() => toggleGroup(groupKey)}
                        className={cn(
                          "w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-primary transition-all duration-300 ease-out",
                          isDropdownActive && "bg-gradient-to-r from-primary/10 to-primary/5 text-primary font-bold border-l-[3px] border-primary"
                        )}
                      >
                        <span className="flex items-center gap-2.5">
                          <GroupIcon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{groupInfo.label}</span>
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 transition-transform duration-200 text-muted-foreground/60",
                            isOpen ? "rotate-180" : "rotate-0"
                          )}
                        />
                      </button>

                      <div
                        className={cn(
                          "overflow-hidden transition-all duration-200 ease-in-out",
                          isOpen ? "max-h-[500px] opacity-100 mt-0.5" : "max-h-0 opacity-0 pointer-events-none"
                        )}
                      >
                        <div className="pl-4 ml-3 border-l border-border/40 space-y-0.5">
                          {groupInfo.items.map((item) => {
                            const to = item.path ? `/${schoolSlug}/${role}/${item.path}` : `/${schoolSlug}/${role}`;
                            const badge = item.key === "messages" 
                              ? unreadCount 
                              : item.key === "parent-notes" 
                                ? unreadParentCount 
                                : 0;
                            const Icon = item.icon;
                            return (
                              <NavLink
                                key={item.key}
                                to={to}
                                className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-primary transition-all duration-300 ease-out"
                                activeClassName="bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm border-l-[3px] border-primary font-bold"
                                onClick={() => setMobileNavOpen(false)}
                              >
                                <span className="flex items-center gap-2.5">
                                  <Icon className="h-4 w-4 shrink-0" /> {item.label}
                                </span>
                                {badge > 0 && (
                                  <Badge variant="destructive" className="h-5 px-1.5 text-[10px] rounded-full">
                                    {badge > 99 ? "99+" : badge}
                                  </Badge>
                                )}
                              </NavLink>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <NavLink
          to={`/${schoolSlug}/${role}?settings=1`}
          end
          className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-primary transition-all duration-300 ease-out"
          activeClassName="bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm border-l-[3px] border-primary font-bold"
          onClick={() => setMobileNavOpen(false)}
        >
          <span className="flex items-center gap-2.5">
            <Settings className="h-4 w-4 shrink-0" /> Settings
          </span>
        </NavLink>
      </nav>

      <div className="mt-5 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-accent/40 to-transparent p-4">
        <p className="text-sm font-semibold text-foreground">All systems online</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Modules light up as your school activates them.
        </p>
      </div>

      <div className="mt-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 rounded-xl text-muted-foreground hover:text-destructive"
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
      <GlobalCommandPalette basePath={`/${schoolSlug}/${role}`} />

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
            <p className="font-display text-base font-semibold tracking-tight truncate text-brand opacity-80">{title}</p>
            {user?.email && (
              <p className="text-[11px] text-brand opacity-80 truncate">
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
          {schoolId && <StaffAttendanceWidget schoolId={schoolId} />}
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role={role} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            onClick={() => window.dispatchEvent(new Event("eduverse:open-search"))}
          >
            <Sparkles className="h-5 w-5" />
          </Button>
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
                <h1 className="font-display text-2xl font-semibold tracking-tight text-brand opacity-80">{title}</h1>
                {user?.email && (
                  <p className="mt-1 text-sm text-brand opacity-80">
                    You are signed in as {user.email}
                  </p>
                )}
              </div>


              <div className="flex items-center gap-3 shrink-0">
                {schoolId && isStaff && <StaffAttendanceWidget schoolId={schoolId} />}
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
            <DashboardNotificationsBanner schoolId={schoolId} schoolSlug={schoolSlug} role={role} />
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
            end={item.to === `/${schoolSlug}/${role}`}
            className="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-muted-foreground transition-all duration-200 min-w-0"
            activeClassName="text-primary-foreground bg-primary shadow-soft"
          >
            <item.icon className="h-[18px] w-[18px]" />
            <span className="text-[9px] font-medium leading-tight truncate max-w-full">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
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
      {voiceOpen && (
        <VoiceController
          onCommand={handleVoiceCommand}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </div>
  );
}
