import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, Download, Loader2, Trash2, Users, User, Eye, CheckCircle2, XCircle, AlertCircle, Mail, Upload, Search, X, FileDown, Award, Sparkles, TrendingUp, RefreshCw } from "lucide-react";
import { exportToCSV } from "@/lib/csv";
import { toast } from "sonner";


import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useRealtimeTable } from "@/hooks/useRealtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

import { generateVoucherPdf, type VoucherCopyData } from "@/lib/fee-voucher-pdf";

type FeePlan = { id: string; name: string; currency: string; class_id: string | null };
type FeePlanItem = { id: string; fee_plan_id: string; label: string; amount: number; sort_order: number };
type Klass = { id: string; name: string; grade_level: number | null };
type Section = { id: string; class_id: string; name: string };
type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
  roll_number: string | null;
  student_code: string | null;
  parent_name: string | null;
  parent_phone: string | null;
};
type Batch = {
  id: string;
  scope: string;
  period_label: string | null;
  due_date: string;
  total_students: number;
  total_amount: number;
  created_at: string;
  notes: string | null;
};
type GradeTier = { id: string; minGrade: number; discountPct: number };

const SENTINEL = "__all";

export default function FeeVouchersModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deliveriesBatch, setDeliveriesBatch] = useState<Batch | null>(null);

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["fee_voucher_batches", schoolId] });
    qc.invalidateQueries({ queryKey: ["fee_payment_proofs"] });
    qc.invalidateQueries({ queryKey: ["proof_students"] });
    qc.invalidateQueries({ queryKey: ["proof_invoices"] });
    toast.success("Vouchers and proofs refreshed!");
  };

  // Real-time subscriptions for immediate syncing
  useRealtimeTable({
    channel: `voucher-batches-${schoolId}`,
    table: "fee_voucher_batches",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => {
      qc.invalidateQueries({ queryKey: ["fee_voucher_batches", schoolId] });
    },
  });

  useRealtimeTable({
    channel: `payment-proofs-${schoolId}`,
    table: "fee_payment_proofs",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => {
      qc.invalidateQueries({ queryKey: ["fee_payment_proofs"] });
      qc.invalidateQueries({ queryKey: ["proof_invoices"] });
    },
  });

  useRealtimeTable({
    channel: `proof-invoices-${schoolId}`,
    table: "fee_invoices",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => {
      qc.invalidateQueries({ queryKey: ["proof_invoices"] });
      qc.invalidateQueries({ queryKey: ["fee_invoices", schoolId] });
    },
  });

  useRealtimeTable({
    channel: `proof-payments-${schoolId}`,
    table: "fee_payments",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => {
      qc.invalidateQueries({ queryKey: ["fee_payment_proofs"] });
      qc.invalidateQueries({ queryKey: ["fee_payments", schoolId] });
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["fee_voucher_batches", schoolId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fee_voucher_batches")
        .select("*")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Batch[];
    },
    enabled: !!schoolId,
  });

  return (
    <div className="space-y-6">
      <Card className="shadow-elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="font-display text-xl flex items-center gap-2">
              <Receipt className="h-5 w-5 shrink-0" /> Fee Vouchers
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Generate professional fee vouchers for individuals or entire classes. Parents are notified automatically.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              title="Refresh Vouchers & Proofs"
              className="h-9 w-9 rounded-xl border-blue-100 text-slate-500 hover:text-blue-600 hover:bg-blue-50/50"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="hero" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Generate Voucher
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="text-lg">Recent batches</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No voucher batches yet.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="whitespace-nowrap text-xs">{new Date(b.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="secondary">{b.scope}</Badge></TableCell>
                      <TableCell className="max-w-[180px] truncate" title={b.period_label ?? ""}>{b.period_label ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{b.due_date}</TableCell>
                      <TableCell className="text-right">{b.total_students}</TableCell>
                      <TableCell className="text-right font-medium">
                        {b.total_amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setDeliveriesBatch(b)}>
                          <Eye className="mr-1 h-3 w-3" /> Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PaymentProofsCard schoolId={schoolId} />

      <GenerateVoucherDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) qc.invalidateQueries({ queryKey: ["fee_voucher_batches", schoolId] });
        }}
        schoolId={schoolId}
      />

      <DeliveriesDialog batch={deliveriesBatch} onClose={() => setDeliveriesBatch(null)} />
    </div>
  );
}

type ProofRow = {
  id: string; school_id: string; invoice_id: string; student_id: string;
  file_path: string; file_name: string | null; mime_type: string | null;
  amount: number; paid_at: string | null; method: string | null; note: string | null;
  status: string; rejection_reason: string | null; verified_at: string | null;
  created_at: string;
};

