import { useCallback, useEffect, useState } from "react";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Activity, Database, CheckCircle, Clock, ServerCrash, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";

/**
 * The platform's health, as the server reports it.
 *
 * Every figure on this page used to be typed into it — CPU "4.8%", "12 active
 * connections", 1,420 students, a "94.2%" cache hit rate — and the diagnostic
 * probe drew a random latency after a pause. It now shows what
 * /api/platform/health-metrics measures, and times real requests for latency.
 */

type TableStat = {
  table: string;
  rows: number;
  rows_exact: boolean;
  size_bytes: number;
  indexes: number;
  seq_scan: number;
  idx_scan: number;
  last_analyzed: string | null;
};

type HealthMetrics = {
  status: string;
  version: string;
  commit: string;
  uptime_seconds: number;
  dependencies?: Record<string, { status?: string; latency_ms?: number; error?: string } | string>;
  server: {
    cpu_count: number | null;
    load_average: number[] | null;
    memory_total_bytes: number | null;
    memory_available_bytes: number | null;
    api_process_rss_bytes: number | null;
    disk_total_bytes: number;
    disk_free_bytes: number;
  };
  database: {
    size_bytes: number;
    connections: number;
    active: number;
    max_connections: number;
    cache_hit_pct: number | null;
    tables: number;
  } | null;
  tables: TableStat[];
  task_queue_length: number | null;
};

