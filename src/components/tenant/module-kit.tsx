/**
 * The parts every module in the shell is built from.
 *
 * A screen reads as "basic" for reasons that can be counted: it opens with no
 * heading and no sentence saying what it is for; an empty list looks the same
 * as a broken one; a blank flash appears instead of a skeleton; a failure
 * leaves nothing on screen at all. Sixty screens each solving those four
 * problems their own way is also why the app does not feel like one product.
 *
 * These are the shared answers. Using them is what makes a module premium, and
 * what makes the next module look like it belongs beside it.
 */
import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** The accent a module's header wears. Each family of tabs has its own. */
export type ModuleTone = "blue" | "emerald" | "violet" | "amber" | "rose" | "slate" | "teal";

const TONES: Record<ModuleTone, { band: string; tile: string; glow: string }> = {
  blue: { band: "from-blue-500 to-indigo-600", tile: "from-blue-600 to-indigo-600", glow: "shadow-blue-500/20" },
  emerald: { band: "from-emerald-500 to-teal-600", tile: "from-emerald-600 to-teal-600", glow: "shadow-emerald-500/20" },
  violet: { band: "from-violet-500 to-purple-600", tile: "from-violet-600 to-purple-600", glow: "shadow-violet-500/20" },
  amber: { band: "from-amber-500 to-orange-600", tile: "from-amber-500 to-orange-600", glow: "shadow-amber-500/20" },
  rose: { band: "from-rose-500 to-pink-600", tile: "from-rose-600 to-pink-600", glow: "shadow-rose-500/20" },
  slate: { band: "from-slate-500 to-slate-700", tile: "from-slate-600 to-slate-800", glow: "shadow-slate-500/20" },
  teal: { band: "from-teal-500 to-cyan-600", tile: "from-teal-600 to-cyan-600", glow: "shadow-teal-500/20" },
};

/**
 * The block every module opens with: what this screen is, in one line, and
 * the actions that belong to the whole screen.
 */
export function ModuleHeader({
  icon: Icon,
  title,
  description,
  tone = "blue",
  actions,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  /** One sentence. What a principal would tell a new deputy this tab is for. */
  description: string;
  tone?: ModuleTone;
  actions?: ReactNode;
  /** Chips, filters or tabs that sit under the title. */
  children?: ReactNode;
}) {
  const palette = TONES[tone];
  return (
    <div className="relative overflow-hidden rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${palette.band}`} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className={`shrink-0 rounded-2xl bg-gradient-to-br ${palette.tile} p-3 text-white shadow-md ${palette.glow}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-black tracking-tight sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

/** The row of figures under a module header. */
export function StatTiles({
  stats,
}: {
  stats: Array<{
    label: string;
    value: ReactNode;
    hint?: string;
    tone?: "default" | "positive" | "warning" | "danger";
  }>;
}) {
  const tones = {
    default: "",
    positive: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-rose-600 dark:text-rose-400",
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="rounded-2xl">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <p className={`font-display text-2xl font-bold ${tones[stat.tone ?? "default"]}`}>
              {stat.value}
            </p>
            {stat.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{stat.hint}</p> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** A section of a module, with its own title and actions. */
export function PanelCard({
  title,
  description,
  actions,
  children,
  flush = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** No padding, for a table that runs to the card's edges. */
  flush?: boolean;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle className="font-display text-base font-bold">{title}</CardTitle>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={flush ? "p-0" : undefined}>{children}</CardContent>
    </Card>
  );
}

/**
 * Nothing to show — and why.
 *
 * "No records" tells a user nothing they did not already see. This says what
 * would put something here.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-3 px-6 py-12 text-center">
      <div className="rounded-2xl bg-muted p-3">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** The shape of the data, while it loads. */
export function LoadingRows({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 p-4 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 rounded-xl" />
      ))}
    </div>
  );
}

/** A failure the user can read, and retry. */
export function ErrorState({
  title = "This could not be loaded",
  error,
  onRetry,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const reason =
    (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
    (error instanceof Error ? error.message : String(error ?? "unknown error"));

  return (
    <div className="grid place-items-center gap-3 px-6 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-rose-500" />
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{reason}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      ) : null}
    </div>
  );
}
