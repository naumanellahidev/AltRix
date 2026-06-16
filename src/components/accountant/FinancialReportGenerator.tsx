import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  FileText,
  Download,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  PieChart as PieChartIcon,
  BarChart3,
  Users,
  AlertCircle,
  CheckCircle,
  Printer,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";
import { motion } from "framer-motion";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
import { toast } from "sonner";

interface FinancialReportGeneratorProps {
  schoolId: string;
  schoolName?: string;
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const MotionCard = motion.create(Card);

export function FinancialReportGenerator({ schoolId, schoolName }: FinancialReportGeneratorProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [isGenerating, setIsGenerating] = useState(false);

  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 12; i++) {
      const date = subMonths(new Date(), i);
      options.push({
        value: format(date, "yyyy-MM"),
        label: format(date, "MMMM yyyy"),
      });
    }
    return options;
  }, []);

  const { startDate, endDate } = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(new Date(year, month - 1));
    return { startDate: start, endDate: end };
  }, [selectedMonth]);

  // Fetch financial data for selected month
  const { data: payments = [] } = useQuery({
    queryKey: ["report_payments", schoolId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_payments")
        .select("id, amount, paid_at, method")
        .eq("school_id", schoolId)
        .gte("paid_at", startDate.toISOString())
        .lte("paid_at", endDate.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["report_expenses", schoolId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_expenses")
        .select("id, amount, expense_date, category, description")
        .eq("school_id", schoolId)
        .gte("expense_date", startDate.toISOString())
        .lte("expense_date", endDate.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["report_invoices", schoolId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_invoices")
        .select("id, total_amount, status, created_at, due_date")
        .eq("school_id", schoolId)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());
      if (error) throw error;
      return (data || []).map((inv: any) => ({
        id: inv.id,
        total: inv.total_amount,
        status: inv.status,
        issue_date: inv.created_at,
        due_date: inv.due_date,
      })) || [];
    },
    enabled: !!schoolId,
  });

  const { data: payRuns = [] } = useQuery({
    queryKey: ["report_payruns", schoolId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_pay_runs")
        .select("id, gross_amount, net_amount, status, period_start, period_end")
        .eq("school_id", schoolId)
        .gte("period_start", startDate.toISOString())
        .lte("period_end", endDate.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  // Calculate report metrics
  const reportData = useMemo(() => {
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalInvoiced = invoices.reduce((sum, i) => sum + i.total, 0);
    const totalPayroll = payRuns
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + (p.net_amount || 0), 0);

    const paidInvoices = invoices.filter((i) => i.status === "paid").length;
    const pendingInvoices = invoices.filter((i) => i.status !== "paid").length;
    const collectionRate = totalInvoiced > 0 ? (totalRevenue / totalInvoiced) * 100 : 0;

    const grossProfit = totalRevenue - totalExpenses;
    const netProfit = grossProfit - totalPayroll;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Daily breakdown
    const dailyData: { date: string; revenue: number; expenses: number }[] = [];
    const daysInMonth = endDate.getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = format(new Date(startDate.getFullYear(), startDate.getMonth(), i), "MMM d");
      const dayStart = new Date(startDate.getFullYear(), startDate.getMonth(), i);
      const dayEnd = new Date(startDate.getFullYear(), startDate.getMonth(), i, 23, 59, 59);

      const dayRevenue = payments
        .filter((p) => {
          const date = new Date(p.paid_at);
          return date >= dayStart && date <= dayEnd;
        })
        .reduce((sum, p) => sum + p.amount, 0);

      const dayExpenses = expenses
        .filter((e) => {
          const date = new Date(e.expense_date);
          return date >= dayStart && date <= dayEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      if (dayRevenue > 0 || dayExpenses > 0) {
        dailyData.push({ date: dateStr, revenue: dayRevenue, expenses: dayExpenses });
      }
    }

    // Expense breakdown by category
    const expenseByCategory = new Map<string, number>();
    expenses.forEach((e) => {
      const current = expenseByCategory.get(e.category) || 0;
      expenseByCategory.set(e.category, current + e.amount);
    });
    const expenseBreakdown = Array.from(expenseByCategory.entries())
      .map(([name, value]) => ({
        name: name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        value,
        percentage: totalExpenses > 0 ? (value / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    // Invoice status breakdown
    const invoiceStatusMap = new Map<string, number>();
    invoices.forEach((i) => {
      const current = invoiceStatusMap.get(i.status) || 0;
      invoiceStatusMap.set(i.status, current + 1);
    });
    const invoiceStatus = Array.from(invoiceStatusMap.entries()).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));

    return {
      totalRevenue,
      totalExpenses,
      totalInvoiced,
      totalPayroll,
      paidInvoices,
      pendingInvoices,
      collectionRate,
      grossProfit,
      netProfit,
      profitMargin,
      dailyData,
      expenseBreakdown,
      invoiceStatus,
    };
  }, [payments, expenses, invoices, payRuns, startDate, endDate]);

  const handleExportPDF = async () => {
    setIsGenerating(true);
    try {
      // Generate a printable version
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast.error("Please allow popups to export the report");
        return;
      }

      const reportHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Financial Report - ${format(startDate, "MMMM yyyy")}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1a1a1a; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #e5e5e5; padding-bottom: 20px; }
            .header h1 { font-size: 28px; margin-bottom: 8px; }
            .header p { color: #666; }
            .section { margin-bottom: 30px; }
            .section h2 { font-size: 18px; margin-bottom: 16px; color: #333; border-left: 4px solid #3b82f6; padding-left: 12px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
            .card { background: #f8f9fa; border-radius: 8px; padding: 16px; }
            .card-label { font-size: 12px; color: #666; margin-bottom: 4px; }
            .card-value { font-size: 24px; font-weight: bold; }
            .card-value.positive { color: #22c55e; }
            .card-value.negative { color: #ef4444; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e5e5; }
            th { background: #f8f9fa; font-weight: 600; }
            .text-right { text-align: right; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e5e5e5; text-align: center; color: #666; font-size: 12px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Financial Report</h1>
            <p>${schoolName || "School"} - ${format(startDate, "MMMM yyyy")}</p>
            <p style="font-size: 12px; margin-top: 8px;">Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}</p>
          </div>

          <div class="section">
            <h2>Financial Summary</h2>
            <div class="grid">
              <div class="card">
                <div class="card-label">Total Revenue</div>
                <div class="card-value">PKR ${reportData.totalRevenue.toLocaleString()}</div>
              </div>
              <div class="card">
                <div class="card-label">Total Expenses</div>
                <div class="card-value">PKR ${reportData.totalExpenses.toLocaleString()}</div>
              </div>
              <div class="card">
                <div class="card-label">Payroll</div>
                <div class="card-value">PKR ${reportData.totalPayroll.toLocaleString()}</div>
              </div>
              <div class="card">
                <div class="card-label">Net Profit</div>
                <div class="card-value ${reportData.netProfit >= 0 ? "positive" : "negative"}">
                  PKR ${reportData.netProfit.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>Key Metrics</h2>
            <div class="grid">
              <div class="card">
                <div class="card-label">Collection Rate</div>
                <div class="card-value">${reportData.collectionRate.toFixed(1)}%</div>
              </div>
              <div class="card">
                <div class="card-label">Profit Margin</div>
                <div class="card-value ${reportData.profitMargin >= 0 ? "positive" : "negative"}">
                  ${reportData.profitMargin.toFixed(1)}%
                </div>
              </div>
              <div class="card">
                <div class="card-label">Total Invoiced</div>
                <div class="card-value">PKR ${reportData.totalInvoiced.toLocaleString()}</div>
              </div>
              <div class="card">
                <div class="card-label">Gross Profit</div>
                <div class="card-value ${reportData.grossProfit >= 0 ? "positive" : "negative"}">
                  PKR ${reportData.grossProfit.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>Invoice Summary</h2>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th class="text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.invoiceStatus.map((status) => `
                  <tr>
                    <td>${status.name}</td>
                    <td class="text-right">${status.value}</td>
                  </tr>
                `).join("")}
                <tr style="font-weight: bold;">
                  <td>Total</td>
                  <td class="text-right">${invoices.length}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Expense Breakdown</h2>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th class="text-right">Amount</th>
                  <th class="text-right">Percentage</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.expenseBreakdown.map((expense) => `
                  <tr>
                    <td>${expense.name}</td>
                    <td class="text-right">PKR ${expense.value.toLocaleString()}</td>
                    <td class="text-right">${expense.percentage.toFixed(1)}%</td>
                  </tr>
                `).join("")}
                <tr style="font-weight: bold;">
                  <td>Total</td>
                  <td class="text-right">PKR ${reportData.totalExpenses.toLocaleString()}</td>
                  <td class="text-right">100%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="footer">
            <p>This report was automatically generated by the Finance Management System</p>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(reportHTML);
      printWindow.document.close();
      
      // Wait for content to load then print
      printWindow.onload = () => {
        printWindow.print();
      };

      toast.success("Report generated successfully");
    } catch (error) {
      console.error("Failed to generate report:", error);
      toast.error("Failed to generate report");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ["Metric", "Value"];
    const rows = [
      ["Report Period", format(startDate, "MMMM yyyy")],
      ["Total Revenue", `PKR ${reportData.totalRevenue.toLocaleString()}`],
      ["Total Expenses", `PKR ${reportData.totalExpenses.toLocaleString()}`],
      ["Total Payroll", `PKR ${reportData.totalPayroll.toLocaleString()}`],
      ["Gross Profit", `PKR ${reportData.grossProfit.toLocaleString()}`],
      ["Net Profit", `PKR ${reportData.netProfit.toLocaleString()}`],
      ["Profit Margin", `${reportData.profitMargin.toFixed(1)}%`],
      ["Collection Rate", `${reportData.collectionRate.toFixed(1)}%`],
      ["Total Invoiced", `PKR ${reportData.totalInvoiced.toLocaleString()}`],
      ["Paid Invoices", reportData.paidInvoices.toString()],
      ["Pending Invoices", reportData.pendingInvoices.toString()],
      ["", ""],
      ["Expense Category", "Amount"],
      ...reportData.expenseBreakdown.map((e) => [e.name, `PKR ${e.value.toLocaleString()}`]),
    ];

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-report-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("CSV exported successfully");
  };

  return (
    <div className="space-y-6" ref={reportRef}>
      {/* Controls */}
      <Card className="shadow-elevated">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportCSV}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button onClick={handleExportPDF} disabled={isGenerating}>
                {isGenerating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="mr-2 h-4 w-4" />
                )}
                Print Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="shadow-elevated"
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">PKR {reportData.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="rounded-full bg-primary/10 p-3">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="shadow-elevated"
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-2xl font-bold">PKR {reportData.totalExpenses.toLocaleString()}</p>
              </div>
              <div className="rounded-full bg-chart-2/10 p-3">
                <TrendingDown className="h-5 w-5 text-chart-2" />
              </div>
            </div>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="shadow-elevated"
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className={`text-2xl font-bold ${reportData.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                  PKR {reportData.netProfit.toLocaleString()}
                </p>
              </div>
              <div className={`rounded-full p-3 ${reportData.netProfit >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
                {reportData.netProfit >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-primary" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-destructive" />
                )}
              </div>
            </div>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="shadow-elevated"
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Collection Rate</p>
                <p className="text-2xl font-bold">{reportData.collectionRate.toFixed(1)}%</p>
                <Progress value={reportData.collectionRate} className="mt-2 h-2" />
              </div>
              <div className="rounded-full bg-chart-3/10 p-3">
                <CheckCircle className="h-5 w-5 text-chart-3" />
              </div>
            </div>
          </CardContent>
        </MotionCard>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue vs Expenses Chart */}
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Daily Cash Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={reportData.dailyData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    height={30}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    formatter={(value: number) => `PKR ${value.toLocaleString()}`}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px"
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stackId="1"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.3}
                    name="Revenue"
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    stackId="2"
                    stroke="hsl(var(--chart-2))"
                    fill="hsl(var(--chart-2))"
                    fillOpacity={0.3}
                    name="Expenses"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown Pie Chart */}
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              Expense Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={reportData.expenseBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    labelLine={false}
                  >
                    {reportData.expenseBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [`PKR ${value.toLocaleString()}`, name]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px"
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Invoice Summary */}
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.invoiceStatus.map((status) => (
                  <TableRow key={status.name}>
                    <TableCell>
                      <Badge
                        variant={
                          status.name.toLowerCase() === "paid"
                            ? "default"
                            : status.name.toLowerCase() === "overdue"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {status.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{status.value}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold">
                  <TableCell>Total Invoices</TableCell>
                  <TableCell className="text-right">{invoices.length}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* P&L Summary */}
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Profit & Loss Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Total Revenue</TableCell>
                  <TableCell className="text-right font-medium text-primary">
                    PKR {reportData.totalRevenue.toLocaleString()}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Total Expenses</TableCell>
                  <TableCell className="text-right font-medium">
                    (PKR {reportData.totalExpenses.toLocaleString()})
                  </TableCell>
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="font-medium">Gross Profit</TableCell>
                  <TableCell className={`text-right font-bold ${reportData.grossProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                    PKR {reportData.grossProfit.toLocaleString()}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Payroll</TableCell>
                  <TableCell className="text-right font-medium">
                    (PKR {reportData.totalPayroll.toLocaleString()})
                  </TableCell>
                </TableRow>
                <TableRow className="border-t-2 bg-muted/50">
                  <TableCell className="font-bold">Net Profit</TableCell>
                  <TableCell className={`text-right font-bold text-lg ${reportData.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                    PKR {reportData.netProfit.toLocaleString()}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Profit Margin</TableCell>
                  <TableCell className={`text-right font-medium ${reportData.profitMargin >= 0 ? "text-primary" : "text-destructive"}`}>
                    {reportData.profitMargin.toFixed(1)}%
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
