import { ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Users2,
  ShieldCheck,
  Activity,
  Receipt,
  ScrollText,
  Settings,
  LogOut,
  Crown,
  Search,
  MessageSquare,
  Cpu,
  Database,
  Globe,
  TrendingUp,
  Zap,
  Menu,
  X,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlobalCommandPalette } from "@/components/global/GlobalCommandPalette";

type Item = { label: string; to: string; icon: any; badge?: string };

const NAV: { section: string; items: Item[] }[] = [
  {
    section: "Executive Control",
    items: [
      { label: "01. Executive Overview HQ", to: "/super_admin", icon: LayoutDashboard },
      { label: "02. Tenant Portfolio", to: "/super_admin/schools", icon: Building2 },
      { label: "03. Global User Matrix", to: "/super_admin/directory", icon: Users2 },
    ],
  },
  {
    section: "Monetization & Scale",
    items: [
      { label: "04. Revenue & Subscriptions", to: "/super_admin/billing", icon: Receipt },
      { label: "05. Financial Telemetry", to: "/super_admin/revenue", icon: TrendingUp },
      { label: "06. Feature Flag Matrix", to: "/super_admin/addons", icon: Cpu, badge: "14 Modules" },
    ],
  },
  {
    section: "Infrastructure & Security",
    items: [
      { label: "07. Database & Storage HQ", to: "/super_admin/database", icon: Database },
      { label: "08. Custom Domains & SSL", to: "/super_admin/domains", icon: Globe },
      { label: "09. Security & Audit Stream", to: "/super_admin/security", icon: ShieldCheck },
      { label: "10. System Health & SLA", to: "/super_admin/health", icon: Activity, badge: "99.99%" },
      { label: "11. Customer Support Desk", to: "/super_admin/support", icon: MessageSquare },
      { label: "12. Enterprise Keys & AI", to: "/super_admin/settings", icon: Settings },
    ],
  },
];

