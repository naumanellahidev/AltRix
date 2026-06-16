import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Plus, 
  Trash2, 
  Edit, 
  DollarSign, 
  Calendar, 
  Sparkles, 
  Layers, 
  CheckCircle2, 
  Info,
  ListCollapse,
  AlertTriangle,
  Copy,
  UserCheck,
  Search,
  X
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useOfflineFeePlans } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type FeePlan = {
  id: string;
  school_id: string;
  name: string;
  currency: string;
  is_active: boolean;
  notes: string | null;
  class_id: string | null;
  billing_frequency: string;
  school_year: string | null;
  created_at: string;
};

type FeeItem = {
  id: string;
  fee_plan_id: string;
  label: string;
  category: string;
  amount: number;
  sort_order: number;
};

type AcademicClass = {
  id: string;
  name: string;
};

type ClassSection = {
  id: string;
  name: string;
  class_id: string;
};

const CATEGORIES = [
  { value: "tuition", label: "Tuition Fee" },
  { value: "admission", label: "Admission Fee" },
  { value: "transport", label: "Transport" },
  { value: "exam", label: "Exam Fee" },
  { value: "uniform", label: "Uniform" },
  { value: "books", label: "Books" },
  { value: "lab", label: "Lab Charges" },
  { value: "sports", label: "Sports" },
  { value: "library", label: "Library Fee" },
  { value: "other", label: "Other" }
];

