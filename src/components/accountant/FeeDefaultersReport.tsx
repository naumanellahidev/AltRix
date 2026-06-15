import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, differenceInDays } from "date-fns";
import {
  AlertTriangle,
  Users,
  DollarSign,
  Download,
  Filter,
  Phone,
  Mail,
  Clock,
  TrendingUp,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Ban,
  Search,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";

interface FeeDefaultersReportProps {
  schoolId: string;
}

interface StudentLedger {
  student_id: string;
  school_id: string;
  first_name: string;
  last_name: string | null;
  student_code: string | null;
  total_invoiced: number;
  total_paid: number;
  outstanding_balance: number;
  invoice_count: number;
  payment_count: number;
  overdue_amount: number;
  overdue_count: number;
}

interface Invoice {
  id: string;
  invoice_no: string;
  student_id: string;
  total: number;
  status: string;
  issue_date: string;
  due_date: string | null;
}

interface StudentEnrollment {
  student_id: string;
  class_section_id: string;
}

interface ClassSection {
  id: string;
  name: string;
  class_id: string;
}

type PriorityLevel = "critical" | "high" | "medium" | "low";

interface Defaulter {
  student: StudentLedger;
  overdueInvoices: Invoice[];
  daysOverdue: number;
  priority: PriorityLevel;
  priorityScore: number;
  className: string | null;
}

const MotionCard = motion.create(Card);

const PRIORITY_COLORS: Record<PriorityLevel, string> = {
  critical: "hsl(var(--destructive))",
  high: "hsl(var(--warning))",
  medium: "hsl(var(--chart-3))",
  low: "hsl(var(--chart-4))",
};

export function FeeDefaultersReport({ schoolId }: FeeDefaultersReportProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("priority");
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  // Fetch student ledgers
  const { data: ledgers = [], isLoading: ledgersLoading } = useQuery({
    queryKey: ["student_fee_ledger_defaulters", schoolId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("student_fee_ledger")
        .select("*")
        .eq("school_id", schoolId)
        .gt("overdue_amount", 0)
        .order("overdue_amount", { ascending: false });
      if (error) throw error;
      return (data || []) as StudentLedger[];
    },
    enabled: !!schoolId,
  });

  // Fetch overdue invoices
  const { data: overdueInvoices = [] } = useQuery({
    queryKey: ["overdue_invoices", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_invoices")
        .select("*")
        .eq("school_id", schoolId)
        .neq("status", "paid")
        .lt("due_date", new Date().toISOString().split("T")[0])
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as Invoice[];
    },
    enabled: !!schoolId,
  });

  // Fetch student enrollments for class info
  const { data: enrollments = [] } = useQuery({
    queryKey: ["student_enrollments_defaulters", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_enrollments")
        .select("student_id, class_section_id")
        .eq("school_id", schoolId)
        .is("end_date", null);
      if (error) throw error;
      return (data || []) as StudentEnrollment[];
    },
    enabled: !!schoolId,
  });

  // Fetch class sections
  const { data: classSections = [] } = useQuery({
    queryKey: ["class_sections_defaulters", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_sections")
        .select("id, name, class_id")
        .eq("school_id", schoolId);
      if (error) throw error;
      return (data || []) as ClassSection[];
    },
    enabled: !!schoolId,
  });

  // Build defaulters list with priority scoring
  const defaulters = useMemo(() => {
    const today = new Date();
    const classSectionMap = new Map(classSections.map((cs) => [cs.id, cs.name]));
    const studentClassMap = new Map(enrollments.map((e) => [e.student_id, e.class_section_id]));

    return ledgers.map((ledger): Defaulter => {
      const studentInvoices = overdueInvoices.filter((inv) => inv.student_id === ledger.student_id);
      
      // Calculate max days overdue
      const daysOverdue = studentInvoices.reduce((max, inv) => {
        if (!inv.due_date) return max;
        const days = differenceInDays(today, new Date(inv.due_date));
        return Math.max(max, days);
      }, 0);

      // Priority scoring algorithm
      // Factors: amount overdue, days overdue, number of overdue invoices
      let priorityScore = 0;
      
      // Amount factor (up to 40 points)
      if (ledger.overdue_amount >= 100000) priorityScore += 40;
      else if (ledger.overdue_amount >= 50000) priorityScore += 30;
      else if (ledger.overdue_amount >= 20000) priorityScore += 20;
      else if (ledger.overdue_amount >= 10000) priorityScore += 10;
      else priorityScore += 5;

      // Days overdue factor (up to 40 points)
      if (daysOverdue >= 90) priorityScore += 40;
      else if (daysOverdue >= 60) priorityScore += 30;
      else if (daysOverdue >= 30) priorityScore += 20;
      else if (daysOverdue >= 14) priorityScore += 10;
      else priorityScore += 5;

      // Invoice count factor (up to 20 points)
      if (ledger.overdue_count >= 5) priorityScore += 20;
      else if (ledger.overdue_count >= 3) priorityScore += 15;
      else if (ledger.overdue_count >= 2) priorityScore += 10;
      else priorityScore += 5;

      // Determine priority level
      let priority: PriorityLevel;
      if (priorityScore >= 80) priority = "critical";
      else if (priorityScore >= 55) priority = "high";
      else if (priorityScore >= 35) priority = "medium";
      else priority = "low";

      const classSectionId = studentClassMap.get(ledger.student_id);
      const className = classSectionId ? classSectionMap.get(classSectionId) || null : null;

      return {
        student: ledger,
        overdueInvoices: studentInvoices,
        daysOverdue,
        priority,
        priorityScore,
        className,
      };
    });
  }, [ledgers, overdueInvoices, enrollments, classSections]);

  // Filter and sort defaulters
  const filteredDefaulters = useMemo(() => {
    let filtered = defaulters.filter((d) => {
      const matchesSearch =
        searchQuery === "" ||
        `${d.student.first_name} ${d.student.last_name || ""}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.student.student_code || "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPriority = priorityFilter === "all" || d.priority === priorityFilter;

      return matchesSearch && matchesPriority;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "priority":
          return b.priorityScore - a.priorityScore;
        case "amount":
          return b.student.overdue_amount - a.student.overdue_amount;
        case "days":
          return b.daysOverdue - a.daysOverdue;
        case "name":
          return `${a.student.first_name} ${a.student.last_name || ""}`.localeCompare(
            `${b.student.first_name} ${b.student.last_name || ""}`
          );
        default:
          return b.priorityScore - a.priorityScore;
      }
    });

    return filtered;
  }, [defaulters, searchQuery, priorityFilter, sortBy]);

  // Summary statistics
  const stats = useMemo(() => {
    const critical = defaulters.filter((d) => d.priority === "critical").length;
    const high = defaulters.filter((d) => d.priority === "high").length;
    const medium = defaulters.filter((d) => d.priority === "medium").length;
    const low = defaulters.filter((d) => d.priority === "low").length;
    const totalOverdue = defaulters.reduce((sum, d) => sum + d.student.overdue_amount, 0);
    const avgDaysOverdue = defaulters.length > 0
      ? Math.round(defaulters.reduce((sum, d) => sum + d.daysOverdue, 0) / defaulters.length)
      : 0;

    return { critical, high, medium, low, totalOverdue, avgDaysOverdue, total: defaulters.length };
  }, [defaulters]);

  // Chart data
  const priorityChartData = [
    { name: "Critical", value: stats.critical, color: PRIORITY_COLORS.critical },
    { name: "High", value: stats.high, color: PRIORITY_COLORS.high },
    { name: "Medium", value: stats.medium, color: PRIORITY_COLORS.medium },
    { name: "Low", value: stats.low, color: PRIORITY_COLORS.low },
  ].filter((d) => d.value > 0);

  const amountByPriorityData = [
    {
      priority: "Critical",
      amount: defaulters.filter((d) => d.priority === "critical").reduce((s, d) => s + d.student.overdue_amount, 0),
    },
    {
      priority: "High",
      amount: defaulters.filter((d) => d.priority === "high").reduce((s, d) => s + d.student.overdue_amount, 0),
    },
    {
      priority: "Medium",
      amount: defaulters.filter((d) => d.priority === "medium").reduce((s, d) => s + d.student.overdue_amount, 0),
    },
    {
      priority: "Low",
      amount: defaulters.filter((d) => d.priority === "low").reduce((s, d) => s + d.student.overdue_amount, 0),
    },
  ];

  const getPriorityBadge = (priority: PriorityLevel) => {
    const variants: Record<PriorityLevel, { className: string; icon: React.ReactNode }> = {
      critical: {
        className: "bg-destructive/10 text-destructive border-destructive/20",
        icon: <Ban className="mr-1 h-3 w-3" />,
      },
      high: {
        className: "bg-warning/10 text-warning border-warning/20",
        icon: <AlertTriangle className="mr-1 h-3 w-3" />,
      },
      medium: {
        className: "bg-chart-3/10 text-chart-3 border-chart-3/20",
        icon: <Clock className="mr-1 h-3 w-3" />,
      },
      low: {
        className: "bg-chart-4/10 text-chart-4 border-chart-4/20",
        icon: <AlertCircle className="mr-1 h-3 w-3" />,
      },
    };

    const v = variants[priority];
    return (
      <Badge className={v.className}>
        {v.icon}
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    );
  };

  const exportToCSV = () => {
    const headers = ["Student Name", "Student Code", "Class", "Overdue Amount", "Days Overdue", "Invoices Overdue", "Priority", "Priority Score"];
    const rows = filteredDefaulters.map((d) => [
      `${d.student.first_name} ${d.student.last_name || ""}`,
      d.student.student_code || "",
      d.className || "",
      d.student.overdue_amount.toString(),
      d.daysOverdue.toString(),
      d.student.overdue_count.toString(),
      d.priority,
      d.priorityScore.toString(),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fee-defaulters-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported successfully");
  };

  if (ledgersLoading) {
    return <p className="text-sm text-muted-foreground">Loading defaulters report...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="shadow-elevated border-destructive/30"
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Defaulters</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="rounded-full bg-destructive/10 p-3">
                <Users className="h-5 w-5 text-destructive" />
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
                <p className="text-sm text-muted-foreground">Total Overdue</p>
                <p className="text-2xl font-bold text-destructive">
                  PKR {stats.totalOverdue.toLocaleString()}
                </p>
              </div>
              <div className="rounded-full bg-destructive/10 p-3">
                <DollarSign className="h-5 w-5 text-destructive" />
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
                <p className="text-sm text-muted-foreground">Critical Priority</p>
                <p className="text-2xl font-bold text-destructive">{stats.critical}</p>
              </div>
              <div className="rounded-full bg-destructive/10 p-3">
                <Ban className="h-5 w-5 text-destructive" />
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
                <p className="text-sm text-muted-foreground">High Priority</p>
                <p className="text-2xl font-bold text-warning">{stats.high}</p>
              </div>
              <div className="rounded-full bg-warning/10 p-3">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="shadow-elevated"
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Days Overdue</p>
                <p className="text-2xl font-bold">{stats.avgDaysOverdue}</p>
              </div>
              <div className="rounded-full bg-muted p-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </MotionCard>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="text-lg">Priority Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {priorityChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-4">
              {priorityChartData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="text-lg">Overdue Amount by Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={amountByPriorityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="priority" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number) => [`PKR ${value.toLocaleString()}`, "Amount"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="amount" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card className="shadow-elevated">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by student name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Priority Score</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                  <SelectItem value="days">Days Overdue</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Defaulters List */}
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Collection Priority List ({filteredDefaulters.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {filteredDefaulters.map((defaulter, index) => (
                <Collapsible
                  key={defaulter.student.student_id}
                  open={expandedStudent === defaulter.student.student_id}
                  onOpenChange={(open) =>
                    setExpandedStudent(open ? defaulter.student.student_id : null)
                  }
                >
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="rounded-lg border bg-card"
                  >
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive font-bold">
                            {index + 1}
                          </div>
                          <div className="text-left">
                            <p className="font-medium">
                              {defaulter.student.first_name} {defaulter.student.last_name || ""}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {defaulter.student.student_code && (
                                <span>{defaulter.student.student_code}</span>
                              )}
                              {defaulter.className && (
                                <>
                                  <span>•</span>
                                  <span>{defaulter.className}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="font-semibold text-destructive">
                              PKR {defaulter.student.overdue_amount.toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {defaulter.daysOverdue} days overdue
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {getPriorityBadge(defaulter.priority)}
                            <div className="text-xs text-muted-foreground">
                              Score: {defaulter.priorityScore}
                            </div>
                          </div>
                          {expandedStudent === defaulter.student.student_id ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Separator />
                      <div className="p-4 space-y-4 bg-muted/30">
                        <div className="grid gap-4 md:grid-cols-3">
                          <div>
                            <p className="text-sm text-muted-foreground">Total Outstanding</p>
                            <p className="font-semibold">
                              PKR {defaulter.student.outstanding_balance.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Overdue Invoices</p>
                            <p className="font-semibold">{defaulter.student.overdue_count}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Collection Rate</p>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={
                                  (defaulter.student.total_paid /
                                    Math.max(defaulter.student.total_invoiced, 1)) *
                                  100
                                }
                                className="h-2 flex-1"
                              />
                              <span className="text-sm font-medium">
                                {(
                                  (defaulter.student.total_paid /
                                    Math.max(defaulter.student.total_invoiced, 1)) *
                                  100
                                ).toFixed(0)}
                                %
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Overdue Invoices */}
                        {defaulter.overdueInvoices.length > 0 && (
                          <div>
                            <p className="text-sm font-medium mb-2">Overdue Invoices</p>
                            <div className="rounded-lg border bg-background">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Invoice #</TableHead>
                                    <TableHead>Issue Date</TableHead>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="text-right">Days Overdue</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {defaulter.overdueInvoices.map((inv) => (
                                    <TableRow key={inv.id}>
                                      <TableCell className="font-medium">{inv.invoice_no}</TableCell>
                                      <TableCell>
                                        {format(new Date(inv.issue_date), "MMM d, yyyy")}
                                      </TableCell>
                                      <TableCell>
                                        {inv.due_date
                                          ? format(new Date(inv.due_date), "MMM d, yyyy")
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        PKR {inv.total.toLocaleString()}
                                      </TableCell>
                                      <TableCell className="text-right text-destructive">
                                        {inv.due_date
                                          ? differenceInDays(new Date(), new Date(inv.due_date))
                                          : "—"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </motion.div>
                </Collapsible>
              ))}

              {filteredDefaulters.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-lg font-medium">No defaulters found</p>
                  <p className="text-sm">All students are up to date with their payments!</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
