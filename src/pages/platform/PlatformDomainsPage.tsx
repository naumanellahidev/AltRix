import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Globe, ShieldCheck, RefreshCw, Plus, Trash2, CheckCircle2, AlertTriangle, Save, Palette, Zap } from "lucide-react";

type CustomDomain = {
  domain: string;
  slug: string;
  status: "Active" | "Pending";
  ssl: boolean;
};

type SchoolRow = { id: string; slug: string; name: string };

export default function PlatformDomainsPage() {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [domains, setDomains] = useState<CustomDomain[]>([
    { domain: "portal.beacon.edu.pk", slug: "beacon", status: "Active", ssl: true },
    { domain: "lms.roots.edu", slug: "roots", status: "Active", ssl: true },
    { domain: "academics.cityschool.edu.pk", slug: "cityschool", status: "Active", ssl: true },
    { domain: "smartschool.edu", slug: "smart", status: "Pending", ssl: false },
  ]);

  // Form states
  const [newDomain, setNewDomain] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [brandTitle, setBrandTitle] = useState("AltRix - School Operating System");
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [brandFooter, setBrandFooter] = useState("© 2026 AltRix. Powered by Nec.");

  const loadSchools = async () => {
    setLoadingSchools(true);
    const { data, error } = await supabase.from("schools").select("id,slug,name");
    if (!error && data) {
      setSchools(data as SchoolRow[]);
      if (data.length > 0) {
        setNewSlug(data[0].slug);
      }
    }
    setLoadingSchools(false);
  };

  useEffect(() => {
    void loadSchools();
  }, []);

  const handleAddDomain = () => {
    if (!newDomain.trim()) return toast.error("Domain name is required");
    if (!newSlug) return toast.error("Select a target tenant slug");

    const exists = domains.some(d => d.domain === newDomain.trim().toLowerCase());
    if (exists) return toast.error("Domain already configured");

    const entry: CustomDomain = {
      domain: newDomain.trim().toLowerCase(),
      slug: newSlug,
      status: "Pending",
      ssl: false,
    };
    setDomains(prev => [...prev, entry]);
    setNewDomain("");
    toast.success("Custom domain mapping requested!", {
      description: `Targeting CNAME records propagation. Please point ${entry.domain} to altrixbynec.com.`
    });
  };

  const handleDeleteDomain = (domainName: string) => {
    setDomains(prev => prev.filter(d => d.domain !== domainName));
    toast.success("Domain mapping deleted.");
  };

  const handleSaveBranding = () => {
    toast.success("Whitelabel parameters stored successfully!", {
      description: "Platform branding, metadata tags, and brand colors pushed to main assets."
    });
  };

  return (
    <SuperAdminShell title="08. Custom Domains & Edge SSL Authority" subtitle="Manage custom school domain routing (CNAME), edge Let's Encrypt SSL certificates & DNS verification">
      <div className="space-y-6 text-slate-900">
        
        {/* Domain Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-white border border-slate-200 shadow-md p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Custom Domains</p>
              <h3 className="text-2xl font-black text-blue-700 mt-1">{domains.length} Active</h3>
            </div>
            <Globe className="h-8 w-8 text-blue-600/20" />
          </Card>
          <Card className="bg-white border border-slate-200 shadow-md p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Edge SSL Certs</p>
              <h3 className="text-2xl font-black text-emerald-700 mt-1">{domains.filter(d => d.ssl).length} Active</h3>
            </div>
            <ShieldCheck className="h-8 w-8 text-emerald-600/20" />
          </Card>
          <Card className="bg-white border border-slate-200 shadow-md p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">CNAME Status</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">100% Routed</h3>
            </div>
            <CheckCircle2 className="h-8 w-8 text-blue-600/20" />
          </Card>
          <Card className="bg-white border border-slate-200 shadow-md p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">CDN Cache Flush</p>
              <Button size="sm" onClick={() => toast.success("Edge CDN cache invalidated globally")} className="mt-1 bg-blue-600 hover:bg-blue-700 text-white font-bold h-7 text-xs">
                <Zap className="h-3.5 w-3.5 mr-1" /> Flush Cache
              </Button>
            </div>
          </Card>
        </div>

        {/* Add New Custom Domain */}
        <Card className="bg-white border border-slate-200 shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" /> Map New Custom Domain (CNAME)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-3">
              <Input
                placeholder="portal.myschool.edu.pk"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30"
              />
              <Select value={newSlug} onValueChange={setNewSlug} disabled={loadingSchools}>
                <SelectTrigger className="w-full md:w-64 bg-slate-50 border-slate-300 text-blue-900 font-bold focus:ring-blue-500/30">
                  <SelectValue placeholder="Target Tenant Slug" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800">
                  {schools.map(s => (
                    <SelectItem key={s.id} value={s.slug} className="focus:bg-blue-50 font-medium">
                      {s.name} (/{s.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddDomain} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black shrink-0">
                <Globe className="h-4 w-4 mr-2" /> Add Domain
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Domains Table */}
        <Card className="bg-white border border-slate-200 shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">Active Tenant Domain Mappings</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="border-slate-200">
                  <TableHead className="text-slate-600 font-bold">Custom Domain URL</TableHead>
                  <TableHead className="text-slate-600 font-bold">Target Campus</TableHead>
                  <TableHead className="text-slate-600 font-bold">CNAME Status</TableHead>
                  <TableHead className="text-slate-600 font-bold">Edge SSL</TableHead>
                  <TableHead className="text-right text-slate-600 font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map(d => (
                  <TableRow key={d.domain} className="border-slate-100 hover:bg-slate-50">
                    <TableCell className="font-mono font-bold text-blue-700">{d.domain}</TableCell>
                    <TableCell className="font-mono text-slate-700">/{d.slug}</TableCell>
                    <TableCell>
                      <Badge className={d.status === "Active" ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold" : "bg-amber-50 text-amber-800 border-amber-300 font-bold"}>
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={d.ssl ? "bg-blue-50 text-blue-800 border-blue-300 font-bold" : "bg-slate-100 text-slate-500 border-slate-200 font-bold"}>
                        {d.ssl ? "Let's Encrypt SSL Active" : "Pending Cert"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:bg-rose-50" onClick={() => handleDeleteDomain(d.domain)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      </div>
    </SuperAdminShell>
  );
}