export function AccountantFeesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const queryClient = useQueryClient();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const { isOffline, isUsingCache, refresh: refreshOffline } = useOfflineFeePlans(schoolId);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");

  // Modal / Form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<FeePlan | null>(null);
  
  const [formName, setFormName] = useState("");
  const [formCurrency, setFormCurrency] = useState("PKR");
  const [formClassId, setFormClassId] = useState("__none");
  const [formBillingFrequency, setFormBillingFrequency] = useState("monthly");
  const [formSchoolYear, setFormSchoolYear] = useState(new Date().getFullYear().toString());
  const [formNotes, setFormNotes] = useState("");
  const [formActive, setFormActive] = useState(true);

  // Bulk Assign Dialog State
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignClassId, setAssignClassId] = useState("");
  const [enrolledCount, setEnrolledCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  // Component details State
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Item additions
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("tuition");
  const [newItemAmount, setNewItemAmount] = useState("");

  // Queries
  const { data: feePlans = [], isLoading: loadingPlans } = useQuery({
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

  const { data: classes = [] } = useQuery({
    queryKey: ["academic_classes", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_classes")
        .select("id, name")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return data as AcademicClass[];
    },
    enabled: !!schoolId,
  });

  const { data: feeItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ["fee_plan_items", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_plan_items")
        .select("*")
        .eq("school_id", schoolId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as FeeItem[];
    },
    enabled: !!schoolId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["student_fee_assignments_summary", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_fee_assignments")
        .select("id, student_id, fee_plan_id")
        .eq("school_id", schoolId!)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  // Derived states
  const classesById = useMemo(() => Object.fromEntries(classes.map(c => [c.id, c.name])), [classes]);

  const activePlan = useMemo(() => feePlans.find(p => p.id === selectedPlanId), [feePlans, selectedPlanId]);

  const currentItems = useMemo(() => 
    feeItems.filter(i => i.fee_plan_id === selectedPlanId), 
    [feeItems, selectedPlanId]
  );

  const itemsTotal = useMemo(() => 
    currentItems.reduce((sum, item) => sum + Number(item.amount || 0), 0), 
    [currentItems]
  );

  const filteredPlans = useMemo(() => {
    return feePlans.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (p.notes && p.notes.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesClass = classFilter === "all" || p.class_id === classFilter;
      return matchesSearch && matchesClass;
    });
  }, [feePlans, searchQuery, classFilter]);

  // Actions
  const resetForm = () => {
    setFormName("");
    setFormCurrency("PKR");
    setFormClassId("__none");
    setFormBillingFrequency("monthly");
    setFormSchoolYear(new Date().getFullYear().toString());
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
    setFormClassId(plan.class_id || "__none");
    setFormBillingFrequency(plan.billing_frequency);
    setFormSchoolYear(plan.school_year || new Date().getFullYear().toString());
    setFormNotes(plan.notes || "");
    setFormActive(plan.is_active);
    setDialogOpen(true);
  };

  const handleSavePlan = async () => {
    if (!schoolId) return;
    if (!formName.trim()) {
      toast.error("Plan name is required");
      return;
    }

    const payload = {
      school_id: schoolId,
      name: formName.trim(),
      currency: formCurrency.trim(),
      class_id: formClassId === "__none" ? null : formClassId,
      billing_frequency: formBillingFrequency,
      school_year: formSchoolYear.trim() || null,
      notes: formNotes.trim() || null,
      is_active: formActive,
    };

    if (editingPlan) {
      const { error } = await supabase
        .from("fee_plans")
        .update(payload)
        .eq("id", editingPlan.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Billing structure updated");
    } else {
      const { data, error } = await supabase
        .from("fee_plans")
        .insert(payload)
        .select()
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setSelectedPlanId(data.id);
      toast.success("Billing structure created");
    }

    setDialogOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["fee_plans", schoolId] });
  };

  const handleDeletePlan = async (id: string) => {
    const { error } = await supabase.from("fee_plans").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Billing structure deleted");
    if (selectedPlanId === id) setSelectedPlanId(null);
    queryClient.invalidateQueries({ queryKey: ["fee_plans", schoolId] });
  };

  // Add Item
  const handleAddItem = async () => {
    if (!schoolId || !selectedPlanId) return;
    if (!newItemLabel.trim()) {
      toast.error("Item label required");
      return;
    }
    const amount = Number(newItemAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }

    const { error } = await supabase.from("fee_plan_items").insert({
      school_id: schoolId,
      fee_plan_id: selectedPlanId,
      label: newItemLabel.trim(),
      category: newItemCategory,
      amount,
      sort_order: currentItems.length + 1
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Fee component added");
    setNewItemLabel("");
    setNewItemAmount("");
    queryClient.invalidateQueries({ queryKey: ["fee_plan_items", schoolId] });
  };

  // Delete Item
  const handleDeleteItem = async (id: string) => {
    const { error } = await supabase.from("fee_plan_items").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Fee component deleted");
    queryClient.invalidateQueries({ queryKey: ["fee_plan_items", schoolId] });
  };

  // Clone Structure
  const handleClonePlan = async (sourcePlan: FeePlan) => {
    if (!schoolId) return;
    try {
      // 1. Insert new plan
      const { data: clonedPlan, error: planErr } = await supabase
        .from("fee_plans")
        .insert({
          school_id: schoolId,
          name: `${sourcePlan.name} (Copy)`,
          class_id: sourcePlan.class_id,
          billing_frequency: sourcePlan.billing_frequency,
          school_year: sourcePlan.school_year,
          notes: sourcePlan.notes ? `Cloned from ${sourcePlan.name}. ${sourcePlan.notes}` : `Cloned from ${sourcePlan.name}`,
          currency: sourcePlan.currency,
          is_active: sourcePlan.is_active,
        })
        .select()
        .single();

      if (planErr) throw planErr;

      // 2. Fetch source plan's items
      const { data: sourceItems, error: itemsFetchErr } = await supabase
        .from("fee_plan_items")
        .select("*")
        .eq("fee_plan_id", sourcePlan.id);

      if (itemsFetchErr) throw itemsFetchErr;

      // 3. Insert cloned items
      if (sourceItems && sourceItems.length > 0) {
        const clonedItemsPayload = sourceItems.map(item => ({
          school_id: schoolId,
          fee_plan_id: clonedPlan.id,
          label: item.label,
          category: item.category,
          amount: item.amount,
          sort_order: item.sort_order,
        }));

        const { error: itemsInsertErr } = await supabase
          .from("fee_plan_items")
          .insert(clonedItemsPayload);

        if (itemsInsertErr) throw itemsInsertErr;
      }

      toast.success("Billing structure cloned successfully!");
      queryClient.invalidateQueries({ queryKey: ["fee_plans", schoolId] });
      queryClient.invalidateQueries({ queryKey: ["fee_plan_items", schoolId] });
      setSelectedPlanId(clonedPlan.id);
    } catch (err: any) {
      toast.error("Failed to clone: " + err.message);
    }
  };

  // Bulk Assign Class Dialog change count
  const handleAssignClassChange = async (cid: string) => {
    setAssignClassId(cid);
    if (!cid || cid === "__none") {
      setEnrolledCount(null);
      return;
    }
    setCounting(true);
    try {
      const { data: sectionsData } = await supabase
        .from("class_sections")
        .select("id")
        .eq("class_id", cid);

      const sectionIds = (sectionsData || []).map(s => s.id);
      if (sectionIds.length === 0) {
        setEnrolledCount(0);
        return;
      }

      const { count } = await supabase
        .from("student_enrollments")
        .select("student_id", { count: "exact", head: true })
        .in("class_section_id", sectionIds)
        .is("end_date", null);

      setEnrolledCount(count || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setCounting(false);
    }
  };

  // Bulk Assign action execution
  const handleExecuteBulkAssign = async () => {
    if (!schoolId || !selectedPlanId || !assignClassId) return;
    try {
      // 1. Get Sections
      const { data: sectionsData } = await supabase
        .from("class_sections")
        .select("id")
        .eq("class_id", assignClassId);

      const sectionIds = (sectionsData || []).map(s => s.id);
      if (sectionIds.length === 0) {
        toast.error("No sections found for this class");
        return;
      }

      // 2. Get Students enrolled
      const { data: enrollments, error: enrollErr } = await supabase
        .from("student_enrollments")
        .select("student_id")
        .in("class_section_id", sectionIds)
        .is("end_date", null);

      if (enrollErr) throw enrollErr;

      const studentIds = Array.from(new Set((enrollments || []).map(e => e.student_id)));
      if (studentIds.length === 0) {
        toast.error("No enrolled students found in this class");
        return;
      }

      // 3. Upsert assignments
      const assignmentsPayload = studentIds.map(sid => ({
        school_id: schoolId,
        student_id: sid,
        fee_plan_id: selectedPlanId,
        discount_pct: 0,
        scholarship_amount: 0,
        is_active: true
      }));

      const { error: assignErr } = await supabase
        .from("student_fee_assignments")
        .upsert(assignmentsPayload, { onConflict: "student_id,fee_plan_id" });

      if (assignErr) throw assignErr;

      toast.success(`Plan successfully assigned to ${studentIds.length} students in class!`);
      setAssignDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["student_fee_assignments_summary", schoolId] });
    } catch (err: any) {
      toast.error("Failed to assign plan: " + err.message);
    }
  };

  const openBulkAssign = () => {
    if (activePlan?.class_id) {
      handleAssignClassChange(activePlan.class_id);
    } else {
      setAssignClassId("");
      setEnrolledCount(null);
    }
    setAssignDialogOpen(true);
  };

  if (loadingPlans && !isUsingCache) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={refreshOffline} />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/30 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">Active Structures</p>
              <h3 className="text-2xl font-bold text-slate-800">{feePlans.filter(p => p.is_active).length} Templates</h3>
            </div>
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/30 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">Configured Items</p>
              <h3 className="text-2xl font-bold text-slate-800">{feeItems.length} Components</h3>
            </div>
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
              <Sparkles className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/30 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">Assigned Students</p>
              <h3 className="text-2xl font-bold text-slate-800">{assignments.length} Enrolled</h3>
            </div>
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Billing Setup Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Structures List */}
        <Card className="lg:col-span-5 shadow-sm border border-blue-50">
          <CardHeader className="flex flex-col space-y-4 pb-3 border-b border-blue-50">
            <div className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-slate-800 font-display text-base font-bold">Billing Templates</CardTitle>
                <CardDescription className="text-xs">Define base fee structures.</CardDescription>
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="default" onClick={openCreate} className="h-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-xs">
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> New Structure
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] rounded-2xl border-blue-100">
                  <DialogHeader>
                    <DialogTitle className="text-slate-800 font-display font-bold">
                      {editingPlan ? "Modify Billing Structure" : "New Billing Structure"}
                    </DialogTitle>
                    <DialogDescription>Setup a unified template that can be assigned to students.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="planName">Template Title</Label>
                      <Input
                        id="planName"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="e.g. 2026 Primary Grade Tuition"
                        className="rounded-xl border-blue-100 focus-visible:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="planClass">Target Class (Optional)</Label>
                        <Select value={formClassId} onValueChange={setFormClassId}>
                          <SelectTrigger className="rounded-xl border-blue-100">
                            <SelectValue placeholder="Select class" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">— All Classes —</SelectItem>
                            {classes.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="planFrequency">Billing Frequency</Label>
                        <Select value={formBillingFrequency} onValueChange={setFormBillingFrequency}>
                          <SelectTrigger className="rounded-xl border-blue-100">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="semi_annual">Semi-Annual</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                            <SelectItem value="one_time">One-time</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="planYear">School Year</Label>
                        <Input
                          id="planYear"
                          value={formSchoolYear}
                          onChange={(e) => setFormSchoolYear(e.target.value)}
                          placeholder="e.g. 2026"
                          className="rounded-xl border-blue-100 focus-visible:ring-blue-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="planCurrency">Currency</Label>
                        <Input
                          id="planCurrency"
                          value={formCurrency}
                          onChange={(e) => setFormCurrency(e.target.value)}
                          placeholder="PKR"
                          className="rounded-xl border-blue-100 focus-visible:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="planNotes">Internal Description</Label>
                      <Input
                        id="planNotes"
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder="Add brief details or payment terms..."
                        className="rounded-xl border-blue-100 focus-visible:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-2 pl-1">
                      <Switch id="planActive" checked={formActive} onCheckedChange={setFormActive} />
                      <Label htmlFor="planActive" className="cursor-pointer text-slate-700">Active Template</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl border-blue-100 text-slate-600 hover:bg-blue-50/50">
                      Cancel
                    </Button>
                    <Button onClick={handleSavePlan} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                      {editingPlan ? "Update Structure" : "Create Structure"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Live Search and Filtering Row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search template name..."
                  className="pl-8 h-8 rounded-xl text-xs border-blue-100 focus-visible:ring-blue-500"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-[140px] h-8 rounded-xl text-xs border-blue-100">
                  <SelectValue placeholder="Class Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[460px] p-4">
              <div className="space-y-3">
                {filteredPlans.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-8">No billing structures found.</p>
                )}
                {filteredPlans.map(p => (
                  <div 
                    key={p.id} 
                    className={`p-3.5 rounded-2xl border transition-all duration-300 cursor-pointer ${selectedPlanId === p.id ? "bg-blue-50/40 border-blue-400 shadow-sm" : "bg-white hover:bg-blue-50/10 border-blue-50 hover:border-blue-100"}`} 
                    onClick={() => setSelectedPlanId(p.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{p.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <Badge variant="soft" className="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0">
                            {p.class_id ? classesById[p.class_id] : "All Classes"}
                          </Badge>
                          <Badge variant="soft" className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0 capitalize">
                            {p.billing_frequency}
                          </Badge>
                          {p.school_year && (
                            <Badge variant="soft" className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0">
                              {p.school_year}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50/50" onClick={() => openEdit(p)} title="Edit metadata">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50/50" onClick={() => handleClonePlan(p)} title="Clone plan">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-500 hover:text-destructive hover:bg-destructive/5">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl border-blue-100">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Void Billing Structure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently void "{p.name}" and delete all its associated components. This action is irreversible.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl border-blue-100 text-slate-600">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeletePlan(p.id)} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/95">Void Structure</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    {p.notes && (
                      <p className="text-[11px] text-muted-foreground mt-2 line-clamp-1 italic">{p.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right Side: Setup components & Assignments */}
        <Card className="lg:col-span-7 shadow-sm border border-blue-50 min-h-[530px]">
          {!selectedPlanId ? (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
              <div className="p-4 rounded-full bg-blue-50 text-blue-600 animate-pulse">
                <Layers className="h-8 w-8" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-800 text-sm">Select Billing Template</h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto mt-1">
                  Choose a structure from the left panel to configure its fee items and trigger operations.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-blue-50">
                <div>
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-1.5">
                    {activePlan?.name}
                    <Badge variant={activePlan?.is_active ? "default" : "outline"} className={activePlan?.is_active ? "bg-blue-600 text-white" : ""}>
                      {activePlan?.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Manage the actual itemized categories and students assignment.
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Button size="sm" variant="outline" className="rounded-xl h-9 text-xs border-blue-100 hover:bg-blue-50 text-blue-600 gap-1.5" onClick={openBulkAssign}>
                    <UserCheck className="h-4 w-4" />
                    <span>Assign to Class</span>
                  </Button>

                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Total Plan Value</p>
                    <p className="text-lg font-bold text-blue-600 font-display">
                      Rs. {itemsTotal.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bulk Assign Dialog */}
              <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
                <DialogContent className="sm:max-w-[420px] rounded-2xl border-blue-100">
                  <DialogHeader>
                    <DialogTitle className="text-slate-800 font-display font-bold">Bulk Plan Assignment</DialogTitle>
                    <DialogDescription>Assign "{activePlan?.name}" to all enrolled students in a class.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="assignClass">Target Class</Label>
                      <Select value={assignClassId} onValueChange={handleAssignClassChange}>
                        <SelectTrigger className="rounded-xl border-blue-100">
                          <SelectValue placeholder="Select class to assign" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Select a class...</SelectItem>
                          {classes.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {counting && (
                      <p className="text-xs text-muted-foreground animate-pulse">Scanning class enrollments...</p>
                    )}

                    {enrolledCount !== null && !counting && (
                      <div className="p-3 bg-blue-50/50 border border-blue-100/50 rounded-xl text-slate-700 text-xs">
                        Found <span className="font-bold text-blue-600">{enrolledCount} active student(s)</span> enrolled in this class. Assigning this plan will configure their base fee structure.
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAssignDialogOpen(false)} className="rounded-xl border-blue-100">
                      Cancel
                    </Button>
                    <Button onClick={handleExecuteBulkAssign} disabled={!assignClassId || assignClassId === "__none" || enrolledCount === 0 || counting} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                      Confirm & Assign
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <ListCollapse className="h-4 w-4 text-blue-600" />
                    Fee Components
                  </h4>
                  <span className="text-[10px] text-muted-foreground italic">Add tuition, transport or lab charges</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-5">
                    <Input
                      placeholder="Label (e.g. Tuition Fee Oct)"
                      value={newItemLabel}
                      onChange={(e) => setNewItemLabel(e.target.value)}
                      className="rounded-xl border-blue-100 h-9 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <Select value={newItemCategory} onValueChange={setNewItemCategory}>
                      <SelectTrigger className="rounded-xl border-blue-100 h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={newItemAmount}
                      onChange={(e) => setNewItemAmount(e.target.value)}
                      className="rounded-xl border-blue-100 h-9 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <Button onClick={handleAddItem} className="w-full h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs">
                      Add
                    </Button>
                  </div>
                </div>

                <div className="border border-blue-50 rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader className="bg-blue-50/20">
                      <TableRow className="hover:bg-transparent border-blue-50">
                        <TableHead className="text-slate-700 h-9 text-xs font-semibold py-2">Component Label</TableHead>
                        <TableHead className="text-slate-700 h-9 text-xs font-semibold py-2">Category</TableHead>
                        <TableHead className="text-slate-700 h-9 text-xs font-semibold py-2 text-right">Amount</TableHead>
                        <TableHead className="h-9 w-10 py-2"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground">
                            No components added. Add one above (e.g., Tuition, Transport).
                          </TableCell>
                        </TableRow>
                      ) : (
                        currentItems.map((item) => (
                          <TableRow key={item.id} className="border-blue-50 hover:bg-blue-50/5">
                            <TableCell className="py-2.5 text-xs text-slate-800 font-medium">{item.label}</TableCell>
                            <TableCell className="py-2.5 text-xs text-slate-600 capitalize">{item.category}</TableCell>
                            <TableCell className="py-2.5 text-xs text-right text-slate-800 font-bold">
                              Rs. {Number(item.amount).toLocaleString()}
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:text-destructive hover:bg-destructive/5" onClick={() => handleDeleteItem(item.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {currentItems.length > 0 && (
                        <TableRow className="bg-blue-50/10 hover:bg-blue-50/15 border-t border-blue-100">
                          <TableCell colSpan={2} className="py-2.5 text-xs font-bold text-slate-800">Total Component Value</TableCell>
                          <TableCell className="py-2.5 text-xs text-right font-extrabold text-blue-600">
                            Rs. {itemsTotal.toLocaleString()}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
