import { localDay } from "@/lib/local-date";
/**
 * The Fees Centre overview: what was billed, what was actually collected, what
 * is still owed and how old that debt is.
 *
 * Every figure comes from ``/finance/collection-board`` as an exact decimal
 * string and is formatted, never re-computed in floating point. A rate the
 * server could not compute (nothing was billed) is shown as unknown, not 0%.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  Coins,
  RefreshCw,
  TrendingUp,
  Users as UsersIcon,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataExportMenu } from "@/components/documents/DataExportMenu";
import { money as formatMoney, date as formatDate, ABSENT } from "@/lib/documents/format";

export interface CollectionBoardData {
  currency: string;
  as_of: string;
  period: { from: string; to: string };
  billed: string;
  concessions: string;
  collected: string;
  collected_today: string;
  collection_rate: string | null;
  payments: number;
  invoices: { total: number; paid: number; partial: number; pending: number; overdue: number };
  outstanding: string;
  advance: string;
  overdue_invoices: number;
  aging: Array<{ bucket: string; label: string; amount: string }>;
  by_method: Array<{ method: string; amount: string; count: number }>;
  daily: Array<{ date: string; collected: string }>;
  by_class: Array<{
    class_id: string | null;
    class_name: string | null;
    section_name: string | null;
    billed: string;
    collected: string;
    outstanding: string;
    students: number;
    collection_rate: string | null;
  }>;
  top_defaulters: Array<{
    student_id: string;
    name: string;
    student_code: string | null;
    class_name: string | null;
    section_name: string | null;
    outstanding: string;
    oldest_due_date: string | null;
    days_overdue: number;
    unpaid_invoices: number;
  }>;
}

type PeriodKey = "this_month" | "last_month" | "last_3_months" | "this_year";

const PERIOD_LABELS: Record<PeriodKey, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  this_year: "This academic year so far",
};

const iso = (d: Date) => localDay(d);

/** Karachi is UTC+5; the board's day should match the school's day. */
function todayInKarachi(): Date {
  const now = new Date();
  return new Date(now.getTime() + (5 * 60 + now.getTimezoneOffset()) * 60_000);
}

