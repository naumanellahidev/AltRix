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
        "card-premium flex items-center justify-between gap-4 p-4 sm:p-5 animate-rise",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 to-accent ring-2 ring-background shadow-soft">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-base font-semibold text-primary">
              {fallback}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-display text-base font-semibold tracking-tight sm:text-lg truncate">
            {name}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {role}
            {role && subtitle ? " • " : ""}
            {subtitle}
          </p>
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
  default: "bg-accent text-accent-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
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
          <span className="group relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-border/60 bg-surface p-3 text-center shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated hover:border-primary/30 sm:p-4">
            <span className={cn("icon-tile icon-tile-hover", toneClasses[a.tone ?? "default"])}>
              <a.icon className="h-5 w-5" />
            </span>
            <span className="text-xs font-medium leading-tight sm:text-sm">{a.label}</span>
            {a.badge !== undefined && a.badge !== 0 && a.badge !== "" && (
              <span className="absolute right-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground shadow">
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
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl text-left"
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
  tone,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: { label?: string; to?: string; onClick?: () => void };
  children?: ReactNode;
  className?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
}) {
  const accent =
    tone === "success"
      ? "bg-success/12 text-success"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : tone === "destructive"
          ? "bg-destructive/12 text-destructive"
          : tone === "info"
            ? "bg-info/12 text-info"
            : "bg-accent text-accent-foreground";

  const ActionEl = action?.to ? (
    <Link
      to={action.to}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {action.label ?? "View more"} <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  ) : action ? (
    <button
      type="button"
      onClick={action.onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {action.label ?? "View more"} <ChevronRight className="h-3.5 w-3.5" />
    </button>
  ) : null;

  return (
    <div className={cn("card-premium card-premium-hover p-5 animate-rise", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", accent)}>
              <Icon className="h-4.5 w-4.5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold tracking-tight sm:text-base truncate">
              {title}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {ActionEl}
      </div>
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  icon: Icon,
  delta,
  tone = "default",
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
  const dot =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "destructive"
          ? "bg-destructive"
          : tone === "info"
            ? "bg-info"
            : "bg-primary";

  const content = (
    <>
      <div className={cn("absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-10 transition-transform duration-300 group-hover:scale-110", dot)} />
      <div className="relative flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-xs",
            tone === "success" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
            tone === "warning" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
            tone === "destructive" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
            tone === "info" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
            "bg-slate-500/10 text-slate-600 dark:text-slate-400"
          )}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
      </div>
      <p className="relative mt-3.5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {value}
      </p>
      {delta && (
        <p
          className={cn(
            "relative mt-1 text-xs font-semibold flex items-center gap-0.5",
            delta.positive ? "text-success" : "text-destructive",
          )}
        >
          {delta.value}
        </p>
      )}
    </>
  );

  const baseStyles = cn(
    "card-premium relative overflow-hidden p-4 sm:p-5 animate-rise block text-left w-full outline-none",
    (to || onClick) && "card-premium-hover cursor-pointer group transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
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
  tone = "primary",
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
  const stroketone =
    tone === "success"
      ? "hsl(var(--success))"
      : tone === "warning"
        ? "hsl(var(--warning))"
        : tone === "destructive"
          ? "hsl(var(--destructive))"
          : tone === "info"
            ? "hsl(var(--info))"
            : "hsl(var(--primary))";
  return (
    <div className={cn("relative inline-flex flex-col items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
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
        <span className="font-display text-base font-semibold tracking-tight">
          {label ?? `${Math.round(clamped)}%`}
        </span>
        {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
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
    <div className={cn("flex items-center justify-between mb-3", className)}>
      <h3 className="font-display text-base font-semibold tracking-tight sm:text-lg">{title}</h3>
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
        "relative overflow-hidden rounded-3xl border border-border/60 bg-surface p-5 shadow-elevated sm:p-7 animate-rise",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: "var(--gradient-brand)" }}
        aria-hidden
      />
      <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/30 to-accent ring-4 ring-background shadow-elevated sm:h-24 sm:w-24">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-2xl font-semibold text-primary sm:text-3xl">
              {fallback}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            {name}
          </p>
          <p className="text-sm text-muted-foreground">
            {role}
            {role && meta ? " • " : ""}
            {meta}
          </p>
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
      {stats && stats.length > 0 && (
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-background/80 backdrop-blur p-3 text-center border border-border/50">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-1 font-display text-lg font-semibold tracking-tight">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