function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function duration(seconds: number | undefined): string {
  if (!seconds && seconds !== 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

function depStatus(dep: unknown): string {
  if (!dep) return "unknown";
  if (typeof dep === "string") return dep;
  return (dep as { status?: string }).status ?? "unknown";
}

/** Five timed requests to /api/health: the median and the slowest. */
async function measureLatency(): Promise<{ median: number; max: number } | null> {
  const samples: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const t0 = performance.now();
    try {
      await apiClient.get("/health", { params: { _: Date.now() } });
      samples.push(performance.now() - t0);
    } catch {
      /* a failed ping is left out; all five failing is reported */
    }
  }
  if (!samples.length) return null;
  samples.sort((a, b) => a - b);
  return { median: Math.round(samples[Math.floor(samples.length / 2)]), max: Math.round(samples[samples.length - 1]) };
}

export default function PlatformHealthPage() {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [latency, setLatency] = useState<{ median: number; max: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const runDiagnostics = useCallback(async (announce = false) => {
    setLoading(true);
    setError(null);
    try {
      const [res, lat] = await Promise.all([apiClient.get<HealthMetrics>("/platform/health-metrics"), measureLatency()]);
      setMetrics(res.data);
      setLatency(lat);
      setCheckedAt(new Date());
      if (announce) {
        toast.success("Health check completed", {
          description: lat ? `API answered in ${lat.median} ms (slowest ${lat.max} ms).` : "The API did not answer the latency pings.",
        });
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : err?.message ?? "The health metrics could not be read.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runDiagnostics();
  }, [runDiagnostics]);

  const server = metrics?.server;
  const db = metrics?.database;
  const memUsed =
    server?.memory_total_bytes && server?.memory_available_bytes !== null && server?.memory_available_bytes !== undefined
      ? server.memory_total_bytes - server.memory_available_bytes
      : null;
  const load1 = server?.load_average?.[0];
  const loadPct = load1 !== undefined && server?.cpu_count ? Math.round((load1 / server.cpu_count) * 100) : null;
  const dbState = depStatus(metrics?.dependencies?.database);
  const redisState = depStatus(metrics?.dependencies?.redis);
  const healthy = metrics?.status === "healthy";

  return (
    <SuperAdminShell title="10. System Health & Telemetry Desk" subtitle="Measured on the server at the moment you open or refresh this page">
      <div className="space-y-6">
        {error ? (
          <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {error}
          </Card>
        ) : null}

        {/* KPI Panel */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">Database</CardTitle>
              <Database className="h-4 w-4 text-blue-700" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900 capitalize">{metrics ? dbState : "—"}</div>
              <div className="text-xs text-blue-700/80 mt-1 flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                {db ? `${db.connections} connections (${db.active} active) of ${db.max_connections} · ${bytes(db.size_bytes)}` : "—"}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">API Response Latency</CardTitle>
              <Clock className="h-4 w-4 text-blue-700" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{latency ? `${latency.median} ms` : "—"}</div>
              <div className="text-xs text-slate-500 mt-1">
                {latency ? `Median of 5 requests from this browser · slowest ${latency.max} ms` : "Not measured yet"}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">Server Resources</CardTitle>
              <Activity className="h-4 w-4 text-blue-700" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{loadPct !== null ? `${loadPct}% load` : "—"}</div>
              <div className="text-xs text-slate-500 mt-1">
                {server
                  ? `${server.cpu_count ?? "?"} cores · memory ${bytes(memUsed)} of ${bytes(server.memory_total_bytes)} · disk free ${bytes(server.disk_free_bytes)}`
                  : "—"}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">Platform status</CardTitle>
              <ServerCrash className={`h-4 w-4 ${healthy ? "text-emerald-500" : "text-amber-500"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold capitalize ${healthy ? "text-emerald-500" : "text-amber-600"}`}>
                {metrics?.status ?? "—"}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {metrics ? `Up ${duration(metrics.uptime_seconds)} · v${metrics.version} · ${String(metrics.commit ?? "").slice(0, 8)}` : "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Diagnostic Actions */}
        <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">Platform Diagnostic Checks</CardTitle>
              <p className="text-xs text-slate-500">
                {checkedAt ? `Last checked ${checkedAt.toLocaleTimeString()}` : "Checking…"}
              </p>
            </div>
            <Button
              onClick={() => void runDiagnostics(true)}
              disabled={loading}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-zinc-950 font-bold border border-0"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Run Diagnostic Probe
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Database / Redis</span>
                <span className="flex gap-2">
                  <Badge variant="outline" className="capitalize">{metrics ? `DB ${dbState}` : "—"}</Badge>
                  <Badge variant="outline" className="capitalize">{metrics ? `Redis ${redisState}` : "—"}</Badge>
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Database cache hit rate</span>
                <span className="text-slate-900 font-mono font-medium">
                  {db?.cache_hit_pct !== null && db?.cache_hit_pct !== undefined ? `${db.cache_hit_pct}%` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Background task queue</span>
                <span className="text-slate-900 font-mono font-medium">
                  {metrics?.task_queue_length === null || metrics?.task_queue_length === undefined
                    ? "Not readable"
                    : `${metrics.task_queue_length} waiting`}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Load average (1 / 5 / 15 min)</span>
                <span className="text-slate-900 font-mono font-medium">
                  {server?.load_average ? server.load_average.map((v) => v.toFixed(2)).join(" / ") : "—"}
                </span>
              </div>
            </div>

            {/* Database Table stats */}
            <div>
              <p className="text-sm font-semibold text-slate-900 mb-2">
                Largest tables{db ? ` (of ${db.tables})` : ""}
              </p>
              <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                <Table>
                  <TableHeader className="border-b border-zinc-850">
                    <TableRow className="hover:bg-transparent border-b border-slate-200">
                      <TableHead className="text-slate-500 font-medium">Table</TableHead>
                      <TableHead className="text-slate-500 font-medium">Rows</TableHead>
                      <TableHead className="text-slate-500 font-medium">Size on disk</TableHead>
                      <TableHead className="text-slate-500 font-medium">Indexes</TableHead>
                      <TableHead className="text-slate-500 font-medium">Reads by index</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(metrics?.tables ?? []).map((t) => {
                      const reads = t.seq_scan + t.idx_scan;
                      const byIndex = reads ? Math.round((t.idx_scan / reads) * 100) : null;
                      return (
                        <TableRow key={t.table} className="hover:bg-slate-50/20 border-b border-slate-200">
                          <TableCell className="font-mono text-xs text-slate-900">{t.table}</TableCell>
                          <TableCell className="text-slate-700 font-mono">
                            {t.rows.toLocaleString()}
                            {t.rows_exact ? "" : " (estimate)"}
                          </TableCell>
                          <TableCell className="text-slate-500 font-mono text-xs">{bytes(t.size_bytes)}</TableCell>
                          <TableCell className="text-slate-700 font-mono text-xs">{t.indexes}</TableCell>
                          <TableCell className="text-slate-700 font-mono text-xs">
                            {byIndex === null ? "No reads yet" : `${byIndex}%`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {metrics && !metrics.tables.length ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-slate-500">No tables reported.</TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SuperAdminShell>
  );
}
