import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Target, Compass, Award, Percent, Mail, Phone, ExternalLink, Calendar, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type LeadRow = {
  id: string;
  source: string | null;
  status: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  score: number;
  created_at: string;
};

export function MarketingSourcesModule() {
  const { schoolSlug } = useParams();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  const leadsForSelectedSource = useMemo(() => {
    if (!selectedSource) return [];
    return leads.filter((l) => {
      const key = (l.source ?? "unknown").trim() || "unknown";
      return key.toLowerCase() === selectedSource.toLowerCase();
    });
  }, [leads, selectedSource]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!schoolSlug) return;
      const { data: school } = await supabase.from("schools").select("id").eq("slug", schoolSlug).maybeSingle();
      if (cancelled) return;
      setSchoolId(school?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolSlug]);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("crm_leads").select("id,source,status,full_name,email,phone,score,created_at").eq("school_id", schoolId);
      if (cancelled) return;
      setLeads((data ?? []) as LeadRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  const rows = useMemo(() => {
    const map = new Map<string, { source: string; total: number; won: number; lost: number }>();
    for (const l of leads) {
      const key = (l.source ?? "unknown").trim() || "unknown";
      const cur = map.get(key) ?? { source: key, total: 0, won: 0, lost: 0 };
      cur.total += 1;
      if (l.status === "won") cur.won += 1;
      if (l.status === "lost") cur.lost += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [leads]);

  // Sources stats
  const stats = useMemo(() => {
    const totalSources = rows.length;
    const topSource = rows[0]?.source || "None";
    
    // Find source with highest conversion rate (minimum 2 leads to prevent 1/1 noise)
    const convertedRows = rows
      .map(r => ({
        ...r,
        rate: r.total > 0 ? Math.round((r.won / r.total) * 100) : 0
      }))
      .sort((a, b) => b.rate - a.rate);
      
    const highestConversion = convertedRows[0]?.source || "None";
    const highestRate = convertedRows[0]?.rate || 0;

    return {
      totalSources,
      topSource,
      highestConversion,
      highestRate
    };
  }, [rows]);

  // Calculate highest lead count for visual bar max width
  const maxLeads = useMemo(() => {
    return Math.max(1, ...rows.map(r => r.total));
  }, [rows]);

  return (
    <div className="space-y-6">
      
      {/* Sources Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Total Sources */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Total Active Channels</p>
              <p className="text-xl font-bold font-display">{stats.totalSources} Sources</p>
            </div>
          </CardContent>
        </Card>

        {/* Top Source Volume */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-500">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Top Source by Volume</p>
              <p className="text-xl font-bold font-display uppercase">{stats.topSource}</p>
            </div>
          </CardContent>
        </Card>

        {/* Best Performing (Highest conversion rate) */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Highest Conversion Rate</p>
              <p className="text-xl font-bold font-display uppercase">{stats.highestConversion} ({stats.highestRate}%)</p>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Main Table & Visual List */}
      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2 border-b">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Percent className="h-4 w-4 text-primary" /> Lead Source Distribution & Performance
          </CardTitle>
          <CardDescription className="text-xs">Analysis of conversion rates and total pipeline entries categorized by marketing channel</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold w-1/4">Source Channel</TableHead>
                <TableHead className="text-xs font-semibold w-1/3">Lead Volume distribution</TableHead>
                <TableHead className="text-xs font-semibold text-center">Total leads</TableHead>
                <TableHead className="text-xs font-semibold text-center">Won / Enrolled</TableHead>
                <TableHead className="text-xs font-semibold text-center">Lost / Dropped</TableHead>
                <TableHead className="text-xs font-semibold text-right">Conversion Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const percentage = Math.round((r.total / maxLeads) * 100);
                const convRate = r.total > 0 ? Math.round((r.won / r.total) * 100) : 0;
                
                return (
                  <TableRow
                    key={r.source}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setSelectedSource(r.source)}
                  >
                    <TableCell className="font-medium text-xs uppercase">{r.source}</TableCell>
                    
                    {/* Visual Bar */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${percentage}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-6 text-right font-mono">{percentage}%</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-center text-xs font-semibold">{r.total}</TableCell>
                    <TableCell className="text-center text-xs font-semibold text-emerald-600">{r.won}</TableCell>
                    <TableCell className="text-center text-xs font-semibold text-destructive">{r.lost}</TableCell>
                    
                    {/* Conversion badge */}
                    <TableCell className="text-right align-middle">
                      <Badge variant="outline" className={`text-[10px] py-0.5 px-2 font-semibold border ${
                        convRate > 30 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : convRate > 10 ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-secondary text-secondary-foreground border-transparent"
                      }`}>
                        {convRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-xs text-center py-6 text-muted-foreground">No lead sources registered yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Leads details dialog */}
      <Dialog open={!!selectedSource} onOpenChange={(open) => !open && setSelectedSource(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-bold uppercase tracking-tight">
              Leads from: <span className="text-primary">{selectedSource}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Listing all registered inquiry profiles attributed to this marketing channel.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold">Lead Name</TableHead>
                  <TableHead className="text-xs font-semibold">Contact Info</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Score</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Date Added</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadsForSelectedSource.map((l) => (
                  <TableRow key={l.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-xs">{l.full_name}</TableCell>
                    <TableCell className="align-middle">
                      <div className="flex flex-col gap-1 text-[11px] text-muted-foreground font-sans">
                        {l.email && (
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3 w-3 shrink-0" /> {l.email}
                          </span>
                        )}
                        {l.phone && (
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 shrink-0" /> {l.phone}
                          </span>
                        )}
                        {!l.email && !l.phone && <span>—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      <div className="flex items-center justify-center gap-0.5 text-xs font-semibold">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span>{l.score}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      <Badge variant="outline" className={`text-[10px] py-0.5 px-2 font-semibold uppercase border ${
                        l.status === "won" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : l.status === "lost" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      }`}>
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs align-middle">
                      <div className="flex items-center gap-1 text-[11px]">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>{l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-middle">
                      <a
                        href={`/${schoolSlug}/marketing/leads?search=${encodeURIComponent(l.full_name)}`}
                        onClick={() => setSelectedSource(null)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-semibold"
                      >
                        Open CRM <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
                {leadsForSelectedSource.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-xs text-center py-6 text-muted-foreground">
                      No leads recorded under this source.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
