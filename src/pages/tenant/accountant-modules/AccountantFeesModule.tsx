import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit, DollarSign, WifiOff, RefreshCw, Calendar, Sparkles, HelpCircle, Layers, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useOfflineFeePlans } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type FeePlan = {
  id: string;
  name: string;
  currency: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

type Installment = {
  id: string;
  fee_plan_id: string;
  label: string;
  amount: number;
  due_day: number | null;
  sort_order: number;
};

export function AccountantFeesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const queryClient = useQueryClient();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  // Offline hook for fee plans
  const { isOffline, isUsingCache, refresh: refreshOffline } = useOfflineFeePlans(schoolId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<FeePlan | null>(null);
  const [formName, setFormName] = useState("");
  const [formCurrency, setFormCurrency] = useState("PKR");
  const [formNotes, setFormNotes] = useState("");
  const [formActive, setFormActive] = useState(true);

  const [installmentDialog, setInstallmentDialog] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [instLabel, setInstLabel] = useState("");
  const [instAmount, setInstAmount] = useState("");
  const [instDueDay, setInstDueDay] = useState("");

  const { data: feePlans = [], isLoading } = useQuery({
    queryKey: ["fee_plans", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_plans")
        .select("*")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as FeePlan[];
    },
    enabled: !!schoolId,
  });

  const { data: installments = [] } = useQuery({
    queryKey: ["fee_plan_installments", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_plan_installments")
        .select("*")
        .eq("school_id", schoolId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Installment[];
    },
    enabled: !!schoolId,
  });

  const resetForm = () => {
    setFormName("");
    setFormCurrency("PKR");
    setFormNotes("");
    setFormActive(true);
    setEditingPlan(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (plan: FeePlan) => {
    setEditingPlan(plan);
    setFormName(plan.name);
    setFormCurrency(plan.currency);
    setFormNotes(plan.notes || "");
    setFormActive(plan.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!schoolId) return;
    if (!formName.trim()) {
      toast.error("Plan name is required");
      return;
    }

    if (editingPlan) {
      const { error } = await supabase
        .from("fee_plans")
        .update({
          name: formName.trim(),
          currency: formCurrency.trim(),
          notes: formNotes.trim() || null,
          is_active: formActive,
        })
        .eq("id", editingPlan.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Fee plan updated");
    } else {
      const { error } = await supabase.from("fee_plans").insert({
        school_id: schoolId,
        name: formName.trim(),
        currency: formCurrency.trim(),
        notes: formNotes.trim() || null,
        is_active: formActive,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Fee plan created");
    }

    setDialogOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["fee_plans", schoolId] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("fee_plans").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Fee plan deleted");
    queryClient.invalidateQueries({ queryKey: ["fee_plans", schoolId] });
  };

  const openInstallmentDialog = (planId: string) => {
    setSelectedPlanId(planId);
    setInstLabel("");
    setInstAmount("");
    setInstDueDay("");
    setInstallmentDialog(true);
  };

  const handleAddInstallment = async () => {
    if (!schoolId || !selectedPlanId) return;
    if (!instLabel.trim()) {
      toast.error("Installment label required");
      return;
    }
    const amount = Number(instAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }

    const currentInstallments = installments.filter((i) => i.fee_plan_id === selectedPlanId);
    const sortOrder = currentInstallments.length + 1;

    const { error } = await supabase.from("fee_plan_installments").insert({
      school_id: schoolId,
      fee_plan_id: selectedPlanId,
      label: instLabel.trim(),
      amount,
      due_day: instDueDay ? Number(instDueDay) : null,
      sort_order: sortOrder,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Installment added");
    setInstallmentDialog(false);
    queryClient.invalidateQueries({ queryKey: ["fee_plan_installments", schoolId] });
  };

  const handleDeleteInstallment = async (id: string) => {
    const { error } = await supabase.from("fee_plan_installments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Installment deleted");
    queryClient.invalidateQueries({ queryKey: ["fee_plan_installments", schoolId] });
  };

  const getInstallmentsForPlan = (planId: string) => installments.filter((i) => i.fee_plan_id === planId);

  if (isLoading && !isUsingCache) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={refreshOffline} />
      
      {/* Dynamic Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-surface border shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Active Structures</p>
              <h3 className="text-2xl font-bold font-display">{feePlans.filter(p => p.is_active).length} Plans</h3>
            </div>
            <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface border shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Configured Segments</p>
              <h3 className="text-2xl font-bold font-display">{installments.length} Installments</h3>
            </div>
            <div className="p-3 rounded-2xl bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400">
              <Sparkles className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface border shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Offline Caching</p>
              <h3 className="text-2xl font-bold font-display">{isOffline ? "Offline Mode" : "Real-time Live"}</h3>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div>
            <CardTitle className="font-display text-lg font-bold">Billing Plan Definitions</CardTitle>
            <p className="text-xs text-muted-foreground">Define base tuition rates and structured payment milestones.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="default" onClick={openCreate} className="rounded-xl shadow-sm">
                <Plus className="mr-1.5 h-4 w-4" /> Create Fee Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-2xl">
              <DialogHeader>
                <DialogTitle>{editingPlan ? "Modify Billing Structure" : "New Billing Structure"}</DialogTitle>
                <DialogDescription>Setup a unified template that can be assigned to students.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-3">
                <div className="space-y-1.5">
                  <Label htmlFor="planName">Plan Title</Label>
                  <Input
                    id="planName"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. 2026 Primary Grade Tuition"
                    className="rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="planCurrency">Currency Code</Label>
                    <Input
                      id="planCurrency"
                      value={formCurrency}
                      onChange={(e) => setFormCurrency(e.target.value)}
                      placeholder="PKR"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-6 pl-2">
                    <Switch id="planActive" checked={formActive} onCheckedChange={setFormActive} />
                    <Label htmlFor="planActive" className="cursor-pointer">Active Plan</Label>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="planNotes">Internal Description</Label>
                  <Input
                    id="planNotes"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Add brief details or payment terms..."
                    className="rounded-xl"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">
                  Cancel
                </Button>
                <Button onClick={handleSave} className="rounded-xl">{editingPlan ? "Update Structure" : "Create Structure"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {feePlans.map((plan) => {
          const planInsts = getInstallmentsForPlan(plan.id);
          const planTotal = planInsts.reduce((sum, i) => sum + i.amount, 0);

          return (
            <Card key={plan.id} className="relative overflow-hidden bg-surface shadow-sm border border-muted hover:border-primary/40 hover:shadow-md transition-all duration-300 flex flex-col justify-between rounded-2xl group">
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-base group-hover:text-primary transition-colors">{plan.name}</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Created {new Date(plan.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={plan.is_active ? "default" : "secondary"} className="rounded-md px-2 py-0.5 text-[10px]">
                      {plan.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => openEdit(plan)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Void Billing Structure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Voids "{plan.name}" and removes all associated payment installments. This action cannot be reversed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(plan.id)} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/95">Void Structure</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {plan.notes && (
                  <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-xl border border-muted/50 leading-relaxed">
                    {plan.notes}
                  </p>
                )}

                {/* Visual Timeline Distribution */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Installments Schedule</p>
                    <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs rounded-lg border border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40" onClick={() => openInstallmentDialog(plan.id)}>
                      <Plus className="mr-1 h-3 w-3" /> Add Installment
                    </Button>
                  </div>

                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {planInsts.map((inst, index) => {
                      const pct = planTotal > 0 ? (inst.amount / planTotal) * 100 : 0;
                      return (
                        <div key={inst.id} className="relative flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-muted/50 hover:bg-muted/70 hover:border-primary/25 transition-all">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                              {index + 1}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-foreground">{inst.label}</p>
                              {inst.due_day && (
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Calendar className="h-3 w-3" />
                                  <span>Due: Day {inst.due_day} of cycle</span>
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs font-bold text-foreground">
                                {plan.currency} {inst.amount.toLocaleString()}
                              </p>
                              <p className="text-[9px] text-muted-foreground font-medium mt-0.5">
                                {pct.toFixed(0)}% of total
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteInstallment(inst.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    {planInsts.length === 0 && (
                      <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                        No installments configured. Create one to define structure value.
                      </div>
                    )}
                  </div>
                </div>

                {/* Plan Total Summation Card */}
                {planInsts.length > 0 && (
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-primary/5 border border-primary/10">
                    <span className="text-xs font-semibold text-muted-foreground">Total Plan Value</span>
                    <span className="text-sm font-bold text-primary">
                      {plan.currency} {planTotal.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        {feePlans.length === 0 && (
          <Card className="lg:col-span-2 shadow-sm border border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <DollarSign className="mx-auto h-12 w-12 text-muted-foreground/30 animate-pulse" />
              <p className="text-sm font-bold">No Billing Plans Found</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Billing plans must be created before they can be distributed to students. Establish your first structure above.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Installment Dialog */}
      <Dialog open={installmentDialog} onOpenChange={setInstallmentDialog}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Installment</DialogTitle>
            <DialogDescription>Define a scheduled billing item for this plan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="instLabel">Label / Milestone</Label>
              <Input
                id="instLabel"
                value={instLabel}
                onChange={(e) => setInstLabel(e.target.value)}
                placeholder="e.g. Admission Fee, Term 1, Tuition Oct"
                className="rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="instAmount">Milestone Amount</Label>
                <Input
                  id="instAmount"
                  type="number"
                  value={instAmount}
                  onChange={(e) => setInstAmount(e.target.value)}
                  placeholder="0"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="instDueDay">Due Day of Month</Label>
                <Input
                  id="instDueDay"
                  type="number"
                  value={instDueDay}
                  onChange={(e) => setInstDueDay(e.target.value)}
                  placeholder="e.g. 10"
                  className="rounded-xl"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallmentDialog(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleAddInstallment} className="rounded-xl">Add Milestone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
