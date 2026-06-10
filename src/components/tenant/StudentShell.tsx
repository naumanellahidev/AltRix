import { PropsWithChildren, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BookOpen, CalendarDays, FileText, GraduationCap, Headphones, LayoutGrid, Megaphone, NotebookPen, ScrollText, MessageSquare, Sparkles, Menu, LogOut, Brain, PartyPopper, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlobalCommandPalette } from "@/components/global/GlobalCommandPalette";
import { NotificationsBell } from "@/components/global/NotificationsBell";
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

export function StudentShell({ title, subtitle, schoolSlug, children }: Props) {
  const navigate = useNavigate();
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
    role: "student",
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate(`/${schoolSlug}/auth`);
  };

  const basePath = `/${schoolSlug}/student`;

  const navItems = [
    { to: basePath, icon: LayoutGrid, label: "Home", end: true, badge: 0 },
    { to: `${basePath}/ai-insights`, icon: Brain, label: "AI Insights", badge: 0 },
    { to: `${basePath}/attendance`, icon: CalendarDays, label: "Attendance", badge: 0 },
    { to: `${basePath}/grades`, icon: BookOpen, label: "Grades", badge: 0 },
    { to: `${basePath}/timetable`, icon: ScrollText, label: "Timetable", badge: 0 },
    { to: `${basePath}/assignments`, icon: ScrollText, label: "Assignments", badge: 0 },
    { to: `${basePath}/exams`, icon: GraduationCap, label: "Exams", badge: 0 },
    { to: `${basePath}/report-card`, icon: FileText, label: "Report Card", badge: 0 },
    { to: `${basePath}/diary`, icon: NotebookPen, label: "Diary", badge: 0 },
    { to: `${basePath}/notices`, icon: Megaphone, label: "Notices", badge: 0 },
    { to: `${basePath}/holidays`, icon: PartyPopper, label: "Holidays", badge: 0 },
    { to: `${basePath}/certificates`, icon: GraduationCap, label: "Certificates", badge: 0 },
    { to: `${basePath}/messages`, icon: MessageSquare, label: "Messages", badge: unreadCount },
    { to: `${basePath}/complaints`, icon: ShieldAlert, label: "Complaints", badge: 0 },
    { to: `${basePath}/support`, icon: Headphones, label: "Support", badge: 0 },
  ];

  const bottomNavItems = [
    { to: basePath, icon: LayoutGrid, label: "Home", end: true },
    { to: `${basePath}/messages`, icon: MessageSquare, label: "Messages", badge: unreadCount },
    { to: `${basePath}/grades`, icon: BookOpen, label: "Grades" },
    { to: `${basePath}/attendance`, icon: CalendarDays, label: "Attendance" },
  ];

  const NavContent = () => (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-lg font-semibold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">AltRix</p>
          <p className="text-xs text-muted-foreground">/{schoolSlug} • Student</p>
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
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="student" />
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
            className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
            activeClassName="bg-primary text-primary-foreground shadow-sm"
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
        <p className="text-sm font-medium text-accent-foreground">Student Portal</p>
        <p className="mt-1 text-xs text-muted-foreground">
          View your classes, assignments, and academic progress.
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
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="student" />
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
          {/* Desktop Header */}
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="rounded-xl"
          >
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
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
