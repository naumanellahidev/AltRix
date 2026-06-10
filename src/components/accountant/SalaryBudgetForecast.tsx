import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Calendar,
  DollarSign,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  PiggyBank,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
} from "recharts";

import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useTenant } from "@/hooks/useTenant";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type BudgetTarget = {
  id: string;
  fiscal_year: number;
  department: string | null;
  role: string | null;
  budget_amount: number;
  notes: string | null;
};

type SalaryRecord = {
  id: string;
  user_id: string;
  base_salary: number;
  allowances: number;
  deductions: number;
  is_active: boolean;
};

type StaffWithRole = {
  user_id: string;
  role: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function SalaryBudgetForecast() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const queryClient = useQueryClient();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetTarget | null>(null);

  // Form state
  const [formRole, setFormRole] = useState<string>("");
  const [formDepartment, setFormDepartment] = useState<string>("");
  const [formAmount, setFormAmount] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Fetch budget targets
  const { data: budgetTargets = [] } = useQuery({
    queryKey: ["salary_budget_targets", schoolId, selectedYear],
    queryFn: async () => {
      if (USE_FASTAPI) {
        const { data } = await apiClient.get(`/finance/budget-targets?school_id=${schoolId}&year=${selectedYear}`);
        return (data || []) as BudgetTarget[];
      } else {
        const { data, error } = await supabase
          .from("salary_budget_targets")
          .select("*")
          .eq("school_id", schoolId!)
          .eq("fiscal_year", selectedYear)
          .order("role", { ascending: true });
        if (error) throw error;
        return (data || []) as BudgetTarget[];
      }
    },
    enabled: !!schoolId,
  });

  // Fetch active salary records
  const { data: salaryRecords = [] } = useQuery({
    queryKey: ["hr_salary_records_forecast", schoolId],
    queryFn: async () => {
      if (USE_FASTAPI) {
        const { data } = await apiClient.get(`/finance/salary-records?school_id=${schoolId}`);
        return (data || []) as SalaryRecord[];
      } else {
        const { data, error } = await supabase
          .from("hr_salary_records")
          .select("id, user_id, base_salary, allowances, deductions, is_active")
          .eq("school_id", schoolId!)
          .eq("is_active", true);
        if (error) throw error;
        return (data || []).map((r) => ({
          ...r,
          allowances: r.allowances || 0,
          deductions: r.deductions || 0,
        })) as SalaryRecord[];
      }
    },
    enabled: !!schoolId,
  });

  // Fetch staff roles
  const { data: staffRoles = [] } = useQuery({
    queryKey: ["staff_roles_forecast", schoolId],
    queryFn: async () => {
      if (USE_FASTAPI) {
        const { data } = await apiClient.get(`/finance/staff-roles?school_id=${schoolId}`);
        return (data || []) as StaffWithRole[];
      } else {
        const { data, error } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .eq("school_id", schoolId!);
        if (error) throw error;
        return (data || []) as StaffWithRole[];
      }
    },
    enabled: !!schoolId,
  });

  const roleMap = useMemo(() => {
    const map = new Map<string, string>();
    staffRoles.forEach((s) => {
      if (!map.has(s.user_id)) {
        map.set(s.user_id, s.role);
      }
    });
    return map;
  }, [staffRoles]);

  // Calculate actual spending by role
  const actualByRole = useMemo(() => {
    const roleData = new Map<string, { monthly: number; annual: number; count: number }>();

    salaryRecords.forEach((s) => {
      const role = roleMap.get(s.user_id) || "other";
      const monthlySalary = s.base_salary + s.allowances - s.deductions;
      const existing = roleData.get(role) || { monthly: 0, annual: 0, count: 0 };
      existing.monthly += monthlySalary;
      existing.annual += monthlySalary * 12;
      existing.count += 1;
      roleData.set(role, existing);
    });

    return roleData;
  }, [salaryRecords, roleMap]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalBudget = budgetTargets.reduce((sum, b) => sum + b.budget_amount, 0);
    const totalActualMonthly = salaryRecords.reduce((sum, s) => sum + s.base_salary + s.allowances - s.deductions, 0);
    const totalActualAnnual = totalActualMonthly * 12;
    const variance = totalBudget - totalActualAnnual;
    const variancePercent = totalBudget > 0 ? (variance / totalBudget) * 100 : 0;
    const utilizationPercent = totalBudget > 0 ? (totalActualAnnual / totalBudget) * 100 : 0;

    return {
      totalBudget,
      totalActualMonthly,
      totalActualAnnual,
      variance,
      variancePercent,
      utilizationPercent,
    };
  }, [budgetTargets, salaryRecords]);

  // Variance analysis by role
  const varianceAnalysis = useMemo(() => {
    const roles = new Set<string>();
    budgetTargets.forEach((b) => b.role && roles.add(b.role));
    actualByRole.forEach((_, role) => roles.add(role));

    return Array.from(roles).map((role) => {
      const budget = budgetTargets.find((b) => b.role === role)?.budget_amount || 0;
      const actual = actualByRole.get(role)?.annual || 0;
      const variance = budget - actual;
      const variancePercent = budget > 0 ? (variance / budget) * 100 : 0;
      const status = variance >= 0 ? "under" : "over";

      return {
        role: role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, " "),
        roleKey: role,
        budget,
        actual,
        variance,
        variancePercent,
        status,
        employees: actualByRole.get(role)?.count || 0,
      };
    }).sort((a, b) => a.variance - b.variance);
  }, [budgetTargets, actualByRole]);

  // Monthly forecast data
  const monthlyForecast = useMemo(() => {
    const monthlyActual = totals.totalActualMonthly;
    const monthlyBudget = totals.totalBudget / 12;
    const currentMonth = new Date().getMonth();

    return MONTHS.map((month, idx) => {
      const isPast = idx <= currentMonth;
      const cumActual = isPast ? monthlyActual * (idx + 1) : monthlyActual * (currentMonth + 1);
      const cumBudget = monthlyBudget * (idx + 1);
      const projected = isPast ? monthlyActual : monthlyActual; // Assuming constant

      return {
        month,
        budget: Math.round(monthlyBudget),
        actual: isPast ? Math.round(monthlyActual) : 0,
        projected: !isPast ? Math.round(projected) : 0,
        cumBudget: Math.round(cumBudget),
        cumActual: Math.round(cumActual),
      };
    });
  }, [totals]);

  const resetForm = () => {
    setFormRole("");
    setFormDepartment("");
    setFormAmount("");
    setFormNotes("");
    setEditingBudget(null);
  };

  const openEditDialog = (budget: BudgetTarget) => {
    setEditingBudget(budget);
    setFormRole(budget.role || "");
    setFormDepartment(budget.department || "");
    setFormAmount(budget.budget_amount.toString());
    setFormNotes(budget.notes || "");
    setDialogOpen(true);
  };

  const handleSaveBudget = async () => {
    if (!schoolId) return;
    const amount = Number(formAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Please enter a valid budget amount");
      return;
    }

    try {
      if (USE_FASTAPI) {
        const body = {
          id: editingBudget?.id || undefined,
          school_id: schoolId,
          fiscal_year: selectedYear,
          role: formRole || null,
          department: formDepartment || null,
          budget_amount: amount,
          notes: formNotes.trim() || null,
        };
        await apiClient.post("/finance/budget-targets", body);
        toast.success(editingBudget ? "Budget updated" : "Budget target added");
      } else {
        if (editingBudget) {
          const { error } = await supabase
            .from("salary_budget_targets")
            .update({
              role: formRole || null,
              department: formDepartment || null,
              budget_amount: amount,
              notes: formNotes.trim() || null,
            })
            .eq("id", editingBudget.id);

          if (error) throw error;
          toast.success("Budget updated");
        } else {
          const { error } = await supabase.from("salary_budget_targets").insert([
            {
              school_id: schoolId,
              fiscal_year: selectedYear,
              role: formRole || null,
              department: formDepartment || null,
              budget_amount: amount,
              notes: formNotes.trim() || null,
            },
          ]);

          if (error) throw error;
          toast.success("Budget target added");
        }
      }
      setDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["salary_budget_targets", schoolId, selectedYear] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save budget target");
    }
  };

  const handleDeleteBudget = async (id: string) => {
    try {
      if (USE_FASTAPI) {
        await apiClient.delete(`/finance/budget-targets/${id}`);
      } else {
        const { error } = await supabase.from("salary_budget_targets").delete().eq("id", id);
        if (error) throw error;
      }
      toast.success("Budget target deleted");
      queryClient.invalidateQueries({ queryKey: ["salary_budget_targets", schoolId, selectedYear] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete budget target");
    }
  };

  const getVarianceColor = (variance: number) => {
    if (variance > 0) return "text-primary";
    if (variance < -10) return "text-destructive";
    return "text-warning";
  };

  const getStatusBadge = (status: string, percent: number) => {
    if (status === "under") {
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20">
          <CheckCircle className="mr-1 h-3 w-3" /> Under Budget
        </Badge>
      );
    }
    return (
      <Badge className="bg-destructive/10 text-destructive border-destructive/20">
        <AlertTriangle className="mr-1 h-3 w-3" /> Over by {Math.abs(percent).toFixed(1)}%
      </Badge>
    );
  };

  const availableRoles = [
    "teacher",
    "principal",
    "vice_principal",
    "accountant",
    "hr_manager",
    "academic_coordinator",
    "counselor",
    "marketing_staff",
  ];

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Salary Budget Forecasting</h2>
          <p className="text-sm text-muted-foreground">Project annual costs and analyze budget variance</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button variant="hero">
                <Plus className="mr-2 h-4 w-4" /> Add Budget Target
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingBudget ? "Edit" : "Add"} Budget Target</DialogTitle>
                <DialogDescription>Set annual budget target for {selectedYear}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={formRole || "all"} onValueChange={(v) => setFormRole(v === "all" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      {availableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Department (Optional)</Label>
                  <Input
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    placeholder="e.g., Science, Admin"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Annual Budget Amount</Label>
                  <Input
                    type="number"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="e.g., 5000000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Optional notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button onClick={handleSaveBudget}>
                  {editingBudget ? "Update" : "Add"} Budget
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <p className="text-sm text-muted-foreground">Annual Budget</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{totals.totalBudget.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">FY {selectedYear}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Projected Annual</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{totals.totalActualAnnual.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Based on current salaries</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              {totals.variance >= 0 ? (
                <TrendingDown className="h-4 w-4 text-primary" />
              ) : (
                <TrendingUp className="h-4 w-4 text-destructive" />
              )}
              <p className="text-sm text-muted-foreground">Variance</p>
            </div>
            <p className={`mt-2 text-2xl font-semibold ${getVarianceColor(totals.variancePercent)}`}>
              {totals.variance >= 0 ? "+" : ""}{totals.variance.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              {totals.variancePercent >= 0 ? "Under" : "Over"} by {Math.abs(totals.variancePercent).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Utilization</p>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-semibold">{totals.utilizationPercent.toFixed(1)}%</p>
              <Progress value={Math.min(totals.utilizationPercent, 100)} className="mt-2 h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Forecast Chart */}
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="text-lg">Monthly Forecast vs Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart 
                  data={monthlyForecast}
                  margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    height={30}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        budget: "Budget",
                        actual: "Actual",
                        projected: "Projected",
                      };
                      return [value.toLocaleString(), labels[name] || name];
                    }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px"
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
                  <Bar dataKey="budget" name="Budget" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="projected" name="Projected" fill="hsl(var(--primary) / 0.5)" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Cumulative Trend */}
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="text-lg">Cumulative Budget vs Actual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart 
                  data={monthlyForecast}
                  margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    height={30}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip 
                    formatter={(value: number) => value.toLocaleString()}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px"
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
                  <Line
                    type="monotone"
                    dataKey="cumBudget"
                    name="Cumulative Budget"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumActual"
                    name="Cumulative Actual"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                  {totals.totalBudget > 0 && (
                    <ReferenceLine
                      y={totals.totalBudget}
                      stroke="hsl(var(--destructive))"
                      strokeDasharray="3 3"
                      label={{ value: "Annual", position: "right", fontSize: 9 }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Variance Analysis by Role */}
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Variance Analysis by Role
          </CardTitle>
        </CardHeader>
        <CardContent>
          {varianceAnalysis.length > 0 ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={varianceAnalysis} 
                    layout="vertical" 
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      type="number" 
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      type="category" 
                      dataKey="role" 
                      width={90} 
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      formatter={(value: number) => value.toLocaleString()}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px"
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
                    <Bar dataKey="budget" name="Budget" fill="hsl(var(--muted-foreground) / 0.4)" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="actual" name="Actual" radius={[0, 4, 4, 0]}>
                      {varianceAnalysis.map((entry) => (
                        <Cell
                          key={entry.roleKey}
                          fill={entry.status === "under" ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {varianceAnalysis.map((item) => (
                    <div key={item.roleKey} className="rounded-xl border p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{item.role}</span>
                        {getStatusBadge(item.status, item.variancePercent)}
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Budget</p>
                          <p className="font-semibold">{item.budget.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Actual</p>
                          <p className="font-semibold">{item.actual.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Variance</p>
                          <p className={`font-semibold ${getVarianceColor(item.variance)}`}>
                            {item.variance >= 0 ? "+" : ""}{item.variance.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{item.employees} employees</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="py-12 text-center">
              <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">No budget targets set</p>
              <p className="text-sm text-muted-foreground/70">Add budget targets to see variance analysis</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Budget Targets Table */}
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="text-lg">Budget Targets</CardTitle>
        </CardHeader>
        <CardContent>
          {budgetTargets.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role / Department</TableHead>
                    <TableHead className="text-right">Annual Budget</TableHead>
                    <TableHead className="text-right">Actual (Projected)</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgetTargets.map((budget) => {
                    const actual = budget.role ? actualByRole.get(budget.role)?.annual || 0 : totals.totalActualAnnual;
                    const variance = budget.budget_amount - actual;
                    return (
                      <TableRow key={budget.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {budget.role
                                ? budget.role.charAt(0).toUpperCase() + budget.role.slice(1).replace(/_/g, " ")
                                : "All Roles"}
                            </p>
                            {budget.department && (
                              <p className="text-xs text-muted-foreground">{budget.department}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {budget.budget_amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">{actual.toLocaleString()}</TableCell>
                        <TableCell className={`text-right font-medium ${getVarianceColor(variance)}`}>
                          {variance >= 0 ? "+" : ""}{variance.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{budget.notes || "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(budget)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Budget Target?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove this budget target.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteBudget(budget.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <div className="py-12 text-center">
              <PiggyBank className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">No budget targets for {selectedYear}</p>
              <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add First Budget Target
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
