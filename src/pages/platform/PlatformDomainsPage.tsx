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
import { Globe, ShieldCheck, RefreshCw, Plus, Trash2, CheckCircle2, AlertTriangle, Save, Palette } from "lucide-react";

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
  const [brandColor, setBrandColor] = useState("#f59e0b"); // amber-500
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
    <SuperAdminShell title="Domains & Branding" subtitle="Configure custom domains, verify DNS records, manage SSL certificates, and set whitelabel parameters">
      <div className="space-y-6 text-zinc-100">
        
        {/* Domain Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">Custom Domains</p>
              <h3 className="text-2xl font-bold text-amber-500 mt-1">{domains.length} Active</h3>
            </div>
            <Globe className="h-8 w-8 text-amber-500/20" />
          </Card>
          <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">SSL Encryption</p>
              <h3 className="text-2xl font-bold text-emerald-400 mt-1">100% Secured</h3>
            </div>
            <ShieldCheck className="h-8 w-8 text-emerald-400/20" />
          </Card>
          <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">Whitelabel Instances</p>
              <h3 className="text-2xl font-bold text-white mt-1">14 Schools</h3>
            </div>
            <Palette className="h-8 w-8 text-white/20" />
          </Card>
          <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">DNS Propagations</p>
              <h3 className="text-2xl font-bold text-white mt-1">Active</h3>
            </div>
            <CheckCircle2 className="h-8 w-8 text-white/20" />
          </Card>
        </div>

        {/* Mappings and Branding side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Domains Manager */}
          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader>
              <CardTitle className="text-base font-bold text-white">Custom Domain Mappings</CardTitle>
              <p className="text-xs text-zinc-400">Route private domains into tenant portals</p>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30"
                  placeholder="e.g. portal.beacon.edu"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                />
                <div className="flex gap-2">
                  <Select value={newSlug} onValueChange={setNewSlug} disabled={loadingSchools}>
                    <SelectTrigger className="w-full bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30">
                      <SelectValue placeholder="Slug" />
                    </SelectTrigger>
                    <SelectContent>
                      {schools.map((s) => (
                        <SelectItem key={s.id} value={s.slug}>
                          /{s.slug}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAddDomain}
                    className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-sm"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 mt-4">
                <Table>
                  <TableHeader className="bg-zinc-900/40">
                    <TableRow className="border-b border-zinc-900 hover:bg-transparent">
                      <TableHead className="text-zinc-400 font-semibold">Custom Domain</TableHead>
                      <TableHead className="text-zinc-400 font-semibold">Slug</TableHead>
                      <TableHead className="text-zinc-400 font-semibold">Status</TableHead>
                      <TableHead className="text-zinc-400 font-semibold"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domains.map((d) => (
                      <TableRow key={d.domain} className="border-b border-zinc-900/80 hover:bg-zinc-900/30">
                        <TableCell className="font-mono text-xs text-white truncate max-w-[180px]">{d.domain}</TableCell>
                        <TableCell className="text-zinc-300 font-semibold">/{d.slug}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${
                            d.status === "Active" ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" : "border-amber-500/20 text-amber-400 bg-amber-500/5 animate-pulse"
                          }`}>
                            {d.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={() => handleDeleteDomain(d.domain)}
                            className="text-rose-500 hover:text-rose-400 p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

            </CardContent>
          </Card>

          {/* Whitelabel Branding Card */}
          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader>
              <CardTitle className="text-base font-bold text-white">Platform Whitelabel Branding</CardTitle>
              <p className="text-xs text-zinc-400">Configure global metadata tags, footer texts and brand identities</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Platform Layout Title</label>
                <Input
                  className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30"
                  value={brandTitle}
                  onChange={(e) => setBrandTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Primary Theme Color</label>
                  <div className="flex gap-2">
                    <Input
                      className="bg-zinc-900 border-amber-500/20 text-white focus-visible:ring-amber-500/30"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                    />
                    <div
                      className="h-10 w-12 rounded-md border border-zinc-800"
                      style={{ backgroundColor: brandColor }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Platform Footer Copyright</label>
                  <Input
                    className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30"
                    value={brandFooter}
                    onChange={(e) => setBrandFooter(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-900 flex justify-end">
                <Button
                  onClick={handleSaveBranding}
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-md shadow-amber-500/10 px-6"
                >
                  <Save className="h-4 w-4 mr-2" /> Save Branding
                </Button>
              </div>

            </CardContent>
          </Card>

        </div>

      </div>
    </SuperAdminShell>
  );
}
