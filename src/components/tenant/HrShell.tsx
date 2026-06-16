import { PropsWithChildren, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Briefcase, Calendar, Coins, FileText, LayoutGrid, Megaphone, PartyPopper, Star, Users as UsersIcon, ClipboardList, Headphones, LogOut, Sparkles, MessageSquare, Menu, UserPlus, ClipboardCheck, LogOut as ExitIcon, Wallet, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlobalCommandPalette } from "@/components/global/GlobalCommandPalette";
import { NotificationsBell } from "@/components/global/NotificationsBell";
import { StaffAttendanceWidget } from "./StaffAttendanceWidget";
import { useUnreadMessagesOptimized } from "@/hooks/useUnreadMessagesOptimized";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useSession } from "@/hooks/useSession";
import { useOfflineUniversal } from "@/hooks/useOfflineUniversal";
import { OfflineStatusIndicator } from "@/components/offline/OfflineStatusIndicator";

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  schoolSlug: string;
}>;

export function HrShell({ title, subtitle, schoolSlug, children }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user } = useSession();
  
  // Use optimized tenant hook that caches and applies branding automatically
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.schoolId;
  const { unreadCount } = useUnreadMessagesOptimized(schoolId, user?.id ?? null);

  // Offline support
  const offline = useOfflineUniversal({
    schoolId,
    userId: user?.id ?? null,
    role: "hr_manager",
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = `/${schoolSlug}/auth`;
  };

  const basePath = `/${schoolSlug}/hr`;

  const navItems = [
    { to: basePath, icon: LayoutGrid, label: "Dashboard", end: true, badge: 0 },
    { to: `${basePath}/users`, icon: UsersIcon, label: "Staff Directory", badge: 0 },
    { to: `${basePath}/recruitment`, icon: UserPlus, label: "Recruitment", badge: 0 },
    { to: `${basePath}/onboarding`, icon: ClipboardCheck, label: "Onboarding", badge: 0 },
    { to: `${basePath}/offboarding`, icon: ExitIcon, label: "Offboarding", badge: 0 },
    { to: `${basePath}/attendance`, icon: ClipboardList, label: "Staff Attendance", badge: 0 },
    { to: `${basePath}/leaves`, icon: Calendar, label: "Leave Management", badge: 0 },
    { to: `${basePath}/salaries`, icon: Coins, label: "Salaries", badge: 0 },
    { to: `${basePath}/payroll`, icon: Wallet, label: "Payroll Runs", badge: 0 },
    { to: `${basePath}/contracts`, icon: FileText, label: "Contracts", badge: 0 },
    { to: `${basePath}/reviews`, icon: Star, label: "Performance Reviews", badge: 0 },
    { to: `${basePath}/documents`, icon: Briefcase, label: "Documents", badge: 0 },
    { to: `${basePath}/analytics`, icon: BarChart3, label: "HR Analytics", badge: 0 },
    { to: `${basePath}/notices`, icon: Megaphone, label: "Notices", badge: 0 },
    { to: `${basePath}/holidays`, icon: PartyPopper, label: "Holidays", badge: 0 },
    { to: `${basePath}/support`, icon: Headphones, label: "Support Inbox", badge: 0 },
    { to: `${basePath}/messages`, icon: MessageSquare, label: "Messages", badge: unreadCount },
  ];

  const bottomNavItems = [
    { to: basePath, icon: LayoutGrid, label: "Home", end: true },
    { to: `${basePath}/messages`, icon: MessageSquare, label: "Messages", badge: unreadCount },
    { to: `${basePath}/users`, icon: UsersIcon, label: "Staff" },
    { to: `${basePath}/leaves`, icon: Calendar, label: "Leaves" },
  ];

  const NavContent = () => (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-lg font-semibold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">AltRix</p>
          <p className="text-xs text-muted-foreground">/{schoolSlug} • HR</p>
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
          {schoolId && <StaffAttendanceWidget schoolId={schoolId} />}
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="hr_manager" />
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
        <p className="text-sm font-medium text-accent-foreground">HR Portal</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage staff, leave requests, attendance, salaries, contracts, and reviews.
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
            <p className="font-display text-base font-semibold tracking-tight">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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
          {schoolId && <StaffAttendanceWidget schoolId={schoolId} />}
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="hr_manager" />
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
            <p className="font-display text-2xl font-semibold tracking-tight">{title}</p>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </header>
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
    </div>
  );
}
