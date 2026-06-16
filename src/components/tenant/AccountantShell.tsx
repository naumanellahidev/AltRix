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
        <div>
          <p className="font-display text-lg font-semibold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">AltRix</p>
          <p className="text-xs text-muted-foreground">/{schoolSlug} • Finance</p>
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
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="accountant" />
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

      <nav className="mt-6 space-y-1.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all duration-300 ease-out"
            activeClassName="bg-gradient-to-r from-blue-50/90 to-blue-50/40 text-blue-700 shadow-sm border-l-[3px] border-blue-600 font-bold"
            onClick={() => setMobileNavOpen(false)}
          >
            <span className="flex items-center gap-2.5">
              <item.icon className="h-4 w-4 shrink-0" /> {item.label}
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
        <p className="text-sm font-medium text-accent-foreground">Finance Portal</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage fees, invoices, payments, expenses, and generate financial reports.
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
    <div className="min-h-screen bg-[#f8fafc] pb-20 lg:pb-0">
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
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="accountant" />
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
        <aside className="sticky top-6 hidden self-start max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl bg-white/85 border border-slate-100 backdrop-blur-xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.02)] lg:block">
          <NavContent />
        </aside>

        {/* Main Content */}
        <section className="rounded-3xl bg-white border border-slate-100 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.02)] lg:p-6">
          <header className="mb-6 hidden lg:block">
            <p className="font-display text-2xl font-black text-slate-800 tracking-tight">{title}</p>
            {subtitle && <p className="mt-1 text-sm text-slate-500 font-medium">{subtitle}</p>}
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
