import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, Wallet, TrendingUp, TrendingDown, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportExportMenu } from "@/components/accountant/ReportExportMenu";

type Entry = {
  id: string;
  date: string;
  type: "inflow" | "outflow";
  category: string;
  reference: string;
  description: string;
  amount: number;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(n || 0);

export function AccountantLedgerModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const last = today.toISOString().slice(0, 10);

  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(last);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("__all");
  const [tab, setTab] = useState("journal");

  const { data: payments = [] } = useQuery({
    queryKey: ["ledger_payments", schoolId, from, to],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_payments")
        .select("id, amount, method, status, transaction_ref, paid_at, notes, created_at")
        .eq("school_id", schoolId!)
        .eq("status", "success")
        .gte("paid_at", `${from}T00:00:00`)
        .lte("paid_at", `${to}T23:59:59`)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["ledger_expenses", schoolId, from, to],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_expenses")
        .select("id, description, amount, category, expense_date, vendor")
        .eq("school_id", schoolId!)
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const entries: Entry[] = useMemo(() => {
    const inflows: Entry[] = (payments as any[]).map((p) => ({
      id: `p-${p.id}`,
      date: (p.paid_at || p.created_at || "").slice(0, 10),
      type: "inflow",
      category: p.method || "payment",
      reference: p.transaction_ref || p.id.slice(0, 8),
      description: p.notes || "Fee payment",
      amount: Number(p.amount || 0),
    }));
    const outflows: Entry[] = (expenses as any[]).map((e) => ({
      id: `e-${e.id}`,
      date: e.expense_date,
      type: "outflow",
      category: e.category || "other",
      reference: e.vendor || "—",
      description: e.description || "Expense",
      amount: Number(e.amount || 0),
    }));
    return [...inflows, ...outflows].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [payments, expenses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter !== "__all" && e.type !== typeFilter) return false;
      if (!q) return true;
      return (
        e.description.toLowerCase().includes(q) ||
        e.reference.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    });
  }, [entries, search, typeFilter]);

  const totals = useMemo(() => {
    const inflow = entries.filter((e) => e.type === "inflow").reduce((s, e) => s + e.amount, 0);
    const outflow = entries.filter((e) => e.type === "outflow").reduce((s, e) => s + e.amount, 0);
    return { inflow, outflow, net: inflow - outflow };
  }, [entries]);

  // Running balance (oldest -> newest)
  const withBalance = useMemo(() => {
    const asc = [...filtered].sort((a, b) => (a.date < b.date ? -1 : 1));
    let bal = 0;
    const rows = asc.map((e) => {
      bal += e.type === "inflow" ? e.amount : -e.amount;
      return { ...e, balance: bal };
    });
    return rows.reverse();
  }, [filtered]);

  // Category breakdown
  const breakdown = useMemo(() => {
    const map = new Map<string, { category: string; type: string; total: number; count: number }>();
    for (const e of filtered) {
      const k = `${e.type}:${e.category}`;
      const cur = map.get(k) || { category: e.category, type: e.type, total: 0, count: 0 };
      cur.total += e.amount;
      cur.count += 1;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filtered]);

  const exportRows = withBalance.map((e) => ({
    Date: e.date,
    Type: e.type === "inflow" ? "Inflow" : "Outflow",
    Category: e.category,
    Reference: e.reference,
    Description: e.description,
    Amount: e.amount,
    Balance: e.balance,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Cash Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Unified journal of every inflow and outflow across the school.
          </p>
        </div>
        <ReportExportMenu
          baseName="cash-ledger"
          rows={exportRows}
          print={{
            title: "Cash Ledger",
            subtitle: `${from} → ${to}`,
            summary: [
              { label: "Inflows", value: fmt(totals.inflow) },
              { label: "Outflows", value: fmt(totals.outflow) },
              { label: "Net", value: fmt(totals.net) },
              { label: "Entries", value: String(entries.length) },
            ],
          }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total Inflows</p>
              <p className="truncate text-2xl font-semibold tabular-nums text-emerald-600">{fmt(totals.inflow)}</p>
            </div>
            <ArrowDownCircle className="h-8 w-8 shrink-0 text-emerald-500/60" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total Outflows</p>
              <p className="truncate text-2xl font-semibold tabular-nums text-rose-600">{fmt(totals.outflow)}</p>
            </div>
            <ArrowUpCircle className="h-8 w-8 shrink-0 text-rose-500/60" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Net Position</p>
              <p
                className={`truncate text-2xl font-semibold tabular-nums ${
                  totals.net >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {fmt(totals.net)}
              </p>
            </div>
            <Wallet className="h-8 w-8 shrink-0 text-primary/60" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All</SelectItem>
                <SelectItem value="inflow">Inflows only</SelectItem>
                <SelectItem value="outflow">Outflows only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Description, ref, category" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="journal">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Journal Entries ({withBalance.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withBalance.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap">{e.date}</TableCell>
                        <TableCell>
                          <Badge variant={e.type === "inflow" ? "default" : "destructive"} className="gap-1">
                            {e.type === "inflow" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {e.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">{e.category}</TableCell>
                        <TableCell className="font-mono text-xs">{e.reference}</TableCell>
                        <TableCell className="max-w-[280px] truncate">{e.description}</TableCell>
                        <TableCell className={`text-right tabular-nums ${e.type === "inflow" ? "text-emerald-600" : "text-rose-600"}`}>
                          {e.type === "inflow" ? "+" : "−"} {fmt(e.amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(e.balance)}</TableCell>
                      </TableRow>
                    ))}
                    {withBalance.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No entries for the selected period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Category Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdown.map((b) => (
                      <TableRow key={`${b.type}-${b.category}`}>
                        <TableCell>
                          <Badge variant={b.type === "inflow" ? "default" : "destructive"}>{b.type}</Badge>
                        </TableCell>
                        <TableCell className="capitalize">{b.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.count}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(b.total)}</TableCell>
                      </TableRow>
                    ))}
                    {breakdown.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          Nothing to summarise.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