function PaymentProofsCard({ schoolId }: { schoolId: string | null }) {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const sp = (k: string, d = "") => searchParams.get(k) ?? d;
  const [statusFilter, setStatusFilter] = useState<string>(sp("pp_status", "pending"));
  const [methodFilter, setMethodFilter] = useState<string>(sp("pp_method", "__all"));
  const [fromDate, setFromDate] = useState<string>(sp("pp_from"));
  const [toDate, setToDate] = useState<string>(sp("pp_to"));
  const [minAmount, setMinAmount] = useState<string>(sp("pp_min"));
  const [maxAmount, setMaxAmount] = useState<string>(sp("pp_max"));
  const [search, setSearch] = useState<string>(sp("pp_q"));
  const [debouncedSearch, setDebouncedSearch] = useState<string>(search);
  const [viewing, setViewing] = useState<{ url: string; name: string; pdf: boolean } | null>(null);
  const [rejectFor, setRejectFor] = useState<ProofRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectionDropdownVal, setRejectionDropdownVal] = useState("Illegible receipt");
  const [busy, setBusy] = useState<string | null>(null);

  const [selectedProofs, setSelectedProofs] = useState<string[]>([]);
  const [reviewingProof, setReviewingProof] = useState<ProofRow | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [reviewAmount, setReviewAmount] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [reviewMethod, setReviewMethod] = useState("");
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("Illegible receipt");

  const REJECTION_REASONS = [
    { value: "Illegible receipt", label: "Illegible / blur receipt image" },
    { value: "Incorrect amount", label: "Incorrect paid amount" },
    { value: "Duplicate receipt", label: "Duplicate submission" },
    { value: "Cheque bounced", label: "Cheque bounced" },
    { value: "Incorrect reference", label: "Incorrect transaction reference" },
    { value: "Other", label: "Other (Specify reason)" }
  ];

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Persist filters to URL (uses debounced search to avoid history spam)
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDel = (k: string, v: string, dflt = "") => {
      if (v && v !== dflt) next.set(k, v); else next.delete(k);
    };
    setOrDel("pp_q", debouncedSearch);
    setOrDel("pp_status", statusFilter, "pending");
    setOrDel("pp_method", methodFilter, "__all");
    setOrDel("pp_from", fromDate);
    setOrDel("pp_to", toDate);
    setOrDel("pp_min", minAmount);
    setOrDel("pp_max", maxAmount);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, methodFilter, fromDate, toDate, minAmount, maxAmount]);

  const { data: proofs = [] } = useQuery({
    queryKey: ["fee_payment_proofs", schoolId, statusFilter],
    queryFn: async () => {
      let q = (supabase as any).from("fee_payment_proofs")
        .select("id, school_id, invoice_id, student_id, file_path, file_name, mime_type, amount, paid_at, method, note, status, rejection_reason, verified_at, created_at")
        .eq("school_id", schoolId!).order("created_at", { ascending: false }).limit(200);
      if (statusFilter !== "__all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as ProofRow[];
    },
    enabled: !!schoolId,
  });

  const studentIds = Array.from(new Set(proofs.map(p => p.student_id)));
  const invoiceIds = Array.from(new Set(proofs.map(p => p.invoice_id)));
  const { data: students = [] } = useQuery({
    queryKey: ["proof_students", studentIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, first_name, last_name, roll_number").in("id", studentIds);
      return data || [];
    },
    enabled: studentIds.length > 0,
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["proof_invoices", invoiceIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase.from("fee_invoices").select("id, invoice_number, total_amount, paid_amount, status").in("id", invoiceIds);
      return data || [];
    },
    enabled: invoiceIds.length > 0,
  });
  const studentMap = new Map((students as any[]).map(s => [s.id, s]));
  const invoiceMap = new Map((invoices as any[]).map(i => [i.id, i]));

  const methodOptions = useMemo(() => {
    const set = new Set<string>();
    proofs.forEach(p => { if (p.method) set.add(p.method); });
    return Array.from(set).sort();
  }, [proofs]);

  const filteredProofs = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const min = minAmount ? Number(minAmount) : null;
    const max = maxAmount ? Number(maxAmount) : null;
    return proofs.filter(p => {
      if (methodFilter !== "__all" && (p.method || "") !== methodFilter) return false;
      const created = p.created_at?.slice(0, 10) || "";
      if (fromDate && created < fromDate) return false;
      if (toDate && created > toDate) return false;
      if (min !== null && Number(p.amount) < min) return false;
      if (max !== null && Number(p.amount) > max) return false;
      if (q) {
        const s = studentMap.get(p.student_id);
        const inv = invoiceMap.get(p.invoice_id);
        const hay = `${s?.first_name || ""} ${s?.last_name || ""} ${s?.roll_number || ""} ${inv?.invoice_number || ""} ${p.method || ""} ${p.note || ""} ${p.status || ""} ${p.rejection_reason || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [proofs, debouncedSearch, methodFilter, fromDate, toDate, minAmount, maxAmount, studentMap, invoiceMap]);

  const hasActiveFilters = search || methodFilter !== "__all" || fromDate || toDate || minAmount || maxAmount;
  const clearFilters = () => {
    setSearch(""); setMethodFilter("__all"); setFromDate(""); setToDate(""); setMinAmount(""); setMaxAmount("");
  };

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!schoolId) return;
    setExporting(true);
    const tId = toast.loading("Preparing export…");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-payment-proofs`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          schoolId,
          status: statusFilter,
          method: methodFilter,
          fromDate, toDate,
          minAmount: minAmount || null,
          maxAmount: maxAmount || null,
          search: debouncedSearch,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `Export failed (${res.status})`);
      }
      const count = Number(res.headers.get("X-Row-Count") || 0);
      if (count === 0) {
        toast.info("Nothing to export", { id: tId });
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `payment-proofs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(href);
      toast.success(`Exported ${count} row${count === 1 ? "" : "s"}`, { id: tId });
    } catch (e: any) {
      toast.error(e?.message || "Export failed", { id: tId });
    } finally {
      setExporting(false);
    }
  };

  // Reset rejection states on dialog open
  useEffect(() => {
    if (rejectFor) {
      setRejectionDropdownVal("Illegible receipt");
      setRejectReason("Illegible / blur receipt image");
    }
  }, [rejectFor]);

  useEffect(() => {
    if (bulkRejectOpen) {
      setBulkRejectReason("Illegible receipt");
      setRejectReason("Illegible / blur receipt image");
    }
  }, [bulkRejectOpen]);

  const openProof = async (p: ProofRow) => {
    const { data, error } = await supabase.storage.from("fee-payment-proofs").createSignedUrl(p.file_path, 600);
    if (error || !data) { toast.error("Could not open file"); return; }
    const name = p.file_name || "proof";
    setViewing({ url: data.signedUrl, name, pdf: (p.mime_type || name).toLowerCase().includes("pdf") });
  };

  const openProofForReview = async (p: ProofRow) => {
    setBusy(p.id);
    try {
      const { data, error } = await supabase.storage.from("fee-payment-proofs").createSignedUrl(p.file_path, 600);
      if (error || !data) {
        toast.error("Could not load proof preview");
        return;
      }
      setViewingUrl(data.signedUrl);
      setReviewingProof(p);
      setReviewAmount((p.amount || 0).toString());
      setReviewDate(p.paid_at ? p.paid_at.slice(0, 10) : new Date(p.created_at).toISOString().slice(0, 10));
      setReviewMethod(p.method || "Bank Transfer");
    } catch (e: any) {
      toast.error(e?.message || "Failed to load proof preview");
    } finally {
      setBusy(null);
    }
  };

  const handleApproveWithEdits = async () => {
    if (!reviewingProof) return;
    const p = reviewingProof;
    const finalAmount = Number(reviewAmount);
    if (isNaN(finalAmount) || finalAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    setBusy(p.id);
    try {
      const { error: updateError } = await supabase
        .from("fee_payment_proofs")
        .update({
          amount: finalAmount,
          paid_at: reviewDate || null,
          method: reviewMethod || null,
        })
        .eq("id", p.id);
      
      if (updateError) throw updateError;

      const { error: rpcError } = await (supabase as any).rpc("verify_fee_payment_proof", {
        _proof_id: p.id,
        _approve: true,
        _amount: finalAmount,
        _reason: null,
      });

      if (rpcError) throw rpcError;

      toast.success("Payment verified and invoice updated successfully");
      setReviewingProof(null);
      setViewingUrl(null);
      qc.invalidateQueries({ queryKey: ["fee_payment_proofs"] });
      qc.invalidateQueries({ queryKey: ["proof_invoices"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to approve with edits");
    } finally {
      setBusy(null);
    }
  };

  const handleBulkVerify = async () => {
    if (selectedProofs.length === 0) return;
    setBusy("bulk-verify");
    const tId = toast.loading(`Verifying ${selectedProofs.length} payment proof(s)...`);
    let successCount = 0;
    let failCount = 0;
    
    try {
      for (const proofId of selectedProofs) {
        const { error } = await (supabase as any).rpc("verify_fee_payment_proof", {
          _proof_id: proofId,
          _approve: true,
          _amount: null,
          _reason: null,
        });
        if (error) {
          console.error(`Bulk verify error for ID ${proofId}:`, error);
          failCount++;
        } else {
          successCount++;
        }
      }
      
      toast.success(`Successfully verified ${successCount} proof(s). ${failCount > 0 ? `Failed: ${failCount}` : ""}`, { id: tId });
      setSelectedProofs([]);
      qc.invalidateQueries({ queryKey: ["fee_payment_proofs"] });
      qc.invalidateQueries({ queryKey: ["proof_invoices"] });
    } catch (e: any) {
      toast.error(e?.message || "Bulk verification failed", { id: tId });
    } finally {
      setBusy(null);
    }
  };

  const handleBulkRejectSubmit = async () => {
    if (selectedProofs.length === 0) return;
    setBusy("bulk-reject");
    const tId = toast.loading(`Rejecting ${selectedProofs.length} payment proof(s)...`);
    let successCount = 0;
    let failCount = 0;
    
    const finalReason = bulkRejectReason === "Other" ? rejectReason : REJECTION_REASONS.find(r => r.value === bulkRejectReason)?.label || bulkRejectReason;

    try {
      for (const proofId of selectedProofs) {
        const { error } = await (supabase as any).rpc("verify_fee_payment_proof", {
          _proof_id: proofId,
          _approve: false,
          _amount: null,
          _reason: finalReason || null,
        });
        if (error) {
          console.error(`Bulk reject error for ID ${proofId}:`, error);
          failCount++;
        } else {
          successCount++;
        }
      }
      
      toast.success(`Successfully rejected ${successCount} proof(s). ${failCount > 0 ? `Failed: ${failCount}` : ""}`, { id: tId });
      setSelectedProofs([]);
      setBulkRejectOpen(false);
      qc.invalidateQueries({ queryKey: ["fee_payment_proofs"] });
      qc.invalidateQueries({ queryKey: ["proof_invoices"] });
    } catch (e: any) {
      toast.error(e?.message || "Bulk rejection failed", { id: tId });
    } finally {
      setBusy(null);
    }
  };

  const verify = async (p: ProofRow, approve: boolean, reason?: string) => {
    setBusy(p.id);
    try {
      const { error } = await (supabase as any).rpc("verify_fee_payment_proof", {
        _proof_id: p.id, _approve: approve, _amount: null, _reason: reason || null,
      });
      if (error) throw error;
      toast.success(approve ? "Payment verified & invoice updated" : "Proof rejected");
      qc.invalidateQueries({ queryKey: ["fee_payment_proofs"] });
      qc.invalidateQueries({ queryKey: ["proof_invoices"] });
    } catch (e: any) {
      toast.error(e?.message || "Action failed");
    } finally {
      setBusy(null);
      setRejectFor(null);
      setRejectReason("");
    }
  };

  // Statistics for payment proofs
  const pendingCount = proofs.filter(p => p.status === "pending").length;
  const verifiedAmount = proofs.filter(p => p.status === "verified").reduce((sum, p) => sum + Number(p.amount), 0);
  const rejectedCount = proofs.filter(p => p.status === "rejected").length;

  const isPdf = reviewingProof
    ? (reviewingProof.mime_type || reviewingProof.file_name || "").toLowerCase().includes("pdf")
    : false;

  return (
    <Card className="shadow-sm border rounded-2xl">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" /> Manual Payment Proofs
            </CardTitle>
            <p className="text-xs text-muted-foreground">Parents' uploaded bank/cash receipts awaiting verification.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">
              Showing <span className="font-medium text-foreground">{filteredProofs.length}</span> of {proofs.length}
            </div>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting || !schoolId} className="rounded-xl h-9 text-xs">
              {exporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileDown className="h-3 w-3 mr-1" />}
              Export CSV
            </Button>
          </div>
        </div>

        {/* Quick Stats Panel */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3.5 rounded-xl border bg-muted/20 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pending Reviews</p>
              <h4 className="text-lg font-bold text-amber-600 dark:text-amber-400">{pendingCount} Proofs</h4>
            </div>
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </div>

          <div className="p-3.5 rounded-xl border bg-muted/20 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Verified Value</p>
              <h4 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">PKR {verifiedAmount.toLocaleString()}</h4>
            </div>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>

          <div className="p-3.5 rounded-xl border bg-muted/20 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Rejected Receipts</p>
              <h4 className="text-lg font-bold text-rose-600 dark:text-rose-400">{rejectedCount} Claims</h4>
            </div>
            <div className="w-2 h-2 rounded-full bg-rose-500" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-2 flex-wrap">
          <div className="relative md:col-span-4">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search student, invoice #, method, note…"
              className="pl-8 pr-8"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="__all">All statuses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All methods</SelectItem>
              {methodOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="md:col-span-2" title="From date" />
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="md:col-span-2" title="To date" />
          <Input type="number" inputMode="decimal" placeholder="Min amount" value={minAmount} onChange={e => setMinAmount(e.target.value)} className="md:col-span-2" />
          <Input type="number" inputMode="decimal" placeholder="Max amount" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} className="md:col-span-2" />
          {hasActiveFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters} className="md:col-span-2">
              <X className="h-3 w-3 mr-1" /> Clear filters
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Bulk Action Banner */}
        {selectedProofs.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-950/35 border border-blue-100 dark:border-blue-900/50 p-4 rounded-xl flex items-center justify-between flex-wrap gap-3 mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2.5">
              <div className="bg-blue-600 text-white rounded-lg p-1.5 shadow-sm">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-900 dark:text-blue-200">
                  {selectedProofs.length} payment proof{selectedProofs.length > 1 ? "s" : ""} selected
                </p>
                <p className="text-xs text-blue-700/80 dark:text-blue-400/80">
                  Verify or reject all selected pending submissions at once.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleBulkVerify}
                disabled={!!busy}
                className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-semibold rounded-xl text-xs px-3 h-8"
              >
                {busy === "bulk-verify" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Verify Selected
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBulkRejectOpen(true)}
                disabled={!!busy}
                className="font-semibold rounded-xl text-xs px-3 h-8"
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject Selected
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedProofs([])}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs px-2.5 h-8"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {filteredProofs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {proofs.length === 0
              ? `No ${statusFilter !== "__all" ? statusFilter : ""} proofs yet.`
              : "No proofs match the current filters."}
          </div>
        ) : (

          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={
                    filteredProofs.length > 0 &&
                    filteredProofs.filter(p => p.status === "pending").length > 0 &&
                    filteredProofs.filter(p => p.status === "pending").every(p => selectedProofs.includes(p.id))
                  }
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const pendingIds = filteredProofs.filter(p => p.status === "pending").map(p => p.id);
                      setSelectedProofs(pendingIds);
                    } else {
                      setSelectedProofs([]);
                    }
                  }}
                  disabled={filteredProofs.filter(p => p.status === "pending").length === 0}
                />
              </TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filteredProofs.map(p => {
                const s = studentMap.get(p.student_id);
                const inv = invoiceMap.get(p.invoice_id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="w-[40px]">
                      {p.status === "pending" ? (
                        <Checkbox
                          checked={selectedProofs.includes(p.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedProofs(prev => [...prev, p.id]);
                            } else {
                              setSelectedProofs(prev => prev.filter(id => id !== p.id));
                            }
                          }}
                        />
                      ) : (
                        <div className="w-4" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{new Date(p.created_at).toLocaleString()}</TableCell>
                    <TableCell>{s ? `${s.first_name} ${s.last_name || ""}` : "—"}<div className="text-xs text-muted-foreground">{s?.roll_number || ""}</div></TableCell>
                    <TableCell className="font-mono text-xs">{inv?.invoice_number || "—"}</TableCell>
                    <TableCell className="text-xs">{p.method || "—"}{p.paid_at ? ` · ${p.paid_at}` : ""}{p.note ? <div className="text-muted-foreground truncate max-w-[180px]">{p.note}</div> : null}</TableCell>
                    <TableCell className="text-right font-medium text-slate-800 dark:text-slate-200">PKR {Number(p.amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "verified" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>
                        {p.status}
                      </Badge>
                      {p.rejection_reason && <div className="text-[10px] text-muted-foreground mt-1 max-w-[160px] truncate">{p.rejection_reason}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openProof(p)}><Eye className="h-3 w-3 mr-1" />View</Button>
                        {p.status === "pending" && (
                          <>
                            <Button size="sm" onClick={() => openProofForReview(p)} disabled={busy === p.id}>
                              {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                              Verify
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => setRejectFor(p)} disabled={busy === p.id}>
                              <XCircle className="h-3 w-3 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl rounded-2xl">
          <DialogHeader><DialogTitle>{viewing?.name}</DialogTitle></DialogHeader>
          {viewing && (viewing.pdf
            ? <iframe src={viewing.url} className="w-full h-[70vh] rounded border" />
            : <img src={viewing.url} alt="proof" className="w-full max-h-[70vh] object-contain rounded border" />
          )}
        </DialogContent>
      </Dialog>

      {/* Side-by-Side Proof Review Dialog */}
      <Dialog open={!!reviewingProof} onOpenChange={(o) => {
        if (!o) {
          setReviewingProof(null);
          setViewingUrl(null);
        }
      }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col rounded-3xl p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 border-b flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="font-display font-bold text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" /> Review Payment Proof
              </DialogTitle>
              <DialogDescription className="text-xs">
                Inspect the uploaded bank receipt side-by-side with invoice details and reconcile.
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-8 w-8 hover:bg-slate-100"
              onClick={() => {
                setReviewingProof(null);
                setViewingUrl(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden h-full">
            {/* Left Column: Preview */}
            <div className="p-6 border-r bg-slate-50/50 flex flex-col justify-center items-center overflow-hidden h-full">
              {viewingUrl ? (
                isPdf ? (
                  <iframe src={viewingUrl} className="w-full h-full rounded-xl border bg-white shadow-sm" />
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center overflow-auto p-2 bg-white rounded-xl border shadow-sm">
                    <img src={viewingUrl} alt="Receipt preview" className="max-w-full max-h-full object-contain" />
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-xs">Loading receipt preview...</p>
                </div>
              )}
            </div>

            {/* Right Column: Reconcile Form */}
            <div className="p-6 flex flex-col justify-between overflow-y-auto h-full space-y-6">
              <div className="space-y-6">
                {/* Profile / Student & Invoice details */}
                {reviewingProof && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Student Info</h4>
                      <div className="bg-slate-50 dark:bg-slate-900/40 p-3.5 rounded-xl border space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Student Name:</span>
                          <span className="font-semibold text-foreground">
                            {studentMap.get(reviewingProof.student_id)
                              ? `${studentMap.get(reviewingProof.student_id)?.first_name} ${studentMap.get(reviewingProof.student_id)?.last_name || ""}`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Roll Number:</span>
                          <span className="font-mono">{studentMap.get(reviewingProof.student_id)?.roll_number || "—"}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Invoice Info</h4>
                      <div className="bg-slate-50 dark:bg-slate-900/40 p-3.5 rounded-xl border space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Invoice Number:</span>
                          <span className="font-mono font-semibold text-primary">
                            {invoiceMap.get(reviewingProof.invoice_id)?.invoice_number || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Invoice Amount:</span>
                          <span className="font-semibold">
                            PKR {Number(invoiceMap.get(reviewingProof.invoice_id)?.total_amount || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Invoice Status:</span>
                          <div>{statusBadge(invoiceMap.get(reviewingProof.invoice_id)?.status || "")}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Edit Form */}
                <div className="space-y-4 pt-2 border-t">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Verification Details (Editable)</h4>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="review-amount" className="text-xs">Amount Paid (PKR)</Label>
                    <Input
                      id="review-amount"
                      type="number"
                      inputMode="decimal"
                      value={reviewAmount}
                      onChange={(e) => setReviewAmount(e.target.value)}
                      className="h-9 font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="review-date" className="text-xs">Payment Date</Label>
                      <Input
                        id="review-date"
                        type="date"
                        value={reviewDate}
                        onChange={(e) => setReviewDate(e.target.value)}
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="review-method" className="text-xs">Payment Method</Label>
                      <Select value={reviewMethod} onValueChange={setReviewMethod}>
                        <SelectTrigger id="review-method" className="h-9">
                          <SelectValue placeholder="Method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                          <SelectItem value="JazzCash">JazzCash</SelectItem>
                          <SelectItem value="Easypaisa">Easypaisa</SelectItem>
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Cheque">Cheque</SelectItem>
                          <SelectItem value="Card">Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center gap-2.5 pt-4 border-t">
                <Button
                  variant="hero"
                  onClick={handleApproveWithEdits}
                  disabled={!!busy}
                  className="flex-1 text-xs"
                >
                  {busy === reviewingProof?.id ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Approve & Reconcile
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (reviewingProof) {
                      setRejectFor(reviewingProof);
                      setReviewingProof(null);
                      setViewingUrl(null);
                    }
                  }}
                  disabled={!!busy}
                  className="flex-1 text-xs"
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Reject Proof
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Proof Dialog */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold flex items-center gap-2 text-rose-600">
              <XCircle className="h-5 w-5" /> Reject Payment Proof
            </DialogTitle>
            <DialogDescription className="text-xs">
              Select a rejection category and add additional feedback to the parent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 my-2">
            <div className="space-y-1.5">
              <Label htmlFor="reject-category" className="text-xs">Rejection Category</Label>
              <Select value={rejectionDropdownVal} onValueChange={(val) => {
                setRejectionDropdownVal(val);
                if (val !== "Other") {
                  setRejectReason(REJECTION_REASONS.find(r => r.value === val)?.label || val);
                } else {
                  setRejectReason("");
                }
              }}>
                <SelectTrigger id="reject-category">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="reject-details" className="text-xs">Custom Details (shared with parent)</Label>
              <Textarea
                id="reject-details"
                rows={3}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Specify details for rejection..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (rejectFor) {
                const finalReason = rejectionDropdownVal === "Other" ? rejectReason : REJECTION_REASONS.find(r => r.value === rejectionDropdownVal)?.label || rejectionDropdownVal;
                verify(rejectFor, false, finalReason);
              }
            }} disabled={!!busy}>Reject Proof</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Reject Dialog */}
      <Dialog open={bulkRejectOpen} onOpenChange={setBulkRejectOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold flex items-center gap-2 text-rose-600">
              <XCircle className="h-5 w-5" /> Reject Selected Proofs
            </DialogTitle>
            <DialogDescription className="text-xs">
              Reject {selectedProofs.length} selected claims. Choose a rejection category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 my-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-reject-category" className="text-xs">Rejection Category</Label>
              <Select value={bulkRejectReason} onValueChange={(val) => {
                setBulkRejectReason(val);
                if (val !== "Other") {
                  setRejectReason(REJECTION_REASONS.find(r => r.value === val)?.label || val);
                } else {
                  setRejectReason("");
                }
              }}>
                <SelectTrigger id="bulk-reject-category">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="bulk-reject-details" className="text-xs">Custom Details (shared with parents)</Label>
              <Textarea
                id="bulk-reject-details"
                rows={3}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Specify details for rejection..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkRejectSubmit} disabled={!!busy}>Reject All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

type Delivery = {
  id: string;
  invoice_id: string;
  student_id: string;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
  guardian_user_id: string | null;
  channel: string;
  status: string;
  error: string | null;
  delivered_at: string;
};

type BatchInvoice = {
  id: string;
  invoice_number: string;
  period_label: string | null;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  status: string;
};

function DeliveriesDialog({ batch, onClose }: { batch: Batch | null; onClose: () => void }) {
  const open = !!batch;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<BatchInvoice | null>(null);
  const [editDue, setEditDue] = useState("");
  const [editPeriod, setEditPeriod] = useState("");
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editStatus, setEditStatus] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ["fee_voucher_deliveries", batch?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fee_voucher_deliveries")
        .select("id,invoice_id,student_id,guardian_name,guardian_email,guardian_phone,guardian_user_id,channel,status,error,delivered_at")
        .eq("batch_id", batch!.id)
        .order("delivered_at", { ascending: true });
      if (error) throw error;
      return data as Delivery[];
    },
    enabled: open,
  });

  const invoiceIds = useMemo(
    () => Array.from(new Set(deliveries.map((d) => d.invoice_id).filter(Boolean))),
    [deliveries],
  );

  const { data: invoices = [] } = useQuery({
    queryKey: ["voucher_invoices", batch?.id, invoiceIds.length],
    queryFn: async () => {
      if (invoiceIds.length === 0) return [] as BatchInvoice[];
      const { data, error } = await supabase
        .from("fee_invoices")
        .select("id, invoice_number, period_label, due_date, total_amount, paid_amount, status")
        .in("id", invoiceIds);
      if (error) throw error;
      return (data || []) as BatchInvoice[];
    },
    enabled: open && invoiceIds.length > 0,
  });
  const invoiceMap = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);

  const sent = deliveries.filter((d) => d.status === "sent").length;
  const noAcct = deliveries.filter((d) => d.status === "no_account").length;
  const failed = deliveries.filter((d) => !["sent", "no_account"].includes(d.status)).length;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["voucher_invoices", batch?.id] });
    qc.invalidateQueries({ queryKey: ["fee_invoices"] });
    qc.invalidateQueries({ queryKey: ["fee_voucher_batches"] });
  };

  const openEdit = (inv: BatchInvoice) => {
    setEditing(inv);
    setEditDue(inv.due_date);
    setEditPeriod(inv.period_label ?? "");
    setEditAmount(Number(inv.total_amount));
    setEditStatus(inv.status);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusyId(editing.id);
    const { error } = await supabase
      .from("fee_invoices")
      .update({ 
        due_date: editDue, 
        period_label: editPeriod || null,
        total_amount: editAmount,
        status: editStatus
      })
      .eq("id", editing.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Voucher updated successfully");
    setEditing(null);
    refresh();
  };

  const setStatus = async (inv: BatchInvoice, status: "cancelled" | "pending") => {
    if (Number(inv.paid_amount) > 0 && status === "cancelled") {
      toast.error("Cannot void a voucher with payments. Refund/remove payments first.");
      return;
    }
    setBusyId(inv.id);
    const { error } = await supabase.from("fee_invoices").update({ status }).eq("id", inv.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(status === "cancelled" ? "Voucher voided" : "Voucher restored");
    refresh();
  };

  const removeInvoice = async (inv: BatchInvoice) => {
    if (Number(inv.paid_amount) > 0) {
      toast.error("Cannot delete a voucher with payments.");
      return;
    }
    if (!confirm(`Delete voucher ${inv.invoice_number}? This cannot be undone.`)) return;
    setBusyId(inv.id);
    const { error } = await supabase.from("fee_invoices").delete().eq("id", inv.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Voucher deleted");
    refresh();
  };

  const statusBadge = (s: string) => {
    if (s === "paid") return <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border border-emerald-600/30">Paid</Badge>;
    if (s === "partial") return <Badge className="bg-amber-600/15 text-amber-700 dark:text-amber-400 border border-amber-600/30">Partial</Badge>;
    if (s === "overdue") return <Badge variant="destructive">Overdue</Badge>;
    if (s === "cancelled") return <Badge variant="outline" className="text-muted-foreground line-through">Cancelled</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
  };

  const totalDelivs = deliveries.length || 1;
  const sentPct = Math.round((sent / totalDelivs) * 100);
  const noAcctPct = Math.round((noAcct / totalDelivs) * 100);
  const failedPct = Math.round((failed / totalDelivs) * 100);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col rounded-3xl">
        <DialogHeader className="space-y-3">
          <div>
            <DialogTitle className="font-display font-bold text-lg">Batch Vouchers & Delivery Funnel</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitor dispatch channels and recipient accounts for this batch.
            </p>
          </div>
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between items-center text-[10px] font-semibold text-muted-foreground uppercase">
              <span className="text-emerald-600">{sent} Delivered ({sentPct}%)</span>
              <span className="text-amber-600">{noAcct} No Parent Account ({noAcctPct}%)</span>
              <span className="text-rose-600">{failed} Failed ({failedPct}%)</span>
            </div>
            <div className="h-2 w-full flex rounded-full overflow-hidden bg-muted">
              <div style={{ width: `${sentPct}%` }} className="h-full bg-emerald-500 transition-all" />
              <div style={{ width: `${noAcctPct}%` }} className="h-full bg-amber-500 transition-all" />
              <div style={{ width: `${failedPct}%` }} className="h-full bg-rose-500 transition-all" />
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-3">
          {isLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : deliveries.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No vouchers in this batch.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d) => {
                  const inv = invoiceMap.get(d.invoice_id);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">
                        {inv?.invoice_number ?? "—"}
                        {inv?.period_label && (
                          <div className="text-[10px] text-muted-foreground">{inv.period_label}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{d.guardian_name ?? "—"}</div>
                        <div className="text-muted-foreground">
                          {d.guardian_email ?? ""}{d.guardian_phone ? ` · ${d.guardian_phone}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{inv?.due_date ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {inv ? Number(inv.total_amount).toLocaleString() : "—"}
                        {inv && Number(inv.paid_amount) > 0 && (
                          <div className="text-[10px] text-emerald-600">paid {Number(inv.paid_amount).toLocaleString()}</div>
                        )}
                      </TableCell>
                      <TableCell>{inv ? statusBadge(inv.status) : "—"}</TableCell>
                      <TableCell>
                        {d.status === "sent" ? (
                          <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border border-emerald-600/30">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Sent
                          </Badge>
                        ) : d.status === "no_account" ? (
                          <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-500/40">
                            <AlertCircle className="mr-1 h-3 w-3" /> No account
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="mr-1 h-3 w-3" /> {d.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {inv ? (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button size="sm" variant="outline" disabled={busyId === inv.id} onClick={() => openEdit(inv)}>
                              Edit
                            </Button>
                            {inv.status !== "cancelled" ? (
                              <Button size="sm" variant="outline" disabled={busyId === inv.id} onClick={() => setStatus(inv, "cancelled")}>
                                Void
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" disabled={busyId === inv.id} onClick={() => setStatus(inv, "pending")}>
                                Restore
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="text-destructive" disabled={busyId === inv.id} onClick={() => removeInvoice(inv)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>

        {/* Edit voucher dialog */}
        <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Voucher {editing?.invoice_number}</DialogTitle>
              <DialogDescription>Update the billed amount, payment status, due date, or billing period.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Total Amount (PKR)</Label>
                <Input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(Number(e.target.value))}
                  className="bg-background text-foreground h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Period Label</Label>
                  <Input value={editPeriod} onChange={(e) => setEditPeriod(e.target.value)} placeholder="e.g. November 2026" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="bg-background text-foreground h-9 text-xs">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground">
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={!editDue || busyId === editing?.id}>
                {busyId === editing?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}


function GenerateVoucherDialog({
  open,
  onOpenChange,
  schoolId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schoolId: string | null;
}) {
  const [mode, setMode] = useState<"individual" | "class">("individual");
  const [feePlanId, setFeePlanId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>(SENTINEL);
  const [studentId, setStudentId] = useState<string>("");
  const [periodLabel, setPeriodLabel] = useState<string>(`Voucher ${new Date().toLocaleString("default", { month: "long", year: "numeric" })}`);
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
  });
  const [discountPct, setDiscountPct] = useState<string>("0");
  const [discountAmount, setDiscountAmount] = useState<string>("0");
  const [discountReason, setDiscountReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [tiers, setTiers] = useState<GradeTier[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [doneCount, setDoneCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [results, setResults] = useState<Array<{ studentId: string; name: string; status: "success" | "error"; error?: string; invoiceId?: string }>>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<VoucherCopyData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewSeqRef = useRef(0);


  // Data queries
  const { data: feePlans = [] } = useQuery({
    queryKey: ["fp_for_vouchers", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_plans")
        .select("id,name,currency,class_id")
        .eq("school_id", schoolId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as FeePlan[];
    },
    enabled: !!schoolId && open,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes_for_vouchers", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_classes")
        .select("id,name,grade_level")
        .eq("school_id", schoolId!)
        .order("grade_level", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as Klass[];
    },
    enabled: !!schoolId && open,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["sections_for_vouchers", schoolId, classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_sections")
        .select("id,class_id,name")
        .eq("school_id", schoolId!)
        .eq("class_id", classId)
        .order("name");
      if (error) throw error;
      return data as Section[];
    },
    enabled: !!schoolId && open && !!classId,
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students_for_vouchers", schoolId, classId, sectionId],
    queryFn: async () => {
      let sectionIds: string[] = [];
      if (sectionId !== SENTINEL) sectionIds = [sectionId];
      else sectionIds = sections.map((s) => s.id);
      if (sectionIds.length === 0) return [] as Student[];

      const { data: enrolls, error: e1 } = await supabase
        .from("student_enrollments")
        .select("student_id")
        .eq("school_id", schoolId!)
        .in("class_section_id", sectionIds)
        .is("end_date", null);
      if (e1) throw e1;
      const ids = Array.from(new Set((enrolls ?? []).map((r: any) => r.student_id)));
      if (ids.length === 0) return [] as Student[];

      const { data, error } = await supabase
        .from("students")
        .select("id,first_name,last_name,roll_number,student_code,parent_name,parent_phone")
        .in("id", ids)
        .order("first_name");
      if (error) throw error;
      return data as Student[];
    },
    enabled: !!schoolId && open && !!classId && (sectionId === SENTINEL ? sections.length > 0 : true),
  });

  const planItems = useQuery({
    queryKey: ["plan_items_for_vouchers", feePlanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_plan_items")
        .select("id,fee_plan_id,label,amount,sort_order")
        .eq("fee_plan_id", feePlanId)
        .order("sort_order");
      if (error) throw error;
      return data as FeePlanItem[];
    },
    enabled: !!feePlanId,
  });

  const subtotal = useMemo(
    () => (planItems.data ?? []).reduce((s, i) => s + Number(i.amount || 0), 0),
    [planItems.data],
  );

  const targetStudents = useMemo<Student[]>(() => {
    if (mode === "individual") {
      return students.filter((s) => s.id === studentId);
    }
    return students;
  }, [mode, students, studentId]);

  function addTier() {
    setTiers((t) => [...t, { id: crypto.randomUUID(), minGrade: 80, discountPct: 10 }]);
  }
  function removeTier(id: string) {
    setTiers((t) => t.filter((x) => x.id !== id));
  }

  async function fetchSchoolMeta() {
    const { data: school } = await supabase
      .from("schools")
      .select("id,name,address,phone,email,website,motto,logo_url")
      .eq("id", schoolId!)
      .maybeSingle();
    const { data: branding } = await (supabase as any)
      .from("school_branding")
      .select("accent_hue,accent_saturation,accent_lightness")
      .eq("school_id", schoolId!)
      .maybeSingle();
    const { data: settings } = await (supabase as any)
      .from("fee_settings")
      .select("bank_name,bank_account_title,bank_account_number,bank_iban,bank_branch,bank_swift,voucher_footer_note")
      .eq("school_id", schoolId!)
      .maybeSingle();
    return {
      school,
      branding: branding
        ? {
            h: Number(branding.accent_hue ?? 210),
            s: Number(branding.accent_saturation ?? 100),
            l: Number(branding.accent_lightness ?? 50),
          }
        : { h: 210, s: 100, l: 50 },
      bank: settings
        ? {
            bankName: settings.bank_name,
            accountTitle: settings.bank_account_title,
            accountNumber: settings.bank_account_number,
            iban: settings.bank_iban,
            branch: settings.bank_branch,
            swift: settings.bank_swift,
          }
        : null,
      footerNote: settings?.voucher_footer_note ?? null,
    };
  }

  async function getStudentAvgGrade(studentIds: string[]): Promise<Record<string, number>> {
    if (studentIds.length === 0) return {};
    const since = new Date();
    since.setDate(since.getDate() - 120);
    const { data: assess } = await supabase
      .from("academic_assessments")
      .select("id,max_marks")
      .eq("school_id", schoolId!)
      .gte("created_at", since.toISOString());
    const maxById = new Map<string, number>((assess ?? []).map((a: any) => [a.id, Number(a.max_marks || 100)]));
    const ids = (assess ?? []).map((a: any) => a.id);
    if (ids.length === 0) return {};
    const { data: marks } = await supabase
      .from("student_marks")
      .select("student_id,assessment_id,marks")
      .in("student_id", studentIds)
      .in("assessment_id", ids);
    const totals = new Map<string, { sum: number; count: number }>();
    (marks ?? []).forEach((m: any) => {
      const max = maxById.get(m.assessment_id) || 100;
      if (max <= 0 || m.marks == null) return;
      const pct = (Number(m.marks) / max) * 100;
      const t = totals.get(m.student_id) ?? { sum: 0, count: 0 };
      t.sum += pct;
      t.count += 1;
      totals.set(m.student_id, t);
    });
    const out: Record<string, number> = {};
    totals.forEach((v, k) => {
      out[k] = v.count > 0 ? v.sum / v.count : 0;
    });
    return out;
  }

  function pickGradeTierPct(avg: number): { pct: number; tier: GradeTier | null } {
    const sorted = [...tiers].sort((a, b) => b.minGrade - a.minGrade);
    for (const t of sorted) {
      if (avg >= t.minGrade) return { pct: t.discountPct, tier: t };
    }
    return { pct: 0, tier: null };
  }

  // Build voucher PDF data for a single student WITHOUT persisting (used for preview)
  function buildPreviewData(args: {
    student: Student;
    meta: Awaited<ReturnType<typeof fetchSchoolMeta>>;
    items: FeePlanItem[];
    plan: FeePlan | undefined;
    avgGrade: number;
  }): VoucherCopyData {
    const { student: st, meta, items, plan, avgGrade } = args;
    const subtotalCalc = items.reduce((s, i) => s + Number(i.amount || 0), 0);
    const baseExtraPct = Number(discountPct) || 0;
    const baseExtraAmt = Number(discountAmount) || 0;
    const { pct: gradePct, tier } = pickGradeTierPct(avgGrade);
    const totalExtraPct = baseExtraPct + gradePct;
    const merit = baseExtraAmt + Math.round(subtotalCalc * totalExtraPct) / 100;
    const reasonParts: string[] = [];
    if (discountReason) reasonParts.push(discountReason);
    if (tier) reasonParts.push(`Merit ≥${tier.minGrade}% → ${tier.discountPct}%`);
    const total = Math.max(subtotalCalc - merit, 0);
    const sec = sections.find((s) => s.id === sectionId);
    const klass = classes.find((c) => c.id === classId);
    return {
      invoiceNumber: "PREVIEW",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate,
      periodLabel,
      school: {
        name: meta.school?.name ?? "School",
        address: meta.school?.address ?? null,
        phone: meta.school?.phone ?? null,
        email: meta.school?.email ?? null,
        website: meta.school?.website ?? null,
        logoUrl: meta.school?.logo_url ?? null,
        motto: meta.school?.motto ?? null,
      },
      student: {
        name: `${st.first_name} ${st.last_name ?? ""}`.trim(),
        rollNumber: st.roll_number,
        studentCode: st.student_code,
        className: klass?.name ?? null,
        sectionName: sec?.name ?? null,
        parentName: st.parent_name,
        parentPhone: st.parent_phone,
      },
      items: items.map((it) => ({ label: it.label, amount: Number(it.amount) })),
      subtotal: subtotalCalc,
      baseDiscount: 0,
      meritDiscount: merit,
      meritReason: reasonParts.join(" | ") || null,
      siblingDiscount: 0,
      total,
      currency: plan?.currency || "PKR",
      accentHsl: meta.branding,
      notes: notes || null,
      bank: meta.bank,
      footerNote: meta.footerNote,
    };
  }

  // Live PDF preview – debounced
  useEffect(() => {
    if (!open || !schoolId || !feePlanId) {
      setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
      setPreviewData(null);
      return;
    }
    const previewStudent =
      mode === "individual"
        ? students.find((s) => s.id === studentId)
        : targetStudents[0];
    if (!previewStudent) {
      setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
      setPreviewData(null);
      return;
    }
    const seq = ++previewSeqRef.current;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const meta = await fetchSchoolMeta();
        const items = planItems.data ?? [];
        const plan = feePlans.find((p) => p.id === feePlanId);
        const avgMap = tiers.length > 0 ? await getStudentAvgGrade([previewStudent.id]) : {};
        const data = buildPreviewData({
          student: previewStudent,
          meta,
          items,
          plan,
          avgGrade: avgMap[previewStudent.id] ?? 0,
        });
        const doc = generateVoucherPdf(data);
        const blob = doc.output("blob");
        const url = URL.createObjectURL(blob);
        if (seq !== previewSeqRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setPreviewData(data);
      } catch (e) {
        console.error("preview failed", e);
        toast.error("Voucher preview could not be generated");
        setPreviewData(null);
      } finally {
        if (seq === previewSeqRef.current) setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open, schoolId, feePlanId, mode, studentId,
    JSON.stringify(targetStudents.map((s) => s.id)),
    JSON.stringify(planItems.data ?? []),
    JSON.stringify(tiers), discountPct, discountAmount, discountReason,
    periodLabel, dueDate, notes, classId, sectionId,
  ]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function handleGenerate() {
    if (!schoolId || !feePlanId) {
      toast.error("Pick a fee plan first");
      return;
    }
    if (mode === "individual" && !studentId) {
      toast.error("Pick a student");
      return;
    }
    if (mode === "class" && targetStudents.length === 0) {
      toast.error("No students in selected class/section");
      return;
    }

    setSubmitting(true);
    setResults([]);
    setDoneCount(0);
    setFailCount(0);
    setProgress("Loading school branding…");
    try {
      const meta = await fetchSchoolMeta();
      const plan = feePlans.find((p) => p.id === feePlanId);
      const items = planItems.data ?? [];
      const gradeMap = tiers.length > 0 ? await getStudentAvgGrade(targetStudents.map((s) => s.id)) : {};

      const { data: batch, error: batchErr } = await (supabase as any)
        .from("fee_voucher_batches")
        .insert({
          school_id: schoolId,
          scope: mode === "individual" ? "individual" : sectionId === SENTINEL ? "class" : "section",
          class_id: classId || null,
          class_section_id: sectionId !== SENTINEL ? sectionId : null,
          fee_plan_id: feePlanId,
          period_label: periodLabel,
          due_date: dueDate,
          default_discount_pct: Number(discountPct) || 0,
          grade_discount_tiers: tiers.map((t) => ({ min_grade: t.minGrade, discount_pct: t.discountPct })),
          notes,
          total_students: 0,
          total_amount: 0,
        })
        .select()
        .single();
      if (batchErr) throw batchErr;

      let totalAmount = 0;
      let successCount = 0;
      const pdfs: { student: Student; data: VoucherCopyData }[] = [];

      for (let i = 0; i < targetStudents.length; i++) {
        const st = targetStudents[i];
        const studentName = `${st.first_name} ${st.last_name ?? ""}`.trim();
        setProgress(`Generating ${i + 1} / ${targetStudents.length} – ${studentName}…`);

        const baseExtraPct = Number(discountPct) || 0;
        const baseExtraAmt = Number(discountAmount) || 0;
        const avg = gradeMap[st.id] ?? 0;
        const { pct: gradePct, tier } = pickGradeTierPct(avg);
        const totalExtraPct = baseExtraPct + gradePct;
        const reasonParts: string[] = [];
        if (discountReason) reasonParts.push(discountReason);
        if (tier) reasonParts.push(`Merit ≥${tier.minGrade}% → ${tier.discountPct}%`);
        const reason = reasonParts.join(" | ") || null;

        try {
          const { data: invId, error: rpcErr } = await (supabase as any).rpc("generate_fee_voucher", {
            _school_id: schoolId,
            _student_id: st.id,
            _fee_plan_id: feePlanId,
            _period_label: periodLabel,
            _due_date: dueDate,
            _extra_discount_pct: totalExtraPct,
            _extra_discount_amount: baseExtraAmt,
            _extra_discount_reason: reason,
            _notes: notes || null,
            _batch_id: batch.id,
          });
          if (rpcErr) throw rpcErr;

          const { data: inv, error: invErr } = await supabase
            .from("fee_invoices")
            .select("*")
            .eq("id", invId as string)
            .maybeSingle();
          if (invErr) throw invErr;
          if (!inv) throw new Error("Invoice not found after creation");

          const sec = sections.find((s) => s.id === sectionId) || sections[0];
          const klass = classes.find((c) => c.id === classId);

          const pdfData: VoucherCopyData = {
            invoiceNumber: (inv as any).invoice_number,
            issueDate: new Date().toISOString().slice(0, 10),
            dueDate,
            periodLabel,
            school: {
              name: meta.school?.name ?? "School",
              address: meta.school?.address ?? null,
              phone: meta.school?.phone ?? null,
              email: meta.school?.email ?? null,
              website: meta.school?.website ?? null,
              logoUrl: meta.school?.logo_url ?? null,
              motto: meta.school?.motto ?? null,
            },
            student: {
              name: studentName,
              rollNumber: st.roll_number,
              studentCode: st.student_code,
              className: klass?.name ?? null,
              sectionName: sec?.name ?? null,
              parentName: st.parent_name,
              parentPhone: st.parent_phone,
            },
            items: items.map((it) => ({ label: it.label, amount: Number(it.amount) })),
            subtotal: Number((inv as any).subtotal),
            baseDiscount: Number((inv as any).discount_amount),
            meritDiscount: Number((inv as any).merit_discount_amount ?? 0),
            meritReason: (inv as any).merit_discount_reason ?? reason,
            siblingDiscount: Number((inv as any).sibling_discount_amount ?? 0),
            total: Number((inv as any).total_amount),
            currency: plan?.currency || "PKR",
            accentHsl: meta.branding,
            notes: notes || null,
            bank: meta.bank,
            footerNote: meta.footerNote,
          };

          pdfs.push({ student: st, data: pdfData });
          totalAmount += Number((inv as any).total_amount);
          successCount += 1;
          setDoneCount((c) => c + 1);
          setResults((r) => [...r, { studentId: st.id, name: studentName, status: "success", invoiceId: invId as string }]);
        } catch (err: any) {
          console.error("voucher failed for", st.id, err);
          setFailCount((c) => c + 1);
          setResults((r) => [...r, { studentId: st.id, name: studentName, status: "error", error: err?.message ?? String(err) }]);
        }
      }

      await (supabase as any)
        .from("fee_voucher_batches")
        .update({ total_students: successCount, total_amount: totalAmount })
        .eq("id", batch.id);

      setProgress("Building PDF file…");
      if (pdfs.length === 1) {
        const doc = generateVoucherPdf(pdfs[0].data);
        doc.save(`voucher-${pdfs[0].data.invoiceNumber}.pdf`);
      } else if (pdfs.length > 1) {
        const { appendVoucherPage } = await import("@/lib/fee-voucher-pdf");
        const combined = generateVoucherPdf(pdfs[0].data);
        for (let i = 1; i < pdfs.length; i++) {
          appendVoucherPage(combined, pdfs[i].data);
        }
        combined.save(`vouchers-batch-${batch.id}.pdf`);
      }

      if (successCount > 0) {
        toast.success(`Generated ${successCount} voucher(s); parents notified.`);
      }
      if (failCount > 0 || successCount === 0) {
        // keep dialog open so the user can review errors
        setProgress(`Finished with ${successCount} success / ${targetStudents.length - successCount} failed`);
      } else {
        onOpenChange(false);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "Failed to generate vouchers");
    } finally {
      setSubmitting(false);
    }
  }


  const progressPct = targetStudents.length > 0
    ? Math.round(((doneCount + failCount) / targetStudents.length) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Generate Fee Voucher</DialogTitle>
          <DialogDescription>
            Create professional vouchers for one student or an entire class. Parents are notified automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 flex-1 overflow-hidden">
          {/* Left – form */}
          <ScrollArea className="pr-3">
            <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="mt-2">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="individual">
                  <User className="mr-2 h-4 w-4" /> Individual Student
                </TabsTrigger>
                <TabsTrigger value="class">
                  <Users className="mr-2 h-4 w-4" /> Whole Class / Section
                </TabsTrigger>
              </TabsList>

              <div className="grid gap-3 mt-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Fee plan</Label>
                  <Select value={feePlanId} onValueChange={setFeePlanId}>
                    <SelectTrigger><SelectValue placeholder="Select fee plan" /></SelectTrigger>
                    <SelectContent>
                      {feePlans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {feePlanId && (
                    <p className="text-xs text-muted-foreground">
                      Subtotal per student: {subtotal.toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Period label</Label>
                  <Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} />
                </div>

                <div className="space-y-1">
                  <Label>Class</Label>
                  <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId(SENTINEL); setStudentId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Section</Label>
                  <Select value={sectionId} onValueChange={(v) => { setSectionId(v); setStudentId(""); }}>
                    <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SENTINEL}>All sections</SelectItem>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {mode === "individual" && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Student</Label>
                    <Select value={studentId} onValueChange={setStudentId}>
                      <SelectTrigger><SelectValue placeholder="Pick a student" /></SelectTrigger>
                      <SelectContent>
                        {students.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.first_name} {s.last_name ?? ""} {s.roll_number ? `(${s.roll_number})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label>Due date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>

                <div className="space-y-1">
                  <Label>Discount %</Label>
                  <Input type="number" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
                </div>

                <div className="space-y-1">
                  <Label>Discount (fixed amount)</Label>
                  <Input type="number" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
                </div>

                <div className="space-y-1">
                  <Label>Discount reason</Label>
                  <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="e.g. Term promotion" />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>

              <TabsContent value="class" className="mt-4 space-y-4">
                <Card className="rounded-2xl border shadow-sm overflow-hidden">
                  <CardHeader className="pb-3 bg-muted/10 border-b">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-bold">Grade-based merit discount</CardTitle>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Students whose average grade meets a tier get extra % discount. Highest matching tier applies.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4">
                    {tiers.map((t, index) => (
                      <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-muted/50 transition-all hover:bg-muted/50">
                        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground min-w-[70px]">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span>Tier {index + 1}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-1">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">If avg ≥</span>
                          <Input type="number" className="w-16 h-8 text-xs rounded-lg px-2 bg-background border-muted-foreground/20" value={t.minGrade}
                            onChange={(e) => setTiers((arr) => arr.map((x) => x.id === t.id ? { ...x, minGrade: Number(e.target.value) } : x))}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-1">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">Discount</span>
                          <Input type="number" className="w-16 h-8 text-xs rounded-lg px-2 bg-background border-muted-foreground/20" value={t.discountPct}
                            onChange={(e) => setTiers((arr) => arr.map((x) => x.id === t.id ? { ...x, discountPct: Number(e.target.value) } : x))}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg" onClick={() => removeTier(t.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    
                    {tiers.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2.5">No merit discount tiers defined.</p>
                    )}

                    <Button variant="outline" size="sm" onClick={addTier} className="rounded-lg h-8 text-xs border-primary/20 text-primary hover:bg-primary/5">
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Tier
                    </Button>
                  </CardContent>
                </Card>

                <div className="text-sm text-muted-foreground">
                  {students.length} student(s) will receive a voucher.
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>

          {/* Right – preview + progress */}
          <div className="flex flex-col border rounded-md bg-muted/30 overflow-hidden min-h-[400px]">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-background/50">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Eye className="h-3.5 w-3.5" /> Live preview
                {previewLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {mode === "class" && targetStudents.length > 1
                  ? `Showing ${targetStudents[0]?.first_name ?? "first student"} — others use same layout`
                  : "Sample render"}
              </span>
            </div>

            {/* Progress / results section */}
            {(submitting || results.length > 0) && (
              <div className="border-b p-3 space-y-2 bg-background/40 max-h-[40%] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    {submitting ? "Generating…" : "Last run results"}
                  </span>
                  <span className="text-muted-foreground">
                    {doneCount + failCount}/{targetStudents.length} · {doneCount} ok · {failCount} failed
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                {progress && (
                  <div className="text-[10px] text-muted-foreground truncate">{progress}</div>
                )}
                {results.length > 0 && (
                  <ScrollArea className="flex-1 max-h-[160px] pr-2">
                    <div className="space-y-1">
                      {results.map((r, idx) => (
                        <div
                          key={`${r.studentId}-${idx}`}
                          className={`flex items-start gap-2 text-[11px] rounded px-2 py-1 ${
                            r.status === "success" ? "bg-emerald-500/10" : "bg-destructive/10"
                          }`}
                        >
                          {r.status === "success"
                            ? <CheckCircle2 className="h-3 w-3 mt-0.5 text-emerald-600 shrink-0" />
                            : <XCircle className="h-3 w-3 mt-0.5 text-destructive shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{r.name}</div>
                            {r.error && <div className="text-destructive break-words">{r.error}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}

            <div className="flex-1 bg-background overflow-hidden flex flex-col">
              {previewData ? (
                <>
                  <div className="flex items-center justify-between gap-2 border-b px-3 py-2 bg-muted/30">
                    <span className="text-xs text-muted-foreground truncate">
                      Live in-app preview · PDF embedding removed to avoid Chrome blocking
                    </span>
                    <div className="flex items-center gap-1">
                      {previewUrl && <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = previewUrl;
                          a.download = "voucher-preview.pdf";
                          a.click();
                        }}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" /> Download
                      </Button>}
                    </div>
                  </div>
                  <ScrollArea className="flex-1 min-h-[280px]">
                    <VoucherHtmlPreview data={previewData} />
                  </ScrollArea>
                </>
              ) : (
                <div className="h-full min-h-[300px] flex items-center justify-center text-xs text-muted-foreground p-6 text-center">
                  {feePlanId
                    ? "Pick a class & student (or section) to see the live voucher preview."
                    : "Pick a fee plan to see a live voucher preview."}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          {submitting && progress && (
            <span className="text-xs text-muted-foreground self-center mr-auto">{progress}</span>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {results.length > 0 && !submitting ? "Close" : "Cancel"}
          </Button>
          <Button variant="hero" onClick={handleGenerate} disabled={submitting || !feePlanId}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Generate {mode === "individual" ? "Voucher" : `${students.length} Vouchers`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  );
}

function VoucherHtmlPreview({ data }: { data: VoucherCopyData }) {
  const accent = data.accentHsl ?? { h: 210, s: 100, l: 50 };
  const currency = data.currency || "PKR";
  const money = (n: number) => `${currency} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const studentMeta = [
    data.student.className ? `Class ${data.student.className}${data.student.sectionName ? `-${data.student.sectionName}` : ""}` : null,
    data.student.rollNumber ? `Roll ${data.student.rollNumber}` : null,
    data.student.studentCode ? `ID ${data.student.studentCode}` : null,
  ].filter(Boolean).join(" · ");
  const bankLines = [
    data.bank?.bankName ? ["Bank", `${data.bank.bankName}${data.bank.branch ? ` — ${data.bank.branch}` : ""}`] : null,
    data.bank?.accountTitle ? ["Title", data.bank.accountTitle] : null,
    data.bank?.accountNumber ? ["A/C #", data.bank.accountNumber] : null,
    data.bank?.iban ? ["IBAN", data.bank.iban] : null,
  ].filter(Boolean) as string[][];

  const Copy = ({ label }: { label: string }) => (
    <div className="min-h-[600px] rounded-md border bg-card shadow-sm overflow-hidden flex flex-col">
      <div
        className="p-4 text-primary-foreground"
        style={{ background: `linear-gradient(135deg, hsl(${accent.h} ${accent.s}% ${Math.max(accent.l - 14, 12)}%), hsl(${accent.h} ${accent.s}% ${accent.l}%))` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold truncate">{data.school.name}</h3>
            {data.school.motto && <p className="text-[11px] opacity-90 truncate">{data.school.motto}</p>}
            <p className="mt-1 text-[10px] opacity-90 line-clamp-2">
              {[data.school.address, data.school.phone, data.school.email, data.school.website].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px]">{label}</Badge>
        </div>
        <div className="mt-3 text-[11px] font-semibold tracking-normal">OFFICIAL FEE VOUCHER</div>
      </div>

      <div className="p-4 space-y-3 flex-1">
        <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-2 text-xs">
          <div className="min-w-0"><p className="text-[10px] text-muted-foreground">Voucher #</p><p className="font-semibold truncate">{data.invoiceNumber}</p></div>
          <div className="min-w-0"><p className="text-[10px] text-muted-foreground">Issue</p><p className="font-semibold truncate">{data.issueDate}</p></div>
          <div className="min-w-0"><p className="text-[10px] text-muted-foreground">Due</p><p className="font-semibold truncate">{data.dueDate}</p></div>
        </div>

        <div className="rounded-md border p-3 text-xs">
          <p className="text-[10px] font-semibold text-muted-foreground">STUDENT</p>
          <p className="text-sm font-semibold truncate" title={data.student.name}>{data.student.name}</p>
          {studentMeta && <p className="text-[11px] text-muted-foreground truncate" title={studentMeta}>{studentMeta}</p>}
          <div className="mt-2 grid grid-cols-[64px_1fr] gap-y-1 text-[11px]">
            <span className="text-muted-foreground">Parent</span><span className="truncate">{data.student.parentName ?? "—"}{data.student.parentPhone ? ` · ${data.student.parentPhone}` : ""}</span>
            <span className="text-muted-foreground">Period</span><span className="truncate">{data.periodLabel ?? "—"}</span>
          </div>
        </div>

        <div className="rounded-md border overflow-hidden text-xs">
          <div className="grid grid-cols-[1fr_96px] bg-primary text-primary-foreground px-3 py-2 font-semibold">
            <span>Description</span><span className="text-right">Amount</span>
          </div>
          {data.items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="grid grid-cols-[1fr_96px] px-3 py-2 border-t">
              <span className="truncate" title={item.label}>{item.label}</span><span className="text-right font-medium">{money(item.amount)}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{money(data.subtotal)}</span></div>
          {data.baseDiscount > 0 && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Base discount</span><span className="font-medium">-{money(data.baseDiscount)}</span></div>}
          {data.meritDiscount > 0 && <div className="flex justify-between gap-3"><span className="text-muted-foreground truncate">Merit discount{data.meritReason ? ` (${data.meritReason})` : ""}</span><span className="font-medium shrink-0">-{money(data.meritDiscount)}</span></div>}
          {data.siblingDiscount > 0 && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Sibling discount</span><span className="font-medium">-{money(data.siblingDiscount)}</span></div>}
          <div className="mt-2 flex justify-between gap-3 rounded-md bg-primary px-3 py-2 text-primary-foreground font-semibold">
            <span>Total payable</span><span>{money(data.total)}</span>
          </div>
        </div>

        {bankLines.length > 0 && (
          <div className="rounded-md bg-muted p-3 text-[11px]">
            <p className="mb-1 font-semibold">Pay at bank</p>
            {bankLines.map(([k, v]) => <div key={k} className="grid grid-cols-[52px_1fr] gap-2"><span className="text-muted-foreground">{k}</span><span className="truncate" title={v}>{v}</span></div>)}
          </div>
        )}
      </div>

      <div className="border-t p-3 text-[10px] text-muted-foreground">
        <div className="grid grid-cols-2 gap-4 pb-3">
          <div className="border-t pt-1">Authorised Signature</div>
          <div className="border-t pt-1">Received By / Bank Stamp</div>
        </div>
        <p className="line-clamp-2">{data.footerNote || "Please pay before due date. A late fee may apply for overdue payments."}</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 min-w-[920px] bg-muted/40">
      <div className="grid grid-cols-3 gap-3">
        <Copy label="Student Copy" />
        <Copy label="Bank Copy" />
        <Copy label="Office Copy" />
      </div>
    </div>
  );
}
