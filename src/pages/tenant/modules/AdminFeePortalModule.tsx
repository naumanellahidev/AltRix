import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  CreditCard, DollarSign, Percent, ShieldAlert, Plus, Trash2, RefreshCw, CheckCircle2, Layers
} from "lucide-react";

interface SiblingDiscount {
  id: string;
  sibling_number: number;
  discount_percentage: number;
  is_active: boolean;
}

interface GatewayConfig {
  id: string;
  provider_name: string;
  is_active: boolean;
  mode: string;
}

interface Escalation {
  id: string;
  student_id: string;
  overdue_days: number;
  reason: string;
  resolved: boolean;
}

export function AdminFeePortalModule() {
  const [activeTab, setActiveTab] = useState("discounts");
  const [discounts, setDiscounts] = useState<SiblingDiscount[]>([]);
  const [gateways, setGateways] = useState<GatewayConfig[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(false);

  const [showAddDiscount, setShowAddDiscount] = useState(false);
  const [newDisc, setNewDisc] = useState({ sibling_number: 2, discount_percentage: 15 });

  const loadData = async () => {
    setLoading(true);
    try {
      const [resDisc, resGate, resEsc] = await Promise.all([
        apiClient.get("/finance/sibling-discounts"),
        apiClient.get("/finance/gateway-configs"),
        apiClient.get("/finance/escalations")
      ]);
      setDiscounts(resDisc.data ?? []);
      setGateways(resGate.data ?? []);
      setEscalations(resEsc.data ?? []);
    } catch {
      setDiscounts([]);
      setGateways([]);
      setEscalations([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddDiscount = async () => {
    try {
      await apiClient.post("/finance/sibling-discounts", newDisc);
      toast.success("Sibling discount rule saved");
      setShowAddDiscount(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to add discount rule");
    }
  };

  const handleDeleteDiscount = async (id: string) => {
    try {
      await apiClient.delete(`/finance/sibling-discounts/${id}`);
      toast.success("Discount rule deleted");
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to delete discount rule");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 text-white rounded-2xl p-6 shadow-lg shadow-blue-500/10 border border-blue-400/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <DollarSign className="h-8 w-8 text-blue-100" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Fee Policy & Payment Gateway Control</h1>
              <p className="text-blue-100 text-sm mt-0.5">Automated sibling discounts, online gateway API keys (Stripe, 1Link, JazzCash) & fee escalations</p>
            </div>
          </div>
          <Button onClick={loadData} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Sync Configs
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <Percent className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sibling Concessions</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{discounts.length} Rules Active</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Gateways</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{gateways.length} Integrated</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fee Audit Escalations</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{escalations.filter(e => !e.resolved).length} Pending</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 mb-4">
          <TabsTrigger value="discounts" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-medium">
            <Percent className="h-4 w-4 mr-2" /> Sibling Discount Matrix
          </TabsTrigger>
          <TabsTrigger value="gateways" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-medium">
            <CreditCard className="h-4 w-4 mr-2" /> Payment Gateways
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discounts">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Percent className="h-5 w-5 text-blue-600" /> Automated Sibling Concession Rules
              </CardTitle>
              <Button onClick={() => setShowAddDiscount(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">
                <Plus className="h-4 w-4 mr-2" /> Add Discount Rule
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead>Sibling Tier</TableHead>
                    <TableHead>Discount %</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discounts.map(d => (
                    <TableRow key={d.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                      <TableCell className="font-bold text-slate-900 dark:text-slate-100">{d.sibling_number}nd / {d.sibling_number}rd Child</TableCell>
                      <TableCell className="font-bold text-blue-700 dark:text-blue-400">{d.discount_percentage}% Concession</TableCell>
                      <TableCell><Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge></TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteDiscount(d.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gateways">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" /> Online Payment Gateway Integrations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead>Gateway Provider</TableHead>
                    <TableHead>Environment Mode</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gateways.map(g => (
                    <TableRow key={g.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                      <TableCell className="font-bold uppercase text-slate-900 dark:text-slate-100">{g.provider_name}</TableCell>
                      <TableCell className="capitalize font-mono">{g.mode}</TableCell>
                      <TableCell><Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Integrated</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showAddDiscount} onOpenChange={setShowAddDiscount}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Add Sibling Concession Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Sibling Number (2 for 2nd child, 3 for 3rd child)</Label>
              <Input type="number" value={newDisc.sibling_number} onChange={e => setNewDisc({ ...newDisc, sibling_number: parseInt(e.target.value) || 2 })} className="mt-1" />
            </div>
            <div>
              <Label>Discount Percentage (%)</Label>
              <Input type="number" value={newDisc.discount_percentage} onChange={e => setNewDisc({ ...newDisc, discount_percentage: parseFloat(e.target.value) || 10 })} className="mt-1" />
            </div>
            <Button onClick={handleAddDiscount} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">Save Rule</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
