import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search, TrendingDown } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportExportMenu } from "@/components/accountant/ReportExportMenu";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(n || 0);

export function AccountantVendorsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const today = new Date();
  const ago = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString().slice(0, 10);
  const last = today.toISOString().slice(0, 10);

  const [from, setFrom] = useState(ago);
  const [to, setTo] = useState(last);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: expenses = [] } = useQuery({
    queryKey: ["vendor_expenses", schoolId, from, to],
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

  const vendors = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; last: string; categories: Set<string> }>();
    for (const e of expenses as any[]) {
      const name = (e.vendor || "Unspecified").trim() || "Unspecified";
      const cur = map.get(name) || { name, total: 0, count: 0, last: "", categories: new Set<string>() };
      cur.total += Number(e.amount || 0);
      cur.count += 1;
      if (!cur.last || e.expense_date > cur.last) cur.last = e.expense_date;
      if (e.category) cur.categories.add(e.category);
      map.set(name, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [expenses]);

  const filteredVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) => v.name.toLowerCase().includes(q));
  }, [vendors, search]);

  const totals = useMemo(
    () => ({
      vendors: vendors.length,
      spend: vendors.reduce((s, v) => s + v.total, 0),
      transactions: vendors.reduce((s, v) => s + v.count, 0),
    }),
    [vendors],
  );

  const selectedTransactions = useMemo(() => {
    if (!selected) return [];
    return (expenses as any[]).filter((e) => (e.vendor || "Unspecified") === selected);
  }, [expenses, selected]);

  const exportRows = filteredVendors.map((v, i) => ({
    Rank: i + 1,
    Vendor: v.name,
    Transactions: v.count,
    Categories: [...v.categories].join(", "),
    "Last Activity": v.last,
    "Total Spend": v.total,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground">Suppliers and service providers ranked by spend.</p>
        </div>
        <ReportExportMenu
          baseName="vendors-spend"
          rows={exportRows}
          print={{
            title: "Vendor Spend",
            subtitle: `${from} → ${to}`,
            summary: [
              { label: "Vendors", value: String(totals.vendors) },
              { label: "Transactions", value: String(totals.transactions) },
              { label: "Total Spend", value: fmt(totals.spend) },
              {
                label: "Avg / Vendor",
                value: fmt(totals.vendors ? totals.spend / totals.vendors : 0),
              },
            ],
          }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Active Vendors</p>
              <p className="text-2xl font-semibold tabular-nums">{totals.vendors}</p>
            </div>
            <Building2 className="h-8 w-8 shrink-0 text-primary/60" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="text-2xl font-semibold tabular-nums">{totals.transactions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total Spend</p>
              <p className="truncate text-2xl font-semibold tabular-nums text-rose-600">{fmt(totals.spend)}</p>
            </div>
            <TrendingDown className="h-8 w-8 shrink-0 text-rose-500/60" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Search vendor</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Vendor name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Vendors</TabsTrigger>
          <TabsTrigger value="details" disabled={!selected}>
            Details {selected ? `(${selected})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Vendor Ranking ({filteredVendors.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Categories</TableHead>
                      <TableHead className="text-right">Txns</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead className="text-right">Total Spend</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVendors.map((v, i) => (
                      <TableRow
                        key={v.name}
                        className="cursor-pointer"
                        onClick={() => setSelected(v.name)}
                      >
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{v.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {[...v.categories].slice(0, 3).map((c) => (
                              <Badge key={c} variant="secondary" className="capitalize">
                                {c}
                              </Badge>
                            ))}
                            {v.categories.size > 3 && (
                              <Badge variant="outline">+{v.categories.size - 3}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{v.count}</TableCell>
                        <TableCell className="whitespace-nowrap">{v.last}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(v.total)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {totals.spend ? ((v.total / totals.spend) * 100).toFixed(1) : "0.0"}%
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredVendors.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No vendors in this period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Transactions — {selected} ({selectedTransactions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTransactions.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">{t.expense_date}</TableCell>
                        <TableCell className="capitalize">{t.category || "—"}</TableCell>
                        <TableCell className="max-w-[360px] truncate">{t.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(Number(t.amount || 0))}</TableCell>
                      </TableRow>
                    ))}
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
