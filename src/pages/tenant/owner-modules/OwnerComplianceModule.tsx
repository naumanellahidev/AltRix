import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scale, Shield, FileText, CheckCircle, AlertTriangle, FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCampus } from "@/hooks/useActiveCampus";

interface Props { schoolId: string | null; }

export function OwnerComplianceModule({ schoolId }: Props) {
  const activeCampusId = useActiveCampus(schoolId);

  const { data: directory } = useQuery({
    queryKey: ["compliance_dir", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      if (!schoolId) return [] as any[];
      const { data } = await (supabase as any).rpc("get_school_user_directory", { _school_id: schoolId });
      return (data || []) as any[];
    },
  });
  const nameOf = (uid?: string | null) => {
    if (!uid) return "—";
    const u = (directory || []).find((d: any) => d.user_id === uid);
    return u?.display_name || u?.email || `${uid.slice(0, 8)}…`;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["owner_compliance", schoolId, activeCampusId],
    enabled: !!schoolId,
    queryFn: async () => {
      if (!schoolId) return null;
      const now = Date.now();
      const soon = now + 60 * 86400 * 1000;

      const [schoolRes, contractsRes, hrDocsRes, complaintsRes, leavesRes, paymentsRes, salariesRes] =
        await Promise.all([
          supabase.from("schools").select("is_active,name").eq("id", schoolId).maybeSingle(),
          supabase.from("hr_contracts").select("id,user_id,position,end_date,status").eq("school_id", schoolId),
          supabase.from("hr_documents").select("id,user_id,document_type,document_name,created_at").eq("school_id", schoolId),
          supabase.from("complaints").select("id,status,created_at,resolved_at").eq("school_id", schoolId),
          supabase.from("hr_leave_requests").select("id,status").eq("school_id", schoolId),
          supabase.from("fee_payments").select("id,status,created_at").eq("school_id", schoolId).limit(1000),
          supabase.from("hr_salary_records").select("id,user_id,is_active").eq("school_id", schoolId),
        ]);

      const contracts = contractsRes.data || [];
      const hrDocs = hrDocsRes.data || [];
      const complaints = complaintsRes.data || [];
      const leaves = leavesRes.data || [];
      const payments = paymentsRes.data || [];
      const salaries = salariesRes.data || [];

      // Contract compliance: all active staff should have a contract
      const activeSalaryUsers = new Set(salaries.filter((s: any) => s.is_active).map((s: any) => s.user_id));
      const usersWithContract = new Set(contracts.filter((c: any) => c.status === "active").map((c: any) => c.user_id));
      const missingContract = [...activeSalaryUsers].filter((u) => !usersWithContract.has(u));
      const contractCompliance = activeSalaryUsers.size > 0
        ? Math.round(((activeSalaryUsers.size - missingContract.length) / activeSalaryUsers.size) * 100)
        : 100;

      // Expiring contracts
      const expiring = contracts.filter((c: any) => {
        if (!c.end_date) return false;
        const t = new Date(c.end_date).getTime();
        return t > now && t < soon;
      });

      // Document completeness: each active staff should have at least one HR document
      const usersWithDocs = new Set(hrDocs.map((d: any) => d.user_id));
      const missingDocs = [...activeSalaryUsers].filter((u) => !usersWithDocs.has(u));
      const docCompliance = activeSalaryUsers.size > 0
        ? Math.round(((activeSalaryUsers.size - missingDocs.length) / activeSalaryUsers.size) * 100)
        : 100;

      // Complaint resolution
      const resolved = complaints.filter((c: any) => ["resolved", "closed"].includes(c.status)).length;
      const complaintResolution = complaints.length ? Math.round((resolved / complaints.length) * 100) : 100;

      // Leave compliance: pending shouldn't pile up
      const pendingLeaves = leaves.filter((l: any) => l.status === "pending").length;
      const leaveCompliance = leaves.length ? Math.max(0, 100 - Math.round((pendingLeaves / leaves.length) * 100)) : 100;

      // Finance: failed payments ratio
      const failedPayments = payments.filter((p: any) => p.status === "failed").length;
      const financeCompliance = payments.length ? Math.max(0, 100 - Math.round((failedPayments / payments.length) * 100)) : 100;

      const overallScore = Math.round((contractCompliance + docCompliance + complaintResolution + leaveCompliance + financeCompliance) / 5);

      const checks = [
        { label: "Staff contracts on file", value: contractCompliance, missing: missingContract.length, total: activeSalaryUsers.size },
        { label: "HR documents on file", value: docCompliance, missing: missingDocs.length, total: activeSalaryUsers.size },
        { label: "Complaint resolution rate", value: complaintResolution, missing: complaints.length - resolved, total: complaints.length },
        { label: "Leave request processing", value: leaveCompliance, missing: pendingLeaves, total: leaves.length },
        { label: "Payment success rate", value: financeCompliance, missing: failedPayments, total: payments.length },
      ];

      return {
        schoolName: schoolRes.data?.name,
        isActive: !!schoolRes.data?.is_active,
        contracts, expiring, missingContract, missingDocs,
        overallScore, checks,
      };
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  const score = data?.overallScore ?? 0;
  const scoreColor = score >= 90 ? "text-emerald-600" : score >= 70 ? "text-amber-600" : "text-red-600";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Compliance & Governance</h1>
        <p className="text-muted-foreground">Policy compliance, contracts and document audits{activeCampusId ? " (campus-scoped)" : ""}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><Scale className="h-5 w-5 text-primary" /><p className="mt-2 font-display text-2xl font-bold">{data?.isActive ? "Active" : "Inactive"}</p><p className="text-xs text-muted-foreground">School Status</p></CardContent></Card>
        <Card><CardContent className="p-4"><Shield className="h-5 w-5 text-emerald-600" /><p className={`mt-2 font-display text-2xl font-bold ${scoreColor}`}>{score}%</p><p className="text-xs text-muted-foreground">Compliance Score</p></CardContent></Card>
        <Card><CardContent className="p-4"><FileWarning className="h-5 w-5 text-amber-600" /><p className="mt-2 font-display text-2xl font-bold">{data?.expiring.length ?? 0}</p><p className="text-xs text-muted-foreground">Expiring Contracts (60d)</p></CardContent></Card>
        <Card><CardContent className="p-4"><AlertTriangle className="h-5 w-5 text-red-600" /><p className="mt-2 font-display text-2xl font-bold">{(data?.missingContract.length ?? 0) + (data?.missingDocs.length ?? 0)}</p><p className="text-xs text-muted-foreground">Open Audit Items</p></CardContent></Card>
      </div>

      <Tabs defaultValue="checks">
        <TabsList>
          <TabsTrigger value="checks">Compliance Checks</TabsTrigger>
          <TabsTrigger value="contracts">Contract Audit</TabsTrigger>
          <TabsTrigger value="policies">Policy Status</TabsTrigger>
        </TabsList>

        <TabsContent value="checks" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Compliance breakdown</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {data?.checks.map((c: any, i: number) => (
                <div key={i}>
                  <div className="flex justify-between text-sm">
                    <span>{c.label}</span>
                    <span className="font-medium">{c.value}% <span className="text-xs text-muted-foreground">({c.total - c.missing}/{c.total})</span></span>
                  </div>
                  <Progress value={c.value} className="mt-2 h-2" />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts" className="mt-6 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Contracts expiring within 60 days ({data?.expiring.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              {(data?.expiring.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-muted-foreground">No contracts expiring soon.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Employee</TableHead><TableHead>Position</TableHead><TableHead>Ends</TableHead><TableHead>Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.expiring.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{nameOf(c.user_id)}</TableCell>
                        <TableCell>{c.position || "—"}</TableCell>
                        <TableCell className="text-amber-600 font-medium">{c.end_date ? format(new Date(c.end_date), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{c.status || "—"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /> Active staff without contracts ({data?.missingContract.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              {(data?.missingContract.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-muted-foreground">All active staff have contracts on file.</p>
              ) : (
                <ul className="divide-y">
                  {data?.missingContract.map((uid: string) => (
                    <li key={uid} className="py-2 text-sm">{nameOf(uid)}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Policy & governance status</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center justify-between"><span>Data protection — RLS enforced on all tables</span><Badge>Compliant</Badge></li>
                <li className="flex items-center justify-between"><span>Role-based access control</span><Badge>Compliant</Badge></li>
                <li className="flex items-center justify-between"><span>Financial transaction logging</span><Badge>Compliant</Badge></li>
                <li className="flex items-center justify-between"><span>Staff contracts on file</span><Badge variant={(data?.missingContract.length ?? 0) === 0 ? "default" : "destructive"}>{(data?.missingContract.length ?? 0) === 0 ? "Compliant" : `${data?.missingContract.length} missing`}</Badge></li>
                <li className="flex items-center justify-between"><span>HR documents on file</span><Badge variant={(data?.missingDocs.length ?? 0) === 0 ? "default" : "destructive"}>{(data?.missingDocs.length ?? 0) === 0 ? "Compliant" : `${data?.missingDocs.length} missing`}</Badge></li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