function periodRange(key: PeriodKey): { from: string; to: string } {
  const today = todayInKarachi();
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (key) {
    case "last_month":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "last_3_months":
      return { from: iso(new Date(y, m - 2, 1)), to: iso(today) };
    case "this_year": {
      // A Pakistani school year opens in April; before April, it is last year's.
      const startYear = m >= 3 ? y : y - 1;
      return { from: iso(new Date(startYear, 3, 1)), to: iso(today) };
    }
    default:
      return { from: iso(new Date(y, m, 1)), to: iso(today) };
  }
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

const AGING_TONE: Record<string, string> = {
  not_due: "bg-slate-400",
  "0_30": "bg-amber-400",
  "31_60": "bg-orange-500",
  "61_90": "bg-rose-500",
  "90_plus": "bg-red-700",
};

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "slate" | "emerald" | "amber" | "rose" | "blue";
}) {
  const tones: Record<string, string> = {
    slate: "from-slate-500/10 text-slate-600 dark:text-slate-300",
    emerald: "from-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "from-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "from-rose-500/10 text-rose-600 dark:text-rose-400",
    blue: "from-blue-500/10 text-blue-600 dark:text-blue-400",
  };
  return (
    <Card className="rounded-2xl border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
      <CardContent className={`p-4 sm:p-5 bg-gradient-to-br ${tones[tone]} to-transparent`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 font-display text-lg sm:text-2xl font-bold tracking-tight text-foreground truncate">
              {value}
            </p>
            {hint ? <p className="mt-0.5 text-xs text-muted-foreground truncate">{hint}</p> : null}
          </div>
          <div className={`shrink-0 rounded-xl bg-background/70 p-2 ${tones[tone].split(" ").slice(1).join(" ")}`}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CollectionBoard({
  onOpenDefaulters,
  onOpenBilling,
}: {
  onOpenDefaulters?: () => void;
  onOpenBilling?: () => void;
}) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this_month");
  const range = useMemo(() => periodRange(periodKey), [periodKey]);

  const { data, isLoading, isFetching, error, refetch } = useQuery<CollectionBoardData>({
    queryKey: ["fees", "collection-board", range.from, range.to],
    queryFn: async () => {
      const res = await apiClient.get("/finance/collection-board", {
        params: { from_date: range.from, to_date: range.to, limit_defaulters: 10 },
      });
      return res.data as CollectionBoardData;
    },
    staleTime: 60_000,
  });

  const currency = data?.currency ?? "PKR";
  const amount = (v: string | null | undefined, signed = false) =>
    v == null ? ABSENT : formatMoney(v, { currency, signed });

  const agingTotal = useMemo(() => {
    if (!data) return 0;
    return data.aging.reduce((acc, a) => acc + Number(a.amount), 0);
  }, [data]);

  const chartData = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        day: d.date.slice(5),
        collected: Number(d.collected),
      })),
    [data],
  );

  if (error) {
    return (
      <Card className="rounded-2xl border-rose-200 dark:border-rose-900">
        <CardContent className="grid place-items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-rose-500" />
          <div>
            <p className="font-semibold text-foreground">The collection board could not be loaded</p>
            <p className="text-sm text-muted-foreground">
              {(error as any)?.response?.data?.detail ?? (error as Error).message}
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const nothingBilled = data.invoices.total === 0;

  return (
    <div className="space-y-5">
      {/* Period bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={periodKey} onValueChange={(v) => setPeriodKey(v as PeriodKey)}>
            <SelectTrigger className="h-9 w-[220px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {PERIOD_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {formatDate(data.period.from)} – {formatDate(data.period.to)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            As of {new Date(data.as_of).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <DataExportMenu
            title="Fee Collection Board"
            subtitle={`${formatDate(data.period.from)} – ${formatDate(data.period.to)}`}
            rows={data.by_class.map((c) => ({
              Class: [c.class_name, c.section_name].filter(Boolean).join(" ") || "Unassigned",
              Students: c.students,
              Billed: c.billed,
              Collected: c.collected,
              Outstanding: c.outstanding,
              "Collection %": c.collection_rate ?? ABSENT,
            }))}
            summary={[
              { label: "Billed", value: amount(data.billed) },
              { label: "Collected", value: amount(data.collected) },
              { label: "Outstanding", value: amount(data.outstanding) },
              { label: "Collection rate", value: data.collection_rate ? `${data.collection_rate}%` : ABSENT },
            ]}
            note="Collected is the money actually received in the period. Outstanding is the balance owed today across all live invoices."
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Billed this period"
          value={amount(data.billed)}
          hint={`${data.invoices.total} invoice${data.invoices.total === 1 ? "" : "s"}`}
          icon={Coins}
          tone="blue"
        />
        <Kpi
          label="Collected"
          value={amount(data.collected)}
          hint={
            data.collection_rate
              ? `${data.collection_rate}% of what was billed · ${data.payments} payments`
              : `${data.payments} payment${data.payments === 1 ? "" : "s"}`
          }
          icon={BadgeCheck}
          tone="emerald"
        />
        <Kpi
          label="Outstanding today"
          value={amount(data.outstanding)}
          hint={`${data.overdue_invoices} invoice${data.overdue_invoices === 1 ? "" : "s"} past due`}
          icon={AlertTriangle}
          tone={Number(data.outstanding) > 0 ? "rose" : "slate"}
        />
        <Kpi
          label="Received today"
          value={amount(data.collected_today)}
          hint={Number(data.advance) > 0 ? `${amount(data.advance)} held in advance` : undefined}
          icon={Wallet}
          tone="amber"
        />
      </div>

      {nothingBilled ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="grid place-items-center gap-3 py-10 text-center">
            <Coins className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-semibold text-foreground">Nothing was billed in this period</p>
              <p className="text-sm text-muted-foreground">
                Generate vouchers in Billing Run, or pick a different period above.
              </p>
            </div>
            {onOpenBilling ? (
              <Button variant="outline" onClick={onOpenBilling}>
                Go to Billing Run <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Collection trend + aging */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="rounded-2xl lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" /> Daily collection
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="py-14 text-center text-sm text-muted-foreground">
                No payment was received in this period.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ left: -18, right: 6, top: 6 }}>
                  <defs>
                    <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
                  <ReTooltip
                    formatter={(v: any) => [formatMoney(String(v), { currency }), "Collected"]}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="collected"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#collectedFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="font-display text-base font-bold">How old the debt is</CardTitle>
            {onOpenDefaulters ? (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onOpenDefaulters}>
                Chase <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {agingTotal === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing is owed — every live invoice is settled.
              </p>
            ) : (
              <>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  {data.aging.map((a) =>
                    Number(a.amount) > 0 ? (
                      <div
                        key={a.bucket}
                        className={AGING_TONE[a.bucket]}
                        style={{ width: `${(Number(a.amount) / agingTotal) * 100}%` }}
                        title={`${a.label}: ${amount(a.amount)}`}
                      />
                    ) : null,
                  )}
                </div>
                <ul className="space-y-1.5">
                  {data.aging.map((a) => (
                    <li key={a.bucket} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className={`h-2.5 w-2.5 rounded-full ${AGING_TONE[a.bucket]}`} />
                        {a.label}
                      </span>
                      <span className="font-semibold tabular-nums">{amount(a.amount)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {data.by_method.length > 0 ? (
              <div className="border-t pt-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Received by method
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.by_method.map((m) => (
                    <Badge key={m.method} variant="secondary" className="rounded-lg font-normal">
                      {METHOD_LABELS[m.method] ?? m.method}: {amount(m.amount)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Class by class */}
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-display text-base font-bold">Class by class</CardTitle>
          <DataExportMenu
            title="Fee Collection by Class"
            subtitle={`${formatDate(data.period.from)} – ${formatDate(data.period.to)}`}
            rows={data.by_class.map((c) => ({
              Class: [c.class_name, c.section_name].filter(Boolean).join(" ") || "Unassigned",
              Students: c.students,
              Billed: c.billed,
              Collected: c.collected,
              Outstanding: c.outstanding,
              "Collection %": c.collection_rate ?? ABSENT,
            }))}
            disabled={data.by_class.length === 0}
            size="sm"
          />
        </CardHeader>
        <CardContent className="p-0">
          {data.by_class.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No invoice in this period is linked to a class.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="pl-6">Class</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="w-[140px] pr-6">Collection</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.by_class.map((c, i) => {
                    const rate = c.collection_rate == null ? null : Number(c.collection_rate);
                    return (
                      <TableRow key={`${c.class_id ?? "none"}-${c.section_name ?? i}`}>
                        <TableCell className="pl-6 font-medium">
                          {[c.class_name, c.section_name].filter(Boolean).join(" ") || "Unassigned"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.students}</TableCell>
                        <TableCell className="text-right tabular-nums">{amount(c.billed)}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                          {amount(c.collected)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(c.outstanding) > 0 ? (
                            <span className="text-rose-600 dark:text-rose-400">{amount(c.outstanding)}</span>
                          ) : (
                            amount(c.outstanding)
                          )}
                        </TableCell>
                        <TableCell className="pr-6">
                          {rate == null ? (
                            <span className="text-xs text-muted-foreground">{ABSENT}</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full ${
                                    rate >= 90 ? "bg-emerald-500" : rate >= 60 ? "bg-amber-500" : "bg-rose-500"
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                                />
                              </div>
                              <span className="w-12 text-right text-xs font-semibold tabular-nums">{rate}%</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Who owes the most */}
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-display text-base font-bold flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-rose-500" /> Who owes the most
          </CardTitle>
          <div className="flex items-center gap-2">
            <DataExportMenu
              title="Fee Defaulters"
              subtitle={`As of ${formatDate(data.as_of)}`}
              rows={data.top_defaulters.map((d) => ({
                Student: d.name,
                Code: d.student_code ?? ABSENT,
                Class: [d.class_name, d.section_name].filter(Boolean).join(" ") || ABSENT,
                Outstanding: d.outstanding,
                "Oldest due": d.oldest_due_date ?? ABSENT,
                "Days overdue": d.days_overdue,
                "Unpaid invoices": d.unpaid_invoices,
              }))}
              disabled={data.top_defaulters.length === 0}
              size="sm"
            />
            {onOpenDefaulters ? (
              <Button variant="outline" size="sm" onClick={onOpenDefaulters}>
                All defaulters <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.top_defaulters.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No family currently owes anything.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="pl-6">Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Unpaid</TableHead>
                    <TableHead>Oldest due</TableHead>
                    <TableHead className="text-right pr-6">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_defaulters.map((d) => (
                    <TableRow key={d.student_id}>
                      <TableCell className="pl-6">
                        <div className="font-medium">{d.name}</div>
                        {d.student_code ? (
                          <div className="text-xs text-muted-foreground">{d.student_code}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[d.class_name, d.section_name].filter(Boolean).join(" ") || ABSENT}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.unpaid_invoices}</TableCell>
                      <TableCell className="text-sm">
                        {d.oldest_due_date ? (
                          <span className="flex items-center gap-2">
                            {formatDate(d.oldest_due_date)}
                            {d.days_overdue > 0 ? (
                              <Badge
                                variant="secondary"
                                className={`rounded-md text-[10px] ${
                                  d.days_overdue > 90 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : ""
                                }`}
                              >
                                {d.days_overdue}d
                              </Badge>
                            ) : null}
                          </span>
                        ) : (
                          ABSENT
                        )}
                      </TableCell>
                      <TableCell className="pr-6 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                        {amount(d.outstanding)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default CollectionBoard;
