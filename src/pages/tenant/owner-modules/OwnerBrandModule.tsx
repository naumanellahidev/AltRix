import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MessageSquare, ThumbsUp, TrendingUp, Download, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCampus } from "@/hooks/useActiveCampus";
import { exportToCSV } from "@/lib/csv";
import { toast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

interface Props {
  schoolId: string | null;
}

export function OwnerBrandModule({ schoolId }: Props) {
  const activeCampusId = useActiveCampus(schoolId);

  const { data, isLoading } = useQuery({
    queryKey: ["owner_brand", schoolId, activeCampusId],
    queryFn: async () => {
      if (!schoolId) return null;
      const since90 = subDays(new Date(), 90).toISOString();

      const repQ = supabase
        .from("ai_school_reputation")
        .select("*")
        .eq("school_id", schoolId)
        .maybeSingle();

      let cQ = supabase
        .from("complaints")
        .select("id,status,category,resolved_at,created_at,campus_id")
        .eq("school_id", schoolId)
        .gte("created_at", since90);
      if (activeCampusId) cQ = cQ.eq("campus_id", activeCampusId);

      const [{ data: rep }, { data: complaints }] = await Promise.all([repQ, cQ]);
      return { rep, complaints: complaints ?? [] };
    },
    enabled: !!schoolId,
  });

  const stats = useMemo(() => {
    const c = data?.complaints ?? [];
    const total = c.length;
    const resolved = c.filter((x) => x.status === "resolved").length;
    const open = c.filter((x) => x.status === "open" || x.status === "in_review").length;
    const resolutionRate = total ? Math.round((resolved / total) * 100) : 0;

    // resolution time
    const resolvedTimes = c
      .filter((x) => x.resolved_at && x.created_at)
      .map(
        (x) =>
          (new Date(x.resolved_at!).getTime() - new Date(x.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
      );
    const avgResolutionDays = resolvedTimes.length
      ? +(resolvedTimes.reduce((s, v) => s + v, 0) / resolvedTimes.length).toFixed(1)
      : 0;

    // categories
    const catMap: Record<string, number> = {};
    c.forEach((x) => {
      const k = (x.category || "Uncategorized").toString();
      catMap[k] = (catMap[k] ?? 0) + 1;
    });
    const categories = Object.entries(catMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // 12-week trend
    const weeks: { label: string; complaints: number; resolved: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = subDays(new Date(), (i + 1) * 7);
      const end = subDays(new Date(), i * 7);
      const slice = c.filter((x) => {
        const t = new Date(x.created_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      });
      weeks.push({
        label: format(end, "MMM d"),
        complaints: slice.length,
        resolved: slice.filter((s) => s.status === "resolved").length,
      });
    }

    return { total, resolved, open, resolutionRate, avgResolutionDays, categories, weeks };
  }, [data]);

  const rep = data?.rep;
  const overallScore = rep?.overall_score ?? rep?.reputation_score ?? null;
  const parentSat = rep?.parent_satisfaction ?? rep?.parent_satisfaction_index ?? null;
  const nps = rep?.nps_score ?? null;
  const community = rep?.community_score ?? null;

  const sentiment =
    overallScore == null
      ? "—"
      : overallScore >= 75
        ? "Positive"
        : overallScore >= 50
          ? "Neutral"
          : "Needs Attention";

  const handleExport = () => {
    const c = data?.complaints ?? [];
    if (!c.length) {
      toast({ title: "Nothing to export" });
      return;
    }
    exportToCSV(
      c.map((x) => ({
        id: x.id,
        status: x.status,
        category: x.category ?? "",
        created_at: x.created_at,
        resolved_at: x.resolved_at ?? "",
      })),
      `brand-complaints-${new Date().toISOString().slice(0, 10)}`
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Brand & Experience</h1>
          <p className="text-muted-foreground">Parent satisfaction, reputation, and complaint trends</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export complaints
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <Star className="h-5 w-5 text-amber-500" />
            <p className="mt-2 font-display text-2xl font-bold">
              {overallScore != null ? Number(overallScore).toFixed(1) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Reputation Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <ThumbsUp className="h-5 w-5 text-emerald-600" />
            <p className="mt-2 font-display text-2xl font-bold">
              {nps != null ? Math.round(Number(nps)) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">NPS Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            <p className="mt-2 font-display text-2xl font-bold">{stats.open}</p>
            <p className="text-xs text-muted-foreground">Open Complaints</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <p className="mt-2 font-display text-2xl font-bold">{sentiment}</p>
            <p className="text-xs text-muted-foreground">Brand Sentiment</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Parent Satisfaction</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">
              {parentSat != null ? Number(parentSat).toFixed(1) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">out of 100</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Community Score</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">
              {community != null ? Number(community).toFixed(1) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">community engagement</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Complaint Resolution</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">{stats.resolutionRate}%</p>
            <p className="text-xs text-muted-foreground">
              Avg {stats.avgResolutionDays}d • {stats.resolved}/{stats.total} resolved
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Complaints Trend (12 weeks)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {stats.weeks.some((w) => w.complaints > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.weeks}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis className="text-xs" allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="complaints" stroke="hsl(var(--destructive))" strokeWidth={2} />
                  <Line type="monotone" dataKey="resolved" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No complaints in last 90 days.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Complaint Categories</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {stats.categories.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.categories} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" className="text-xs" width={110} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No categorised complaints yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {(rep?.strengths?.length || rep?.improvements?.length) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {!!rep?.strengths?.length && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-emerald-600">Strengths</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {rep.strengths.map((s: string, i: number) => (
                  <Badge key={i} variant="secondary">{s}</Badge>
                ))}
              </CardContent>
            </Card>
          )}
          {!!rep?.improvements?.length && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-amber-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> Areas to Improve
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {rep.improvements.map((s: string, i: number) => (
                  <Badge key={i} variant="outline">{s}</Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {!rep && !isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Run the AI Reputation Analyzer in the AI Command Center to populate reputation scores and insights.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
