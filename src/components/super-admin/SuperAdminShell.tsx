import { ReactNode, useEffect } from "react";
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
  Radio,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

  useEffect(() => {
    document.body.classList.add("super-admin-mode", "light-theme");
    return () => {
      document.body.classList.remove("super-admin-mode", "light-theme");
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const isActive = (to: string) => {
    if (to === "/super_admin") return pathname === "/super_admin";
    return pathname.startsWith(to);
  };

  return (
    <div
      className="min-h-screen flex w-full text-slate-900 bg-slate-50 font-sans selection:bg-blue-500/20 selection:text-blue-900"
      style={{
        background:
          "radial-gradient(1200px 600px at 15% -10%, rgba(37, 99, 235, 0.05), transparent 70%)," +
          "radial-gradient(900px 600px at 105% 10%, rgba(99, 102, 241, 0.04), transparent 55%)," +
          "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
      }}
    >
      {/* Sidebar */}
      <aside
        className="w-72 shrink-0 border-r border-slate-200/90 flex flex-col backdrop-blur-xl bg-white/90 shadow-sm"
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-200/90 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center border border-blue-400/30 shadow-md shadow-blue-500/20"
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

        {/* Navigation Grid */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
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
                        className={`flex items-center justify-between px-3 py-2.5 text-xs rounded-lg transition-all duration-200 group ${
                          active
                            ? "bg-gradient-to-r from-blue-600/10 via-indigo-600/5 to-transparent text-blue-700 border-l-4 border-blue-600 font-extrabold shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${active ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
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

        {/* User Identity Footer */}
        <div className="p-3 border-t border-slate-200/90 bg-slate-50/80">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white border border-slate-200 shadow-sm">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-md"
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
              className="h-7 w-7 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
              onClick={signOut}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Command Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="h-16 px-8 flex items-center justify-between border-b border-slate-200/90 sticky top-0 z-30 backdrop-blur-xl bg-white/90 shadow-sm"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                  HQ COMMAND
                </span>
                <h1 className="text-base font-extrabold tracking-tight text-slate-900 truncate">
                  {title || "Super Master Admin HQ"}
                </h1>
              </div>
              {subtitle && (
                <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono text-blue-800 font-bold">
              <Zap className="h-3.5 w-3.5 text-blue-600" />
              <span>SLA Uptime: 99.99%</span>
            </div>
            <div className="relative hidden md:block">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Omni-search tenants, owners, logs..."
                className="pl-9 h-9 w-72 bg-slate-100/80 border-slate-200 text-slate-800 placeholder:text-slate-400 focus-visible:ring-blue-500/30 focus-visible:border-blue-500"
              />
            </div>
            {actions}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto super-admin-scope bg-slate-100/60">
          {(title || subtitle) && (
            <div
              className="border-b border-slate-200/80 bg-gradient-to-b from-white to-transparent"
            >
              <div className="w-full px-8 py-6 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-blue-600 animate-pulse" />
                    <p className="text-[10px] uppercase tracking-[0.25em] font-extrabold text-blue-700">
                      ALTRIX HQ REAL-TIME TELEMETRY
                    </p>
                  </div>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 truncate">
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="text-sm text-slate-500 mt-1 truncate">{subtitle}</p>
                  )}
                </div>
                <div
                  className="hidden md:flex h-12 w-12 rounded-xl items-center justify-center border border-blue-200 shadow-md shadow-blue-500/10"
                  style={{
                    background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
                  }}
                >
                  <Crown className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          )}
          <div className="w-full p-8">{children}</div>
        </main>
      </div>
      <GlobalCommandPalette basePath="/super_admin" />
    </div>
  );
}
