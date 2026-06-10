import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, PieChart, Pie } from "recharts";
import { Users, TrendingUp, TrendingDown, DollarSign, Award } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ROLE_COLORS: Record<string, string> = {
  teacher: "hsl(var(--primary))",
  admin: "hsl(var(--chart-2))",
  accountant: "hsl(var(--chart-3))",
  principal: "hsl(var(--chart-4))",
  staff: "hsl(var(--chart-5))",
  default: "hsl(var(--muted-foreground))",
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
  full_name: string;
  role: string;
};

export function SalaryComparisonChart() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  // Fetch active salary records
  const { data: salaryRecords = [] } = useQuery({
    queryKey: ["hr_salary_records_active", schoolId],
    queryFn: async () => {
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
        is_active: r.is_active ?? true,
      })) as SalaryRecord[];
    },
    enabled: !!schoolId,
  });

  // Fetch staff with their roles
  const { data: staffWithRoles = [] } = useQuery({
    queryKey: ["staff_with_roles", schoolId],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("school_id", schoolId!);
      if (rolesError) throw rolesError;

      const userIds = [...new Set((roles || []).map((r) => r.user_id))];
      if (userIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await (supabase as any)
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.display_name || "Unknown"]));

      return (roles || []).map((r) => ({
        user_id: r.user_id,
        full_name: profileMap.get(r.user_id) || "Unknown",
        role: r.role,
      })) as StaffWithRole[];
    },
    enabled: !!schoolId,
  });

  // Role lookup for each user
  const roleMap = useMemo(() => {
    const map = new Map<string, string>();
    staffWithRoles.forEach((s) => {
      if (!map.has(s.user_id)) {
        map.set(s.user_id, s.role);
      }
    });
    return map;
  }, [staffWithRoles]);

  const nameMap = useMemo(() => {
    const map = new Map<string, string>();
    staffWithRoles.forEach((s) => {
      if (!map.has(s.user_id)) {
        map.set(s.user_id, s.full_name);
      }
    });
    return map;
  }, [staffWithRoles]);

  // Salary distribution by role
  const salaryByRole = useMemo(() => {
    const roleData = new Map<string, { total: number; count: number; min: number; max: number }>();

    salaryRecords.forEach((s) => {
      const role = roleMap.get(s.user_id) || "other";
      const netSalary = s.base_salary + s.allowances - s.deductions;
      const existing = roleData.get(role) || { total: 0, count: 0, min: Infinity, max: -Infinity };
      existing.total += netSalary;
      existing.count += 1;
      existing.min = Math.min(existing.min, netSalary);
      existing.max = Math.max(existing.max, netSalary);
      roleData.set(role, existing);
    });

    return Array.from(roleData.entries())
      .map(([role, data]) => ({
        role: role.charAt(0).toUpperCase() + role.slice(1),
        avgSalary: Math.round(data.total / data.count),
        totalPayroll: data.total,
        employees: data.count,
        minSalary: data.min === Infinity ? 0 : data.min,
        maxSalary: data.max === -Infinity ? 0 : data.max,
        color: ROLE_COLORS[role] || ROLE_COLORS.default,
      }))
      .sort((a, b) => b.avgSalary - a.avgSalary);
  }, [salaryRecords, roleMap]);

  // Individual salary comparison (top earners)
  const topEarners = useMemo(() => {
    return salaryRecords
      .map((s) => ({
        name: nameMap.get(s.user_id) || "Unknown",
        role: roleMap.get(s.user_id) || "other",
        netSalary: s.base_salary + s.allowances - s.deductions,
        baseSalary: s.base_salary,
        allowances: s.allowances,
        deductions: s.deductions,
      }))
      .sort((a, b) => b.netSalary - a.netSalary)
      .slice(0, 10);
  }, [salaryRecords, nameMap, roleMap]);

  // Salary range distribution
  const salaryRanges = useMemo(() => {
    const ranges = [
      { name: "< 25K", min: 0, max: 25000, count: 0, total: 0 },
      { name: "25K-50K", min: 25000, max: 50000, count: 0, total: 0 },
      { name: "50K-75K", min: 50000, max: 75000, count: 0, total: 0 },
      { name: "75K-100K", min: 75000, max: 100000, count: 0, total: 0 },
      { name: "100K-150K", min: 100000, max: 150000, count: 0, total: 0 },
      { name: "> 150K", min: 150000, max: Infinity, count: 0, total: 0 },
    ];

    salaryRecords.forEach((s) => {
      const net = s.base_salary + s.allowances - s.deductions;
      const range = ranges.find((r) => net >= r.min && net < r.max);
      if (range) {
        range.count += 1;
        range.total += net;
      }
    });

    return ranges.filter((r) => r.count > 0);
  }, [salaryRecords]);

  // Stats
  const stats = useMemo(() => {
    if (salaryRecords.length === 0) {
      return { totalPayroll: 0, avgSalary: 0, highestSalary: 0, lowestSalary: 0, employees: 0 };
    }

    const salaries = salaryRecords.map((s) => s.base_salary + s.allowances - s.deductions);
    return {
      totalPayroll: salaries.reduce((a, b) => a + b, 0),
      avgSalary: Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length),
      highestSalary: Math.max(...salaries),
      lowestSalary: Math.min(...salaries),
      employees: salaryRecords.length,
    };
  }, [salaryRecords]);

  if (salaryRecords.length === 0) {
    return (
      <Card className="shadow-elevated">
        <CardContent className="py-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">No salary data available</p>
          <p className="text-sm text-muted-foreground/70">Add salary records in Payroll to see distribution</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <p className="text-sm text-muted-foreground">Employees</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{stats.employees}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <p className="text-sm text-muted-foreground">Total Payroll</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{stats.totalPayroll.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Average</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{stats.avgSalary.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              <p className="text-sm text-muted-foreground">Highest</p>
            </div>
            <p className="mt-2 text-2xl font-semibold text-primary">{stats.highestSalary.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Lowest</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{stats.lowestSalary.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="byRole" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="byRole">By Role</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="topEarners">Top Earners</TabsTrigger>
        </TabsList>

        <TabsContent value="byRole">
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="text-lg">Average Salary by Role</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={salaryByRole} 
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
                      width={80}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [value.toLocaleString(), name === "avgSalary" ? "Avg Salary" : name]}
                      labelFormatter={(label) => `Role: ${label}`}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px"
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                    <Bar dataKey="avgSalary" name="Average Salary" radius={[0, 4, 4, 0]}>
                      {salaryByRole.map((entry, index) => (
                        <Cell key={entry.role} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Role Details Table */}
              <div className="mt-6 rounded-xl border bg-surface overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Role</th>
                      <th className="px-4 py-3 text-right font-medium">Employees</th>
                      <th className="px-4 py-3 text-right font-medium">Avg Salary</th>
                      <th className="px-4 py-3 text-right font-medium">Min</th>
                      <th className="px-4 py-3 text-right font-medium">Max</th>
                      <th className="px-4 py-3 text-right font-medium">Total Payroll</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryByRole.map((role) => (
                      <tr key={role.role} className="border-t">
                        <td className="px-4 py-3 font-medium flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: role.color }} />
                          {role.role}
                        </td>
                        <td className="px-4 py-3 text-right">{role.employees}</td>
                        <td className="px-4 py-3 text-right">{role.avgSalary.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{role.minSalary.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{role.maxSalary.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-semibold">{role.totalPayroll.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution">
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="text-lg">Salary Range Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={salaryRanges}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="count"
                        nameKey="name"
                        labelLine={false}
                      >
                        {salaryRanges.map((entry, index) => (
                          <Cell key={entry.name} fill={`hsl(var(--chart-${(index % 5) + 1}))`} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => `${value} employees`}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px"
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3">
                  {salaryRanges.map((range, index) => (
                    <div key={range.name} className="flex items-center justify-between rounded-xl border p-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: `hsl(var(--chart-${(index % 5) + 1}))` }}
                        />
                        <span className="font-medium">{range.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{range.count} employees</p>
                        <p className="text-sm text-muted-foreground">{range.total.toLocaleString()} total</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="topEarners">
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="text-lg">Top 10 Earners</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={topEarners} 
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
                      dataKey="name" 
                      width={90} 
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        const labels: Record<string, string> = {
                          baseSalary: "Base Salary",
                          allowances: "Allowances",
                          deductions: "Deductions",
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
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                    <Bar dataKey="baseSalary" name="Base Salary" stackId="salary" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="allowances" name="Allowances" stackId="salary" fill="hsl(var(--chart-2))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="deductions" name="Deductions" fill="hsl(var(--destructive) / 0.7)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
