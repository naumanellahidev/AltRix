import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, TrendingDown, Trash2, Edit, Filter, WifiOff, RefreshCw } from "lucide-react";
import { ReportExportMenu } from "@/components/accountant/ReportExportMenu";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useOfflineExpenses, useOfflinePaymentMethods } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Expense = {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
  vendor: string | null;
  reference: string | null;
  payment_method_id: string | null;
};

type PaymentMethod = {
  id: string;
  name: string;
};

const EXPENSE_CATEGORIES = [
  "salaries",
  "utilities",
  "rent",
  "supplies",
  "maintenance",
  "transport",
  "marketing",
  "events",
  "equipment",
  "professional_services",
  "insurance",
  "taxes",
  "other",
];

export function AccountantExpensesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const queryClient = useQueryClient();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  // Offline hooks
  const { isOffline, isUsingCache, refresh: refreshOffline } = useOfflineExpenses(schoolId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("other");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formVendor, setFormVendor] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formMethodId, setFormMethodId] = useState("");

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["finance_expenses", schoolId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("finance_expenses")
        .select("*")
        .eq("school_id", schoolId!)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data as unknown as Expense[];
    },
    enabled: !!schoolId,
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ["finance_payment_methods", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_payment_methods")
        .select("id, name")
        .eq("school_id", schoolId!)
        .eq("is_active", true);
      if (error) throw error;
      return data as PaymentMethod[];
    },
    enabled: !!schoolId,
  });

  const resetForm = () => {
    setFormDescription("");
    setFormAmount("");
    setFormCategory("other");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormVendor("");
    setFormReference("");
    setFormMethodId("");
    setEditingExpense(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setFormDescription(expense.description);
    setFormAmount(expense.amount.toString());
    setFormCategory(expense.category);
    setFormDate(expense.expense_date);
    setFormVendor(expense.vendor || "");
    setFormReference(expense.reference || "");
    setFormMethodId(expense.payment_method_id || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!schoolId) return;
    if (!formDescription.trim()) {
      toast.error("Description is required");
      return;
    }
    const amount = Number(formAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }

    const expenseData = {
      description: formDescription.trim(),
      amount,
      category: formCategory,
      expense_date: formDate,
      vendor: formVendor.trim() || null,
      reference: formReference.trim() || null,
      payment_method_id: formMethodId || null,
    };

    if (editingExpense) {
      const { error } = await supabase
        .from("finance_expenses")
        .update(expenseData)
        .eq("id", editingExpense.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Expense updated");
    } else {
      const { error } = await supabase.from("finance_expenses").insert({
        school_id: schoolId,
        ...expenseData,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Expense recorded");
    }

    setDialogOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["finance_expenses", schoolId] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("finance_expenses").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Expense deleted");
    queryClient.invalidateQueries({ queryKey: ["finance_expenses", schoolId] });
  };

  const getMethodName = (methodId: string | null) => {
    if (!methodId) return "—";
    const method = paymentMethods.find((m) => m.id === methodId);
    return method?.name || "Unknown";
  };

  const formatCategory = (cat: string) => {
    return cat.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      salaries: "bg-primary/10 text-primary",
      utilities: "bg-blue-500/10 text-blue-500",
      rent: "bg-purple-500/10 text-purple-500",
      supplies: "bg-orange-500/10 text-orange-500",
      maintenance: "bg-yellow-500/10 text-yellow-500",
      transport: "bg-green-500/10 text-green-500",
      marketing: "bg-pink-500/10 text-pink-500",
      events: "bg-indigo-500/10 text-indigo-500",
      equipment: "bg-cyan-500/10 text-cyan-500",
    };
    return colors[cat] || "bg-muted text-muted-foreground";
  };

  const filteredExpenses = categoryFilter === "all"
    ? expenses
    : expenses.filter((e) => e.category === categoryFilter);

  // Calculate stats
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const stats = {
    total: expenses.reduce((sum, e) => sum + e.amount, 0),
    thisMonth: expenses
      .filter((e) => new Date(e.expense_date) >= startOfMonth)
      .reduce((sum, e) => sum + e.amount, 0),
    byCategory: EXPENSE_CATEGORIES.map((cat) => ({
      category: cat,
      amount: expenses.filter((e) => e.category === cat).reduce((sum, e) => sum + e.amount, 0),
    })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount),
  };

  if (isLoading && !isUsingCache) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={refreshOffline} />
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Expenses</p>
            <p className="text-2xl font-semibold text-destructive">{stats.total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">This Month</p>
            <p className="text-2xl font-semibold">{stats.thisMonth.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Top Category</p>
            <p className="text-2xl font-semibold">
              {stats.byCategory[0]?.category ? formatCategory(stats.byCategory[0].category) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Expenses List */}
        <Card className="shadow-elevated lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-display text-xl">Expenses</CardTitle>
              <p className="text-sm text-muted-foreground">Track and manage all expenses</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {(() => {
                const exportRows = filteredExpenses.map((e) => ({
                  date: e.expense_date,
                  description: e.description,
                  category: formatCategory(e.category),
                  amount: e.amount,
                  vendor: e.vendor || "",
                  reference: e.reference || "",
                  method: getMethodName(e.payment_method_id),
                }));
                const total = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
                return (
                  <ReportExportMenu
                    baseName="expenses"
                    rows={exportRows}
                    print={{
                      title: "Expenses Report",
                      subtitle: `Generated ${new Date().toLocaleDateString()} • Category: ${categoryFilter}`,
                      summary: [
                        { label: "Entries", value: filteredExpenses.length },
                        { label: "Total spend", value: total.toLocaleString() },
                      ],
                    }}
                  />
                );
              })()}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {formatCategory(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="hero" onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Add Expense
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
                    <DialogDescription>Record a new expense transaction</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="What was this expense for?"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Amount</Label>
                        <Input
                          type="number"
                          value={formAmount}
                          onChange={(e) => setFormAmount(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Date</Label>
                        <Input
                          type="date"
                          value={formDate}
                          onChange={(e) => setFormDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select value={formCategory} onValueChange={setFormCategory}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {formatCategory(cat)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Payment Method</Label>
                        <Select value={formMethodId} onValueChange={setFormMethodId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentMethods.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Vendor (optional)</Label>
                        <Input
                          value={formVendor}
                          onChange={(e) => setFormVendor(e.target.value)}
                          placeholder="Vendor name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Reference (optional)</Label>
                        <Input
                          value={formReference}
                          onChange={(e) => setFormReference(e.target.value)}
                          placeholder="Receipt #, invoice #"
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave}>{editingExpense ? "Update" : "Add Expense"}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[400px] overflow-auto rounded-xl border bg-surface">
              <div className="min-w-max">
                <Table className="min-w-[900px]">

                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{new Date(expense.expense_date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {expense.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={getCategoryColor(expense.category)}>
                          {formatCategory(expense.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-destructive font-medium">
                        -{expense.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>{expense.vendor || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(expense)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete expense?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(expense.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredExpenses.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        <TrendingDown className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                        No expenses found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="text-lg">By Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[380px]">
              <div className="space-y-3">
                {stats.byCategory.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{formatCategory(cat.category)}</span>
                      <span className="text-muted-foreground">{cat.amount.toLocaleString()}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(cat.amount / stats.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {stats.byCategory.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No expense data to display
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
