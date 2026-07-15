import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api-client";
import {
  CreditCard,
  Plus,
  Trash2,
  AlertCircle,
  FileText,
  Percent,
  Settings,
  ShieldAlert,
  Calendar,
  Layers,
  Save,
  CheckCircle,
  TrendingUp,
  DollarSign
} from "lucide-react";
import { toast } from "sonner";

interface SiblingDiscount {
  id: string;
  name: string;
  sibling_number: number;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
}

interface PaymentGatewayConfig {
  id: string;
  gateway_name: string;
  display_name: string;
  is_active: boolean;
  is_default: boolean;
  supported_methods: string;
}

interface FeeEscalation {
  id: string;
  invoice_id: string;
  student_id: string;
  escalation_level: number;
  escalation_type: string;
  overdue_days: number;
  overdue_amount: number;
  resolved: boolean;
}

export default function AdminFeePortalModule() {
  const [activeTab, setActiveTab] = useState("discounts");
  const [loading, setLoading] = useState(false);

  // Sibling discounts state
  const [discounts, setDiscounts] = useState<SiblingDiscount[]>([]);
  const [newDiscName, setNewDiscName] = useState("");
  const [newDiscNumber, setNewDiscNumber] = useState(2);
  const [newDiscValue, setNewDiscValue] = useState(10);
  const [newDiscType, setNewDiscType] = useState("percent");

  // Gateway config state
  const [gateways, setGateways] = useState<PaymentGatewayConfig[]>([]);
  const [editingGateway, setEditingGateway] = useState<PaymentGatewayConfig | null>(null);

  // Escalations state
  const [escalations, setEscalations] = useState<FeeEscalation[]>([]);
  const [checkingEscalations, setCheckingEscalations] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [discRes, gateRes, escRes] = await Promise.all([
        apiClient.get("/finance/sibling-discounts"),
        apiClient.get("/finance/gateway-configs"),
        apiClient.get("/finance/escalations"),
      ]);
      setDiscounts(discRes.data || []);
      setGateways(gateRes.data || []);
      setEscalations(escRes.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Error loading administrative fee data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddDiscount = async () => {
    if (!newDiscName) {
      toast.error("Name is required");
      return;
    }
    try {
      await apiClient.post("/finance/sibling-discounts", {
        name: newDiscName,
        sibling_number: newDiscNumber,
        discount_type: newDiscType,
        discount_value: newDiscValue,
      });
      toast.success("Sibling discount rule added!");
      setNewDiscName("");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to add sibling discount");
    }
  };

  const handleDeleteDiscount = async (id: string) => {
    try {
      await apiClient.delete(`/finance/sibling-discounts/${id}`);
      toast.success("Discount deleted");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete discount");
    }
  };

  const handleRunEscalationCheck = async () => {
    setCheckingEscalations(true);
    try {
      const res = await apiClient.post("/finance/escalations/check");
      toast.success(res.data.message || "Escalation protocol checked");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to execute check");
    } finally {
      setCheckingEscalations(false);
    }
  };

  const handleResolveEscalation = async (id: string) => {
    try {
      await apiClient.patch(`/finance/escalations/${id}/resolve`);
      toast.success("Escalation protocol resolved");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to resolve escalation");
    }
  };

  const handleUpdateGateway = async (g: PaymentGatewayConfig) => {
    try {
      await apiClient.post("/finance/gateway-configs", {
        gateway_name: g.gateway_name,
        display_name: g.display_name,
        is_active: !g.is_active,
        is_default: g.is_default,
      });
      toast.success("Gateway status toggled");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to toggle gateway status");
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Title Header */}
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Administrative Fee Manager</h1>
        <p className="text-muted-foreground mt-1">
          Configure payment channels, automated billing discounts, installment layouts, and overdue collections protocols.
        </p>
      </div>

      {/* Tabs list */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="discounts" className="gap-2 rounded-lg">
            <Percent className="h-4 w-4" /> Sibling Discounts
          </TabsTrigger>
          <TabsTrigger value="gateways" className="gap-2 rounded-lg">
            <CreditCard className="h-4 w-4" /> Payment Gateways
          </TabsTrigger>
          <TabsTrigger value="escalations" className="gap-2 rounded-lg">
            <ShieldAlert className="h-4 w-4" /> Collections & Escalations
          </TabsTrigger>
        </TabsList>

        {/* Sibling Discounts Tab Content */}
        <TabsContent value="discounts" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Creator form */}
            <Card className="shadow-soft md:col-span-1 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display">Add Discount Policy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Policy Name</Label>
                  <Input
                    placeholder="e.g. 2nd Child Tuition Off"
                    value={newDiscName}
                    onChange={(e) => setNewDiscName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Sibling Number</Label>
                    <select
                      value={newDiscNumber}
                      onChange={(e) => setNewDiscNumber(Number(e.target.value))}
                      className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                    >
                      <option value={2}>2nd Sibling</option>
                      <option value={3}>3rd Sibling</option>
                      <option value={4}>4th+ Sibling</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Discount Type</Label>
                    <select
                      value={newDiscType}
                      onChange={(e) => setNewDiscType(e.target.value)}
                      className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background text-foreground"
                    >
                      <option value="percent">Percent (%)</option>
                      <option value="fixed">Fixed (PKR)</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Discount Value</Label>
                  <Input
                    type="number"
                    value={newDiscValue}
                    onChange={(e) => setNewDiscValue(Number(e.target.value))}
                  />
                </div>
                <Button onClick={handleAddDiscount} className="w-full bg-primary text-primary-foreground font-semibold">
                  <Plus className="h-4 w-4 mr-2" /> Add Policy
                </Button>
              </CardContent>
            </Card>

            {/* List Policies */}
            <Card className="shadow-soft md:col-span-2 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display">Active Sibling Rules</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="font-semibold pl-6">Policy Name</TableHead>
                      <TableHead className="font-semibold text-center">Sibling No.</TableHead>
                      <TableHead className="font-semibold text-right">Value</TableHead>
                      <TableHead className="font-semibold text-right pr-6">Delete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discounts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                          No sibling discount structures exist. Add a policy using the creator tool.
                        </TableCell>
                      </TableRow>
                    ) : (
                      discounts.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium text-foreground pl-6">{d.name}</TableCell>
                          <TableCell className="text-center font-semibold">{d.sibling_number}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {d.discount_type === "percent" ? `${d.discount_value}%` : `PKR ${d.discount_value.toLocaleString()}`}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button onClick={() => handleDeleteDiscount(d.id)} variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Payment Gateways Tab Content */}
        <TabsContent value="gateways">
          <Card className="shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display">Configured Payment Integrations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold pl-6">Gateway</TableHead>
                    <TableHead className="font-semibold">Display Title</TableHead>
                    <TableHead className="font-semibold">Supported Methods</TableHead>
                    <TableHead className="font-semibold text-center">Integration Status</TableHead>
                    <TableHead className="font-semibold text-right pr-6">Toggle Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gateways.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                        No custom payment configurations seeded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    gateways.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium text-foreground pl-6 capitalize">{g.gateway_name}</TableCell>
                        <TableCell>{g.display_name || g.gateway_name.toUpperCase()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{g.supported_methods || "mobile_wallet, card"}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={g.is_active ? "default" : "outline"} className={g.is_active ? "bg-emerald-500 text-white" : ""}>
                            {g.is_active ? "Live" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button
                            onClick={() => handleUpdateGateway(g)}
                            variant="outline"
                            size="sm"
                            className="border-primary/20 hover:bg-primary/5 text-foreground"
                          >
                            {g.is_active ? "Deactivate" : "Make Live"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Collections & Escalations Tab Content */}
        <TabsContent value="escalations" className="space-y-4">
          <div className="flex justify-between items-center bg-muted/40 p-4 rounded-xl">
            <div className="space-y-0.5">
              <div className="font-semibold text-sm text-foreground">Escalation Protocol Trigger</div>
              <div className="text-xs text-muted-foreground">Scan all unpaid challans past their due date and trigger the appropriate warning track.</div>
            </div>
            <Button
              onClick={handleRunEscalationCheck}
              disabled={checkingEscalations}
              className="bg-primary text-primary-foreground font-semibold"
            >
              {checkingEscalations ? "Running scan..." : "Run Scanner Now"}
            </Button>
          </div>

          <Card className="shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base font-bold font-display">Active Overdue Escalations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold pl-6">Invoice ID</TableHead>
                    <TableHead className="font-semibold">Level</TableHead>
                    <TableHead className="font-semibold">Overdue Days</TableHead>
                    <TableHead className="font-semibold text-right">Outstanding Amount</TableHead>
                    <TableHead className="font-semibold text-center">Protocol Status</TableHead>
                    <TableHead className="font-semibold text-right pr-6">Resolve</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {escalations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">
                        No active billing escalations exist. Let's run a scanner scan.
                      </TableCell>
                    </TableRow>
                  ) : (
                    escalations.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium text-foreground pl-6 font-mono text-xs">{e.invoice_id.substring(0, 8)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-amber-500/30 text-amber-600">
                            Level {e.escalation_level}: {e.escalation_type.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>{e.overdue_days} Days</TableCell>
                        <TableCell className="text-right font-bold">PKR {e.overdue_amount.toLocaleString()}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={e.resolved ? "default" : "destructive"}>
                            {e.resolved ? "RESOLVED" : "ACTIVE BLOCK"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          {!e.resolved && (
                            <Button
                              onClick={() => handleResolveEscalation(e.id)}
                              variant="outline"
                              size="xs"
                              className="border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/10"
                            >
                              Resolve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
