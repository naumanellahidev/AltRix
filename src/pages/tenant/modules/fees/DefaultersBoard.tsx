/**
 * Defaulters & Reminders: who owes what, how old it is, and what has already
 * been sent to them.
 *
 * The board shows two levels side by side — the notice the debt has *earned*
 * from the ladder, and the notice that has actually *gone out*. They differ
 * whenever nobody ran the check, and that gap is the point of this screen.
 *
 * Nothing here claims a message was delivered. Opening WhatsApp says it opened
 * WhatsApp; a scheduled reminder says it is scheduled.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

interface Defaulter {
  student_id: string;
  name: string;
  student_code: string | null;
  class_name: string | null;
  section_name: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  student_phone: string | null;
  outstanding: string;
  unpaid_invoices: number;
  oldest_due_date: string | null;
  days_overdue: number;
  bucket: string;
  last_payment_at: string | null;
  due_level: number;
  due_notice: string;
  notice_level: number;
  notice_sent_at: string | null;
}

const BUCKETS: Array<{ value: string; label: string }> = [
  { value: "__all", label: "Every bucket" },
  { value: "not_due", label: "Not due yet" },
  { value: "0_30", label: "1–30 days" },
  { value: "31_60", label: "31–60 days" },
  { value: "61_90", label: "61–90 days" },
  { value: "90_plus", label: "Over 90 days" },
];

const NOTICE_LABELS: Record<number, string> = {
  0: "None",
  1: "Reminder",
  2: "Warning",
  3: "Final notice",
  4: "Suspension warning",
};

const NOTICE_TONE: Record<number, string> = {
  0: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  1: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  2: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  3: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  4: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

/** Pakistani mobiles are stored as 03xx…; WhatsApp wants 92…. */
function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
}