type Props = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function SuperAdminShell({ title, subtitle, actions, children }: Props) {
  const { user } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("super-admin-mode", "light-theme");
    return () => {
      document.body.classList.remove("super-admin-mode", "light-theme");
    };
  }, []);

  // Close mobile drawer whenever location changes
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileNavOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileNavOpen) {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavOpen]);

  const signOut = async () => {
    await api.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const isActive = (to: string) => {
    if (to === "/super_admin") return pathname === "/super_admin";
    return pathname.startsWith(to);
  };

  const openSearch = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  };

  const renderNavLinks = (onItemClick?: () => void) => (
    <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-6 custom-sidebar-scrollbar">
      {NAV.map((group) => (
        <div key={group.section}>
          <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-slate-400 font-extrabold">
            {group.section}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = isActive(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => {
                      if (onItemClick) onItemClick();
                    }}
                    className={`flex items-center justify-between px-3 py-2.5 text-xs rounded-xl transition-all duration-200 group ${
                      active
                        ? "bg-gradient-to-r from-blue-600/15 via-indigo-600/10 to-transparent text-blue-700 border-l-4 border-blue-600 font-black shadow-xs"
                        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 font-semibold"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          active ? "text-blue-600 font-bold" : "text-slate-400 group-hover:text-slate-700"
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border shrink-0 ${
                          active
                            ? "bg-blue-100 text-blue-800 border-blue-300 font-black"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const renderUserFooter = () => (
    <div className="p-3 border-t border-slate-200/90 bg-slate-50/80 shrink-0">
      <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-sm shrink-0"
          style={{ background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)" }}
        >
          {(user?.email || "A").slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-800 truncate">{user?.email}</p>
          <div className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-blue-600 shrink-0" />
            <p className="text-[10px] text-blue-700 font-semibold truncate">Platform Super Admin</p>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg shrink-0"
          onClick={signOut}
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen flex w-full text-slate-900 bg-slate-50 font-sans selection:bg-blue-500/20 selection:text-blue-900 relative overflow-x-hidden"
      style={{
        background:
          "radial-gradient(1200px 600px at 15% -10%, rgba(37, 99, 235, 0.05), transparent 70%)," +
          "radial-gradient(900px 600px at 105% 10%, rgba(99, 102, 241, 0.04), transparent 55%)," +
          "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
      }}
    >
      {/* Mobile Slide-Over Drawer Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs transition-opacity lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Slide-Over Navigation Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[84vw] max-w-xs sm:w-80 bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden border-r border-slate-200 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Mobile Drawer Header */}
        <div className="p-4 border-b border-slate-200/90 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center border border-blue-400/30 shadow-md shadow-blue-500/20 shrink-0"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 50%, #7c3aed 100%)",
              }}
            >
              <Crown className="h-4.5 w-4.5 text-white font-black" />
            </div>
            <div className="leading-tight min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-[0.2em] text-blue-700 font-black">
                  ALTRIX ENTERPRISE
                </span>
                <span className="flex h-1.5 w-1.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-600"></span>
                </span>
              </div>
              <p className="text-xs font-black text-slate-900 tracking-tight truncate">
                COMMAND & CONTROL
              </p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg shrink-0"
            onClick={() => setMobileNavOpen(false)}
            title="Close navigation"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Mobile Nav Links */}
        {renderNavLinks(() => setMobileNavOpen(false))}

        {/* Mobile User Identity Footer */}
        {renderUserFooter()}
      </div>

      {/* Desktop Sidebar (lg and above) - Sticky with independent scroll */}
      <aside className="hidden lg:flex w-72 shrink-0 border-r border-slate-200/90 flex-col backdrop-blur-xl bg-white/90 shadow-xs sticky top-0 h-screen overflow-hidden">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-200/90 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center border border-blue-400/30 shadow-md shadow-blue-500/20 shrink-0"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 50%, #7c3aed 100%)",
              }}
            >
              <Crown className="h-5 w-5 text-white font-black" />
            </div>
            <div className="leading-tight flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.22em] text-blue-700 font-extrabold">
                  ALTRIX ENTERPRISE
                </span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                </span>
              </div>
              <p className="text-sm font-black text-slate-900 tracking-tight truncate">
                COMMAND & CONTROL
              </p>
            </div>
          </div>
        </div>

        {/* Desktop Nav Links */}
        {renderNavLinks()}

        {/* Desktop User Identity Footer */}
        {renderUserFooter()}
      </aside>

      {/* Main Command Workspace */}
      <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden">
        {/* Responsive Header Bar */}
        <header className="h-15 sm:h-16 px-3 sm:px-6 lg:px-8 flex items-center justify-between border-b border-slate-200/90 sticky top-0 z-30 backdrop-blur-xl bg-white/90 shadow-xs gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {/* Mobile Hamburger Toggle Button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-9 w-9 -ml-1 text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-xl shrink-0"
              onClick={() => setMobileNavOpen(true)}
              title="Open Navigation"
              aria-label="Open Navigation Menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                  HQ COMMAND
                </span>
                <h1 className="text-xs sm:text-sm md:text-base font-extrabold tracking-tight text-slate-900 truncate">
                  {title || "Super Master Admin HQ"}
                </h1>
              </div>
              {subtitle && (
                <p className="text-[10px] sm:text-xs text-slate-500 truncate hidden xs:block sm:block mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* SLA Badge (Desktop) */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono text-blue-800 font-bold">
              <Zap className="h-3.5 w-3.5 text-blue-600" />
              <span>SLA: 99.99%</span>
            </div>

            {/* Omni-search trigger for mobile/tablet */}
            <Button
              variant="outline"
              size="icon"
              className="md:hidden h-8 w-8 bg-slate-50 border-slate-200 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg shadow-2xs shrink-0"
              onClick={openSearch}
              title="Global Search (Ctrl+K)"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>

            {/* Desktop Omni-search bar */}
            <div className="relative hidden md:block" onClick={openSearch}>
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                readOnly
                placeholder="Omni-search (Ctrl+K)..."
                className="pl-9 h-8.5 w-56 lg:w-64 bg-slate-100/90 border-slate-200 text-slate-800 placeholder:text-slate-400 focus-visible:ring-blue-500/30 focus-visible:border-blue-500 cursor-pointer text-xs"
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-mono px-1.5 py-0.5 bg-white border border-slate-200 text-slate-400 rounded font-semibold">
                ⌘K
              </kbd>
            </div>

            {/* Page Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {actions}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden super-admin-scope bg-slate-100/60 p-3 sm:p-5 md:p-6 lg:p-8 w-full max-w-full">
          {children}
        </main>
      </div>

      <GlobalCommandPalette basePath="/super_admin" />
    </div>
  );
}
