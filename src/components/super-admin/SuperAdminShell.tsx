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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlobalCommandPalette } from "@/components/global/GlobalCommandPalette";

type Item = { label: string; to: string; icon: any; badge?: string };

const NAV: { section: string; items: Item[] }[] = [
  {
    section: "Platform",
    items: [
      { label: "Overview", to: "/super_admin", icon: LayoutDashboard },
      { label: "Schools", to: "/super_admin/schools", icon: Building2 },
      { label: "Support Center", to: "/super_admin/support", icon: MessageSquare },
      { label: "Owners & Admins", to: "/super_admin/directory", icon: Users2 },
    ],
  },
  {
    section: "Operations",
    items: [
      { label: "Billing & Plans", to: "/super_admin/billing", icon: Receipt },
      { label: "Revenue & Analytics", to: "/super_admin/revenue", icon: TrendingUp },
      { label: "Add-ons & Modules", to: "/super_admin/addons", icon: Cpu },
      { label: "Audit Log", to: "/super_admin/audit", icon: ScrollText },
      { label: "System Health", to: "/super_admin/health", icon: Activity },
    ],
  },
  {
    section: "System",
    items: [
      { label: "Database & Backups", to: "/super_admin/database", icon: Database },
      { label: "Domains & Branding", to: "/super_admin/domains", icon: Globe },
      { label: "Security", to: "/super_admin/security", icon: ShieldCheck },
      { label: "Settings", to: "/super_admin/settings", icon: Settings },
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
    document.body.classList.add("super-admin-mode");
    return () => {
      document.body.classList.remove("super-admin-mode");
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
      className="min-h-screen flex w-full text-zinc-100"
      style={{
        background:
          "radial-gradient(1200px 600px at 10% -10%, hsl(45 80% 50% / 0.12), transparent 70%)," +
          "radial-gradient(900px 600px at 110% 10%, hsl(35 70% 50% / 0.08), transparent 55%)," +
          "linear-gradient(180deg, hsl(20 10% 4%), hsl(0 0% 1%))",
      }}
    >
      {/* Sidebar */}
      <aside
        className="w-64 shrink-0 border-r flex flex-col"
        style={{
          background: "hsl(20 10% 3% / 0.95)",
          borderColor: "hsl(45 15% 12%)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="p-4 border-b" style={{ borderColor: "hsl(45 15% 12%)" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, hsl(45 95% 55%), hsl(35 90% 50%))",
                boxShadow: "0 4px 16px hsl(45 90% 50% / 0.35)",
              }}
            >
              <Crown className="h-5 w-5 text-slate-900" />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-[0.22em] text-amber-300/80 font-semibold">
                Master Admin
              </p>
              <p className="text-sm font-bold text-slate-100">Control Center</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
          {NAV.map((group) => (
            <div key={group.section}>
              <p className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                {group.section}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.to);
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                         to={item.to}
                        className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-all ${
                          active
                            ? "bg-gradient-to-r from-amber-500/15 to-transparent text-amber-400 border-l-2 border-amber-500 font-semibold shadow-[inset_1px_0_0_0_rgba(245,158,11,0.2)]"
                            : "text-zinc-400 hover:bg-amber-500/5 hover:text-amber-300"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: "hsl(45 15% 12%)" }}>
          <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-white/[0.02]">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-slate-900"
              style={{ background: "hsl(45 95% 60%)" }}
            >
              {(user?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.email}</p>
              <p className="text-[10px] text-amber-300/70">Platform Owner</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10"
              onClick={signOut}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="h-16 px-6 flex items-center justify-between border-b sticky top-0 z-30"
          style={{
            background: "hsl(20 10% 3% / 0.8)",
            borderColor: "hsl(45 15% 12%)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-slate-100 truncate">
                {title || "Master Admin"}
              </h1>
              {subtitle && (
                <p className="text-[11px] text-zinc-400 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder="Search schools, owners…"
                className="pl-9 h-9 w-72 bg-zinc-950/60 border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus-visible:ring-amber-500/30"
              />
            </div>
            {actions}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto super-admin-scope bg-black/40">
          {(title || subtitle) && (
            <div
              className="border-b"
              style={{
                background:
                  "linear-gradient(180deg, hsl(20 10% 5% / 0.6), transparent)",
                borderColor: "hsl(45 15% 12%)",
              }}
            >
              <div className="w-full px-6 md:px-8 py-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p
                    className="text-[10px] uppercase tracking-[0.22em] font-semibold"
                    style={{ color: "hsl(45 95% 65% / 0.9)" }}
                  >
                    Master Admin
                  </p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-100 truncate">
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="text-sm text-zinc-400 mt-0.5 truncate">{subtitle}</p>
                  )}
                </div>
                <div
                  className="hidden md:block h-12 w-12 rounded-xl"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(45 95% 55% / 0.18), hsl(35 90% 50% / 0.12))",
                    border: "1px solid hsl(45 80% 50% / 0.25)",
                  }}
                />
              </div>
            </div>
          )}
          <div className="w-full p-6 md:p-8">{children}</div>
        </main>
      </div>
      <GlobalCommandPalette basePath="/super_admin" />
    </div>
  );
}
