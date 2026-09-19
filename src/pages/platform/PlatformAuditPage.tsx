import { useEffect, useState, useMemo } from "react";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollText, Search, RefreshCw, FileSpreadsheet, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { DataExportMenu } from "@/components/documents/DataExportMenu";

type AuditRow = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  school_id: string | null;
  actor_user_id: string | null;
};

type SchoolRow = {
  id: string;
  slug: string;
  name: string;
};

export default function PlatformAuditPage() {
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterSchool, setFilterSchool] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshLogs = async () => {
    setLoading(true);
    try {
      const { data: schoolsData } = await api
        .from("schools")
        .select("id,slug,name");
      setSchools((schoolsData ?? []) as SchoolRow[]);

      const { data: auditData, error } = await (api as any)
        .from("audit_logs")
        .select("id,created_at,action,entity_type,entity_id,school_id,actor_user_id")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setAuditLogs((auditData ?? []) as AuditRow[]);
      setLoadError(null);
    } catch (err: any) {
      // No stand-in records. This page used to show three invented entries —
      // an impersonation, a school creation — whenever the real log could not
      // be read, which is the one place a platform must never make things up.
      console.error("Error loading audit logs:", err);
      setAuditLogs([]);
      setLoadError(err?.message ?? "The audit log could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshLogs();
  }, []);

  const schoolsById = useMemo(() => new Map(schools.map(s => [s.id, s])), [schools]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (filterSchool !== "all" && log.school_id !== filterSchool) return false;
      if (filterAction !== "all" && log.action !== filterAction) return false;
      
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const actionMatch = log.action.toLowerCase().includes(query);
        const entityMatch = log.entity_id?.toLowerCase().includes(query) ?? false;
        const actorMatch = log.actor_user_id?.toLowerCase().includes(query) ?? false;
        return actionMatch || entityMatch || actorMatch;
      }
      return true;
    });
  }, [auditLogs, filterSchool, filterAction, searchQuery]);

  // The export used to show "exported successfully" and download nothing.
  const auditExportRows = () =>
    filteredLogs.map((log) => ({
      time: log.created_at,
      action: log.action,
      entity_type: log.entity_type,
      entity: log.entity_id ?? "",
      school: log.school_id ? schoolsById.get(log.school_id)?.name ?? log.school_id : "Platform",
      actor: log.actor_user_id ?? "",
    }));

  return (
    <SuperAdminShell title="Audit Log" subtitle="Monitor administrator activities, operations and impersonation actions">
      <div className="space-y-6">
        {/* KPI Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Audit Logs</CardTitle>
              <ScrollText className="h-4 w-4 text-blue-700" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{auditLogs.length} Records</div>
              <div className="text-xs text-slate-500 mt-1">Stored securely on the platform</div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">Security Events</CardTitle>
              <ShieldAlert className="h-4 w-4 text-blue-700" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {auditLogs.filter(l => l.action.includes("impersonate")).length} Impersonations
              </div>
              <div className="text-xs text-slate-500 mt-1">All secure logins are digitally logged</div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">Actor Context</CardTitle>
              <ScrollText className="h-4 w-4 text-blue-700" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">1 Active Admin</div>
              <div className="text-xs text-slate-500 mt-1">admin@altrixbynec.com</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Toolbar */}
        <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9 bg-slate-50 border-amber-500/15 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search logs by action, actor or entity ID..."
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={filterSchool} onValueChange={setFilterSchool}>
                  <SelectTrigger className="w-44 bg-slate-50 border-amber-500/15 text-slate-900">
                    <SelectValue placeholder="All Schools" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Schools</SelectItem>
                    {schools.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterAction} onValueChange={setFilterAction}>
                  <SelectTrigger className="w-44 bg-slate-50 border-amber-500/15 text-slate-900">
                    <SelectValue placeholder="All Actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    <SelectItem value="impersonate_user">Impersonation</SelectItem>
                    <SelectItem value="create_school">Create Institute</SelectItem>
                    <SelectItem value="update_school_settings">Update Settings</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="soft" size="icon" onClick={refreshLogs} disabled={loading} className="border border-slate-200 text-slate-500 hover:text-blue-700">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>

                <DataExportMenu
                  title="Platform Audit Log"
                  subtitle={`${filteredLogs.length} record${filteredLogs.length === 1 ? "" : "s"}`}
                  rows={auditExportRows()}
                  columns={[
                    { header: "Time", key: "time", type: "datetime" },
                    { header: "Action", key: "action" },
                    { header: "Entity Type", key: "entity_type" },
                    { header: "Entity", key: "entity" },
                    { header: "School", key: "school" },
                    { header: "Actor", key: "actor" },
                  ]}
                  filters={[
                    { label: "School", value: filterSchool === "all" ? null : schoolsById.get(filterSchool)?.name ?? filterSchool },
                    { label: "Action", value: filterAction === "all" ? null : filterAction },
                    { label: "Search", value: searchQuery.trim() || null },
                  ]}
                  orientation="landscape"
                  disabled={filteredLogs.length === 0}
                  variant="default"
                  size="default"
                />
              </div>
            </div>

            {/* Audit Log Table */}
            <div className="overflow-auto rounded-xl border border-slate-200 bg-white mt-4">
              <Table>
                <TableHeader className="border-b border-zinc-850">
                  <TableRow className="hover:bg-transparent border-b border-slate-200">
                    <TableHead className="text-slate-500 font-medium">Timestamp</TableHead>
                    <TableHead className="text-slate-500 font-medium">Action</TableHead>
                    <TableHead className="text-slate-500 font-medium">School context</TableHead>
                    <TableHead className="text-slate-500 font-medium">Target Entity</TableHead>
                    <TableHead className="text-slate-500 font-medium">Actor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const sch = log.school_id ? schoolsById.get(log.school_id) : null;
                    return (
                      <TableRow key={log.id} className="hover:bg-slate-50/20 border-b border-slate-200">
                        <TableCell className="text-slate-500 font-mono text-xs">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900">
                          <code className="bg-blue-600/10 text-blue-700 border border-slate-300 px-2 py-0.5 rounded text-[11px] font-mono">
                            {log.action}
                          </code>
                        </TableCell>
                        <TableCell className="text-slate-700">
                          {sch ? sch.name : "Platform Wide"}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs font-mono">
                          {log.entity_type ? `${log.entity_type}: ` : ""}
                          <span className="text-slate-700 font-medium">{log.entity_id || "—"}</span>
                        </TableCell>
                        <TableCell className="text-slate-700 text-xs font-mono">
                          {log.actor_user_id}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                        {loadError ? `The audit log could not be loaded: ${loadError}` : "No audit records found matching the criteria."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </SuperAdminShell>
  );
}
