import { localDay } from "@/lib/local-date";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search, TrendingDown } from "lucide-react";

import { api } from "@/lib/api";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportExportMenu } from "@/components/accountant/ReportExportMenu";
import { ErrorState, LoadingRows, ModuleHeader } from "@/components/tenant/module-kit";
import { money } from "@/lib/documents/format";
import { sum } from "@/lib/documents/decimal";

/**
 * Amounts keep their paisa.
 *
 * This used to format with `maximumFractionDigits: 0`, which rounds every
 * vendor's spend to whole rupees before it is shown - and the total was the
 * sum of the rounded figures, so the screen disagreed with the ledger it was
 * built from.
 */
const fmt = (value: number | string) => money(String(value ?? 0), { currency: "PKR" });

export function AccountantVendorsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const today = new Date();
  const ago = localDay(new Date(today.getFullYear(), today.getMonth() - 5, 1));
  const last = localDay(today);

  const [from, setFrom] = useState(ago);
  const [to, setTo] = useState(last);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: expenses = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["vendor_expenses", schoolId, from, to],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await api
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
      // Added as decimals, so the total is the ledger's total.
      spend: sum(vendors.map((v) => String(v.total))),
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
      <ModuleHeader
        icon={Building2}
        tone="slate"
        title="Vendors"
        description="Every supplier and service provider the school has paid in this period, ranked by what they were paid."
        actions={
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
                value: totals.vendors ? fmt(Number(totals.spend) / totals.vendors) : "—",
              },
            ],
          }}
          />
        }
      />

      {isError ? (
        <Card className="rounded-2xl border-rose-200 dark:border-rose-900">
          <ErrorState title="The vendor spend could not be loaded" error={error} onRetry={() => refetch()} />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center justify-between p-3.5 sm:p-5">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase font-semibold">Active Vendors</p>
              <p className="text-xl sm:text-2xl font-bold tabular-nums mt-0.5 sm:mt-1">{totals.vendors}</p>
            </div>
            <Building2 className="h-6 w-6 sm:h-8 sm:w-8 shrink-0 text-primary/60" />
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 sm:p-5">
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase font-semibold">Transactions</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums mt-0.5 sm:mt-1">{totals.transactions}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="flex items-center justify-between p-3.5 sm:p-5">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase font-semibold">Total Spend</p>
              <p className="truncate text-xl sm:text-2xl font-bold tabular-nums text-rose-600 mt-0.5 sm:mt-1">{fmt(totals.spend)}</p>
            </div>
            <TrendingDown className="h-6 w-6 sm:h-8 sm:w-8 shrink-0 text-rose-500/60" />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="grid gap-3 p-3.5 sm:p-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" className="rounded-xl h-9 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" className="rounded-xl h-9 text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Search vendor</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 rounded-xl h-9 text-xs" placeholder="Vendor name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="list" className="space-y-4">
        <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
          <TabsList className="inline-flex w-max min-w-full sm:w-auto p-1 rounded-xl">
            <TabsTrigger value="list" className="rounded-lg text-xs font-semibold whitespace-nowrap">Vendors</TabsTrigger>
            <TabsTrigger value="details" disabled={!selected} className="rounded-lg text-xs font-semibold whitespace-nowrap">
              Details {selected ? `(${selected})` : ""}
            </TabsTrigger>
          </TabsList>
        </div>

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
                          {Number(totals.spend) ? ((v.total / Number(totals.spend)) * 100).toFixed(1) : "0.0"}%
                        </TableCell>
                      </TableRow>
                    ))}
                    {isLoading && filteredVendors.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <LoadingRows rows={4} />
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoading && filteredVendors.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                          {search.trim()
                            ? `No vendor matches "${search.trim()}" in this period.`
                            : "No expense in this period names a vendor. Record the supplier on an expense and it will appear here."}
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
