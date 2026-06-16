import { PropsWithChildren, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain,
  Building2,
  Coins,
  GraduationCap,
  HeartPulse,
  LayoutGrid,
  LifeBuoy,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Scale,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  ChevronDown,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlobalCommandPalette } from "@/components/global/GlobalCommandPalette";
import { NotificationsBell } from "@/components/global/NotificationsBell";
import { OwnerContextSwitcher } from "@/components/tenant/OwnerContextSwitcher";
import { useUnreadMessagesOptimized } from "@/hooks/useUnreadMessagesOptimized";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useSession } from "@/hooks/useSession";
import { useOfflineUniversal } from "@/hooks/useOfflineUniversal";
import { OfflineStatusIndicator } from "@/components/offline/OfflineStatusIndicator";
import { buildMergedNav, GROUP_LABELS, GROUP_ORDER, DROPDOWN_MAPPING } from "@/lib/role-navigation";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";


type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  schoolSlug: string;
}>;

export function OwnerShell({ title, subtitle, schoolSlug, children }: Props) {
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user } = useSession();
  
  // Use optimized tenant hook that caches and applies branding automatically
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.schoolId;
  const schoolName = tenant.school?.name || "";

  // Offline support
  const offline = useOfflineUniversal({
    schoolId,
    userId: user?.id ?? null,
    role: "school_owner",
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate(`/${schoolSlug}/auth`);
  };

  const { unreadCount } = useUnreadMessagesOptimized(schoolId, user?.id ?? null);

  const basePath = `/${schoolSlug}/school_owner`;

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

  const directNavItems = [
    { to: basePath, icon: LayoutGrid, label: "Overview", end: true },
    { to: `${basePath}/academics`, icon: GraduationCap, label: "Academics Intelligence" },
    { to: `${basePath}/admissions`, icon: TrendingUp, label: "Admissions & Growth" },
    { to: `${basePath}/finance`, icon: BarChart3, label: "Finance & Cashflow" },
    { to: `${basePath}/hr`, icon: Users, label: "HR & Culture" },
    { to: `${basePath}/ai`, icon: Sparkles, label: "AI Command Center" },
    { to: `${basePath}/messages`, icon: MessageSquare, label: "Messages", badge: unreadCount },
  ];

  const operationsItems = [
    { to: `${basePath}/wellbeing`, icon: HeartPulse, label: "Student Wellbeing" },
    { to: `${basePath}/compliance`, icon: Scale, label: "Compliance & Governance" },
    { to: `${basePath}/campuses`, icon: Building2, label: "Multi-Campus View" },
    { to: `${basePath}/brand`, icon: Star, label: "Brand & Experience" },
    { to: `${basePath}/security`, icon: Shield, label: "System & Security" },
  ];

  const strategyItems = [
    { to: `${basePath}/advisor`, icon: Brain, label: "AI Strategy Advisor" },
    { to: `${basePath}/support`, icon: LifeBuoy, label: "Support Tickets" },
  ];


  const inheritedNav = useMemo(() => {
    const executivePaths = new Set(["", "admissions", "fees", "support", "messages"]);
    const { grouped } = buildMergedNav(["school_owner"]);
    return GROUP_ORDER.map((group) => ({
      group,
      items: grouped[group].filter((item) => !executivePaths.has(item.path)),
    })).filter((section) => section.items.length > 0);
  }, []);

  const bottomNavItems = [
    { to: basePath, icon: LayoutGrid, label: "Overview" },
    { to: `${basePath}/finance`, icon: BarChart3, label: "Finance" },
    { to: `${basePath}/academics`, icon: GraduationCap, label: "Academics" },
    { to: `${basePath}/advisor`, icon: Brain, label: "AI Advisor" },
  ];

  const renderNativeDropdown = (
    groupKey: string,
    label: string,
    Icon: any,
    items: typeof operationsItems
  ) => {
    const urls = items.map(item => item.to);
    const isOpen = isGroupExpanded(groupKey, urls);
    const isActive = urls.some(url => location.pathname === url || location.pathname.startsWith(url + "/"));

    return (
      <div key={groupKey} className="space-y-0.5">
        <button
          onClick={() => toggleGroup(groupKey)}
          className={cn(
            "w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all duration-300 ease-out",
            isActive && "bg-gradient-to-r from-blue-50/90 to-blue-50/40 text-blue-700 font-bold border-l-[3px] border-blue-600"
          )}
        >
          <span className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
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
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all duration-300 ease-out"
                activeClassName="bg-gradient-to-r from-blue-50/90 to-blue-50/40 text-blue-700 shadow-sm border-l-[3px] border-blue-600 font-bold"
                onClick={() => setMobileNavOpen(false)}
              >
                <span className="flex items-center gap-2.5">
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {"badge" in item && typeof item.badge === "number" && item.badge > 0 && (
                  <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                    {item.badge > 99 ? "99+" : item.badge}
                  </Badge>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const NavContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent truncate">
            {schoolName || "AltRix"}
          </p>
          <p className="text-xs text-muted-foreground">School Owner • CEO View</p>
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
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="school_owner" />
          <Button
            variant="soft"
            size="icon"
            aria-label="Search"
            onClick={() => window.dispatchEvent(new Event("eduverse:open-search"))}
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <OwnerContextSwitcher schoolId={schoolId} schoolSlug={schoolSlug} />
      </div>

      <ScrollArea className="mt-6 flex-1">
        <nav className="space-y-1 pr-2">
          {directNavItems.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all duration-300 ease-out"
              activeClassName="bg-gradient-to-r from-blue-50/90 to-blue-50/40 text-blue-700 shadow-sm border-l-[3px] border-blue-600 font-bold"
              onClick={() => setMobileNavOpen(false)}
            >
              <span className="flex items-center gap-2.5">
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {"badge" in item && item.badge && item.badge > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                  {item.badge > 99 ? "99+" : item.badge}
                </Badge>
              )}
            </NavLink>
          ))}

          {/* Operations & Governance Dropdown */}
          {renderNativeDropdown("ops_gov", "Operations & Gov", Building2, operationsItems)}

          {/* Strategy & Support Dropdown */}
          {renderNativeDropdown("strategy_support", "Strategy & Support", Brain, strategyItems)}

          {directNavItems.slice(5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all duration-300 ease-out"
              activeClassName="bg-gradient-to-r from-blue-50/90 to-blue-50/40 text-blue-700 shadow-sm border-l-[3px] border-blue-600 font-bold"
              onClick={() => setMobileNavOpen(false)}
            >
              <span className="flex items-center gap-2.5">
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {"badge" in item && item.badge && item.badge > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                  {item.badge > 99 ? "99+" : item.badge}
                </Badge>
              )}
            </NavLink>
          ))}

          {inheritedNav.map(({ group, items }) => {
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
              <div key={group} className="pt-4 first:pt-0">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {GROUP_LABELS[group]}
                </p>
                <div className="space-y-1">
                  {directItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.key}
                        to={`${basePath}/${item.path}`}
                        className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all duration-300 ease-out"
                        activeClassName="bg-gradient-to-r from-blue-50/90 to-blue-50/40 text-blue-700 shadow-sm border-l-[3px] border-blue-600 font-bold"
                        onClick={() => setMobileNavOpen(false)}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </span>
                      </NavLink>
                    );
                  })}

                  {Object.entries(dropdownGroups).map(([groupKey, groupInfo]) => {
                    const childUrls = groupInfo.items.map(item => `${basePath}/${item.path}`);
                    const isOpen = isGroupExpanded(groupKey, childUrls);
                    const isDropdownActive = childUrls.some(url => location.pathname === url || location.pathname.startsWith(url + "/"));
                    const GroupIcon = groupInfo.icon;

                    return (
                      <div key={groupKey} className="space-y-0.5">
                        <button
                          onClick={() => toggleGroup(groupKey)}
                          className={cn(
                            "w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all duration-300 ease-out",
                            isDropdownActive && "bg-gradient-to-r from-blue-50/90 to-blue-50/40 text-blue-700 font-bold border-l-[3px] border-blue-600"
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
                              const Icon = item.icon;
                              return (
                                <NavLink
                                  key={item.key}
                                  to={`${basePath}/${item.path}`}
                                  className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-all duration-300 ease-out"
                                  activeClassName="bg-gradient-to-r from-blue-50/90 to-blue-50/40 text-blue-700 shadow-sm border-l-[3px] border-blue-600 font-bold"
                                  onClick={() => setMobileNavOpen(false)}
                                >
                                  <span className="flex items-center gap-2.5">
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                  </span>
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
        </nav>
      </ScrollArea>

      <div className="mt-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-4 border border-primary/10">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Executive Access</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Full visibility into institutional performance, finances, and strategy.
        </p>
      </div>

      <div className="mt-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
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
            <SheetContent side="left" className="w-[300px] p-4 overflow-y-auto">
              <NavContent />
            </SheetContent>
          </Sheet>
          <div>
            <p className="font-display text-base font-semibold tracking-tight">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <OwnerContextSwitcher schoolId={schoolId} schoolSlug={schoolSlug} compact />
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
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role="school_owner" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.dispatchEvent(new Event("eduverse:open-search"))}
          >
            <Sparkles className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="grid w-full grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[300px_1fr] lg:gap-6 lg:px-6 lg:py-6">
        {/* Desktop Sidebar */}
        <aside className="sticky top-6 hidden self-start max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl bg-surface p-4 shadow-elevated lg:block">
          <NavContent />
        </aside>

        {/* Main Content */}
        <main className="min-w-0">{children}</main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t bg-background/95 px-2 py-2 backdrop-blur lg:hidden">
        {bottomNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === basePath}
            className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-muted-foreground transition-colors relative"
            activeClassName="text-primary-foreground bg-primary shadow-sm"
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
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
