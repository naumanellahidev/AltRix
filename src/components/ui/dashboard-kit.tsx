import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- DashboardHeader: profile + role + notifications row ---------- */
type DashboardHeaderProps = {
  name: string;
  role?: string;
  subtitle?: string;
  avatarUrl?: string | null;
  initials?: string;
  right?: ReactNode;
  className?: string;
};

export function DashboardHeader({
  name,
  role,
  subtitle,
  avatarUrl,
  initials,
  right,
  className,
}: DashboardHeaderProps) {
  const fallback = (initials || name || "?").trim().slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        "rounded-2xl border border-blue-100 bg-white/80 backdrop-blur-md p-4 sm:p-6 shadow-[0_8px_30px_rgb(219,234,254,0.3)] transition-all duration-300 hover:shadow-[0_12px_40px_rgb(191,219,254,0.4)] flex items-center justify-between gap-4 animate-rise",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gradient-to-tr from-blue-600 to-blue-400 ring-2 ring-blue-50 shadow-md">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-white">
              {fallback}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg font-bold tracking-tight text-slate-800 truncate">
            {name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {role && (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                {role}
              </span>
            )}
            {subtitle && (
              <p className="text-xs font-medium text-slate-400 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/* ---------- QuickActionGrid: icon-based action cards ---------- */
export type QuickAction = {
  label: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
  badge?: number | string;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
};

const toneClasses: Record<NonNullable<QuickAction["tone"]>, string> = {
  default: "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
  success: "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
  warning: "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
  destructive: "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
  info: "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
};

export function QuickActionGrid({
  actions,
  className,
  columns,
}: {
  actions: QuickAction[];
  className?: string;
  columns?: { base?: number; sm?: number; md?: number; lg?: number };
}) {
  const cols = columns ?? { base: 3, sm: 4, md: 6, lg: 6 };
  const gridCls = cn(
    "grid gap-3",
    cols.base === 2 && "grid-cols-2",
    cols.base === 3 && "grid-cols-3",
    cols.base === 4 && "grid-cols-4",
    cols.sm === 3 && "sm:grid-cols-3",
    cols.sm === 4 && "sm:grid-cols-4",
    cols.sm === 5 && "sm:grid-cols-5",
    cols.md === 4 && "md:grid-cols-4",
    cols.md === 5 && "md:grid-cols-5",
    cols.md === 6 && "md:grid-cols-6",
    cols.lg === 5 && "lg:grid-cols-5",
    cols.lg === 6 && "lg:grid-cols-6",
    cols.lg === 8 && "lg:grid-cols-8",
  );

  return (
    <div className={cn(gridCls, className)}>
      {actions.map((a) => {
        const inner = (
          <span className="group relative flex flex-col items-center justify-center gap-2.5 rounded-xl border border-slate-100 bg-white p-3.5 text-center shadow-[0_4px_20px_rgba(219,234,254,0.15)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(191,219,254,0.3)] hover:border-blue-200 sm:p-5">
            <span className={cn("h-11 w-11 inline-flex items-center justify-center rounded-xl transition-all duration-300 bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white group-hover:scale-110 shadow-sm", toneClasses[a.tone ?? "default"])}>
              <a.icon className="h-5 w-5" />
            </span>
            <span className="text-xs font-semibold leading-tight text-slate-600 group-hover:text-blue-700 transition-colors sm:text-xs">
              {a.label}
            </span>
            {a.badge !== undefined && a.badge !== 0 && a.badge !== "" && (
              <span className="absolute right-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                {typeof a.badge === "number" && a.badge > 99 ? "99+" : a.badge}
              </span>
            )}
          </span>
        );
        if (a.to) {
          return (
            <Link key={a.label} to={a.to} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl">
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl text-left w-full"
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- SmartCard: titled card with optional View More ---------- */
export function SmartCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: { label?: string; to?: string; onClick?: () => void };
  children?: ReactNode;
  className?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
}) {
  const ActionEl = action?.to ? (
    <Link
      to={action.to}
      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors hover:underline"
    >
      {action.label ?? "View more"} <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  ) : action ? (
    <button
      type="button"
      onClick={action.onClick}
      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors hover:underline"
    >
      {action.label ?? "View more"} <ChevronRight className="h-3.5 w-3.5" />
    </button>
  ) : null;

  return (
    <div className={cn("rounded-2xl border border-blue-50 bg-white p-5 sm:p-6 shadow-[0_4px_25px_rgb(219,234,254,0.15)] hover:shadow-[0_8px_35px_rgb(191,219,254,0.25)] hover:border-blue-100 transition-all duration-300 animate-rise", className)}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-sm">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="font-display text-sm font-bold tracking-tight text-slate-800 sm:text-base truncate">
              {title}
            </p>
            {subtitle && (
              <p className="text-xs font-medium text-slate-400 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {ActionEl}
      </div>
      {children}
    </div>
  );
}

/* ---------- StatTile: luxury display of single metrics ---------- */
export function StatTile({
  label,
  value,
  icon: Icon,
  delta,
  className,
  to,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  delta?: { value: string; positive?: boolean };
  tone?: "default" | "success" | "warning" | "destructive" | "info";
  className?: string;
  to?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-blue-50/40 opacity-30 transition-transform duration-300 group-hover:scale-125" />
      <div className="relative flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-all duration-300 group-hover:scale-110 shadow-xs">
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
      </div>
      <p className="relative mt-3 font-display text-2xl font-black tracking-tight text-slate-800 sm:text-3xl">
        {value}
      </p>
      {delta && (
        <p
          className={cn(
            "relative mt-1.5 text-[10px] font-bold flex items-center gap-0.5",
            delta.positive ? "text-emerald-600" : "text-blue-600",
          )}
        >
          {delta.value}
        </p>
      )}
    </>
  );

  const baseStyles = cn(
    "relative overflow-hidden rounded-xl border border-blue-50/65 bg-white p-4 shadow-[0_4px_20px_rgba(219,234,254,0.15)] animate-rise block text-left w-full outline-none transition-all duration-300",
    (to || onClick) ? "cursor-pointer group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(191,219,254,0.3)] hover:border-blue-200" : "hover:shadow-[0_6px_25px_rgba(219,234,254,0.2)]",
    className
  );

  if (to) {
    return (
      <Link to={to} className={baseStyles} aria-label={`${label}: ${value}`}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseStyles} aria-label={`${label}: ${value}`}>
        {content}
      </button>
    );
  }

  return (
    <div className={baseStyles}>
      {content}
    </div>
  );
}

/* ---------- ProgressRing: SVG circular progress ---------- */
export function ProgressRing({
  value,
  size = 84,
  stroke = 8,
  label,
  sublabel,
  className,
}: {
  value: number; // 0..100
  size?: number;
  stroke?: number;
  label?: ReactNode;
  sublabel?: ReactNode;
  tone?: "primary" | "success" | "warning" | "destructive" | "info";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;
  
  // Strict blue & white styling
  const stroketone = "rgb(37, 99, 235)"; // Hex #2563eb (brand blue)
  
  return (
    <div className={cn("relative inline-flex flex-col items-center justify-center shrink-0", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(219, 234, 254, 0.5)" // Light blue track
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroketone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 600ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-sm font-extrabold tracking-tight text-slate-800">
          {label ?? `${Math.round(clamped)}%`}
        </span>
        {sublabel && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{sublabel}</span>}
      </div>
    </div>
  );
}

/* ---------- SectionTitle: small heading helper ---------- */
export function SectionTitle({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between mb-3.5", className)}>
      <h3 className="font-display text-xs font-bold tracking-wider text-slate-400 uppercase">{title}</h3>
      {action}
    </div>
  );
}

/* ---------- ProfileHero: premium profile header for any role ---------- */
export function ProfileHero({
  name,
  role,
  meta,
  avatarUrl,
  initials,
  stats,
  actions,
  className,
}: {
  name: string;
  role?: string;
  meta?: string;
  avatarUrl?: string | null;
  initials?: string;
  stats?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  className?: string;
}) {
  const fallback = (initials || name || "?").trim().slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-blue-100 bg-white p-6 shadow-[0_8px_30px_rgb(219,234,254,0.2)] sm:p-8 animate-rise",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-5"
        style={{ background: "radial-gradient(circle at 80% 20%, rgb(37,99,235), transparent)" }}
        aria-hidden
      />
      <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-tr from-blue-600 to-blue-400 ring-4 ring-blue-50 shadow-md sm:h-24 sm:w-24">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-2xl font-bold text-white sm:text-3xl">
              {fallback}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-extrabold tracking-tight text-slate-800 sm:text-2xl">
            {name}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {role && (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 uppercase tracking-wide">
                {role}
              </span>
            )}
            {meta && <span className="text-xs font-semibold text-slate-400">• {meta}</span>}
          </div>
          {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
      {stats && stats.length > 0 && (
        <div className="relative mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-50/50 p-3 text-center border border-slate-100">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                {s.label}
              </p>
              <p className="mt-1 font-display text-base font-extrabold tracking-tight text-slate-700">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
