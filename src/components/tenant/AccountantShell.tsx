import { PropsWithChildren, useMemo, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LayoutGrid, LogOut, Sparkles, MessageSquare, Menu, FileText, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlobalCommandPalette } from "@/components/global/GlobalCommandPalette";
import { NotificationsBell } from "@/components/global/NotificationsBell";
import { StaffAttendanceWidget } from "./StaffAttendanceWidget";
import { useUnreadMessagesOptimized } from "@/hooks/useUnreadMessagesOptimized";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useSession } from "@/hooks/useSession";
import { useOfflineUniversal } from "@/hooks/useOfflineUniversal";
import { OfflineStatusIndicator } from "@/components/offline/OfflineStatusIndicator";
import { resolvePermissions } from "@/lib/permissions";

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  schoolSlug: string;
}>;

export function AccountantShell({ title, subtitle, schoolSlug, children }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user } = useSession();

  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.schoolId;
  const { unreadCount } = useUnreadMessagesOptimized(schoolId, user?.id ?? null);

  const offline = useOfflineUniversal({
    schoolId,
    userId: user?.id ?? null,
    role: "accountant",
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = `/${schoolSlug}/auth`;
  };

  const basePath = `/${schoolSlug}/accountant`;

  // Auto-derive sidebar from the same centralized permission resolver used by
  // the shared shells. This keeps the accountant shell, inherited finance
  // shells, route guards, and future NAV_CATALOG additions in lockstep.
  const navItems = useMemo(() => {
    const allowedGroups = new Set(["overview", "finance", "operations", "communication"]);
    const hidden = new Set(["finance", "notices", "holidays", "complaints", "counseling", "support"]);
    const financeOrder = new Map([
      ["", 0],
      ["finance", 1],
      ["fees", 2],
      ["invoices", 3],
      ["payments", 4],
      ["expenses", 5],
      ["payroll", 6],
      ["ledger", 7],
      ["vendors", 8],
      ["tax", 9],
      ["reports", 10],
      ["messages", 11],
    ]);

    return resolvePermissions(["accountant"]).visibleModules
      .filter((m) => allowedGroups.has(m.group) && !hidden.has(m.key))
      .sort((a, b) => (financeOrder.get(a.path) ?? 99) - (financeOrder.get(b.path) ?? 99))
      .map((m) => ({
        to: m.path ? `${basePath}/${m.path}` : basePath,
        icon: m.icon,
        label: m.label,
        end: !m.path,
        badge: m.key === "messages" ? unreadCount : 0,
      }));
  }, [basePath, unreadCount]);

  const bottomNavItems = [
    { to: basePath, icon: LayoutGrid, label: "Home", end: true },
    { to: `${basePath}/messages`, icon: MessageSquare, label: "Messages", badge: unreadCount },
    { to: `${basePath}/payments`, icon: CreditCard, label: "Payments" },
  ];

  const NavContent = () => (
    <>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            AltRix
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            /{schoolSlug} • Finance
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="accountant" />
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
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
            activeClassName="bg-primary text-primary-foreground shadow-soft hover:bg-primary hover:text-primary-foreground"
            onClick={() => setMobileNavOpen(false)}
          >
            <span className="flex items-center gap-2.5">
              <item.icon className="h-4 w-4 shrink-0" /> {item.label}
            </span>
            {item.badge > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px] rounded-full">
                {item.badge > 99 ? "99+" : item.badge}
              </Badge>
            )}
          </NavLink>
        ))}
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
          {schoolId && <StaffAttendanceWidget schoolId={schoolId} />}
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="accountant" />
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
          {children}
        </section>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center justify-around gap-0.5 rounded-3xl border border-border/60 bg-background/90 px-1.5 py-1.5 shadow-elevated backdrop-blur-xl lg:hidden w-[calc(100%-1rem)] max-w-md">
        {bottomNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === basePath}
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
    </div>
  );
}