export function DefaultersBoard({ currency = "PKR" }: { currency?: string }) {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState("__all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading, isFetching, error, refetch } = useQuery<{
    as_of: string;
    count: number;
    defaulters: Defaulter[];
  }>({
    queryKey: ["fees", "defaulters", bucket, query],
    queryFn: async () => {
      const res = await apiClient.get("/finance/defaulters", {
        params: {
          bucket: bucket === "__all" ? undefined : bucket,
          search: query || undefined,
          limit: 200,
        },
      });
      return res.data;
    },
    staleTime: 60_000,
  });

  const runCheck = useMutation({
    mutationFn: async () => (await apiClient.post("/finance/escalations/check")).data,
    onSuccess: (res: any) => {
      toast.success(res?.message ?? "Escalation check finished");
      qc.invalidateQueries({ queryKey: ["fees", "defaulters"] });
    },
    onError: (e: any) => {
      toast.error(
        e?.response?.data?.detail ?? e?.message ?? "The escalation check could not be run",
      );
    },
  });

  const rows = data?.defaulters ?? [];

  const totals = useMemo(() => {
    let owed = 0;
    let behind = 0;
    for (const r of rows) {
      owed += Number(r.outstanding);
      if (r.due_level > r.notice_level) behind += 1;
    }
    return { owed, behind };
  }, [rows]);

  const amount = (v: string) => formatMoney(v, { currency });

  const remind = (row: Defaulter) => {
    const number = whatsappNumber(row.parent_phone ?? row.student_phone);
    if (!number) {
      toast.error(`No phone number on record for ${row.name} — add one on the student's profile.`);
      return;
    }
    const message =
      `Assalam-o-Alaikum${row.parent_name ? ` ${row.parent_name}` : ""},\n\n` +
      `${row.name}${row.student_code ? ` (${row.student_code})` : ""} ki fees mein ` +
      `${amount(row.outstanding)} baqaya hai` +
      (row.oldest_due_date ? `, jo ${formatDate(row.oldest_due_date)} se due hai` : "") +
      `.\n\nMehrbani farma kar jald adaigi kar dein. Shukriya.`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    toast.info("WhatsApp opened with the reminder — send it from there.");
  };

  if (error) {
    return (
      <Card className="rounded-2xl border-rose-200 dark:border-rose-900">
        <CardContent className="grid place-items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-rose-500" />
          <div>
            <p className="font-semibold">The defaulters list could not be loaded</p>
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

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQuery(search.trim());
              }}
              onBlur={() => setQuery(search.trim())}
              placeholder="Student name or code…"
              className="h-9 rounded-xl pl-9"
            />
          </div>
          <Select value={bucket} onValueChange={setBucket}>
            <SelectTrigger className="h-9 w-[170px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUCKETS.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runCheck.mutate()}
            disabled={runCheck.isPending}
          >
            {runCheck.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="mr-2 h-4 w-4" />
            )}
            Run escalation check
          </Button>
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
            title="Fee Defaulters"
            subtitle={data ? `As of ${formatDate(data.as_of)}` : undefined}
            orientation="landscape"
            rows={rows.map((r) => ({
              Student: r.name,
              Code: r.student_code ?? ABSENT,
              Class: [r.class_name, r.section_name].filter(Boolean).join(" ") || ABSENT,
              Parent: r.parent_name ?? ABSENT,
              Phone: r.parent_phone ?? r.student_phone ?? ABSENT,
              Outstanding: r.outstanding,
              "Unpaid invoices": r.unpaid_invoices,
              "Oldest due": r.oldest_due_date ?? ABSENT,
              "Days overdue": r.days_overdue,
              "Notice due": NOTICE_LABELS[r.due_level] ?? ABSENT,
              "Notice sent": NOTICE_LABELS[r.notice_level] ?? ABSENT,
              "Last payment": r.last_payment_at ? r.last_payment_at.slice(0, 10) : ABSENT,
            }))}
            summary={[
              { label: "Families", value: rows.length },
              { label: "Outstanding", value: formatMoney(String(totals.owed), { currency }) },
              { label: "Notice overdue", value: totals.behind },
            ]}
            note="A blank phone number means none is on record for that family; no reminder can be sent until one is added."
            disabled={rows.length === 0}
          />
        </div>
      </div>

      {/* Headline */}
      {!isLoading && rows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Families owing
              </p>
              <p className="font-display text-2xl font-bold">{rows.length}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total outstanding
              </p>
              <p className="font-display text-2xl font-bold text-rose-600 dark:text-rose-400">
                {formatMoney(String(totals.owed), { currency })}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Awaiting a notice
              </p>
              <p className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400">
                {totals.behind}
              </p>
              <p className="text-xs text-muted-foreground">
                The ladder has earned a step these families have not been sent.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-display text-base font-bold flex items-center gap-2">
            <BellRing className="h-4 w-4 text-amber-500" /> Defaulters
          </CardTitle>
          {data ? (
            <span className="text-xs text-muted-foreground">
              {rows.length} shown{data.count >= 200 ? " (first 200)" : ""}
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="grid place-items-center gap-2 py-14 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="font-semibold">Nobody owes anything here</p>
              <p className="text-sm text-muted-foreground">
                {bucket === "__all" && !query
                  ? "Every live invoice in this school is settled."
                  : "No family matches these filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="pl-6">Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Notice</TableHead>
                    <TableHead className="pr-6 text-right">Act</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const behind = r.due_level > r.notice_level;
                    const phone = r.parent_phone ?? r.student_phone;
                    return (
                      <TableRow key={r.student_id}>
                        <TableCell className="pl-6">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.student_code ?? ABSENT} · {r.unpaid_invoices} unpaid
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[r.class_name, r.section_name].filter(Boolean).join(" ") || ABSENT}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{r.parent_name ?? ABSENT}</div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {phone ? (
                              <>
                                <Phone className="h-3 w-3" /> {phone}
                              </>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">
                                No phone on record
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                          {amount(r.outstanding)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {r.days_overdue > 0 ? `${r.days_overdue} days` : "Not due"}
                          </div>
                          {r.oldest_due_date ? (
                            <div className="text-xs text-muted-foreground">
                              since {formatDate(r.oldest_due_date)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`rounded-md font-normal ${NOTICE_TONE[r.notice_level] ?? ""}`}
                          >
                            {NOTICE_LABELS[r.notice_level] ?? "None"}
                          </Badge>
                          {behind ? (
                            <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                              due: {NOTICE_LABELS[r.due_level]}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => remind(r)}
                            disabled={!phone}
                            title={phone ? "Open WhatsApp with a reminder" : "No phone on record"}
                          >
                            <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Remind
                          </Button>
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
    </div>
  );
}

export default DefaultersBoard;
