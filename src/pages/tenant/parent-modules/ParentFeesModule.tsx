import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { ChildInfo } from "@/hooks/useMyChildren";
import { format } from "date-fns";
import { CheckCircle2, CreditCard, Loader2, XCircle, Clock, RefreshCw, Download, Receipt, Printer, Wallet, AlertCircle, History, Search, X, FileText, Upload, Eye, Inbox, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { generateVoucherPdf, type VoucherCopyData } from "@/lib/fee-voucher-pdf";
import { ManualProofUploadDialog } from "@/components/fees/ManualProofUploadDialog";


interface ParentFeesModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  period_label: string | null;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  status: string;
}

interface JcTxn {
  id: string;
  invoice_id: string;
  txn_ref_no: string;
  amount: number;
  status: string;
  jc_response_message: string | null;
  created_at: string;
  provider?: "jazzcash" | "easypaisa";
}

// Map raw errors from initiate functions / network to user-friendly messages
function friendlyError(raw: string, provider: string = "online payment"): string {
  const msg = (raw || "").toLowerCase();
  const label = provider === "easypaisa" ? "Easypaisa" : provider === "jazzcash" ? "JazzCash" : "Online payment";
  if (msg.includes("not configured")) return `${label} is not yet set up by your school. Please contact the school office.`;
  if (msg.includes("already paid")) return "This invoice has already been paid.";
  if (msg.includes("invoice not found")) return "We couldn't find this invoice. Please refresh and try again.";
  if (msg.includes("unauthorized")) return "Your session has expired. Please sign in again.";
  if (msg.includes("invoice_id required")) return "Something went wrong selecting this invoice. Please retry.";
  if (msg.includes("popup")) return "Your browser blocked the payment window. Please allow popups and try again.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return `Network problem reaching ${label}. Check your connection and try again.`;
  if (msg.includes("failed to start")) return `${label} didn't respond. Please try again in a moment.`;
  return raw || "Payment couldn't be started. Please try again.";
}

function buildReceiptText(t: JcTxn, inv: InvoiceRecord | undefined, studentName: string): string {
  const methodLabel = t.provider === "easypaisa" ? "Easypaisa" : "JazzCash";
  const lines = [
    `${methodLabel.toUpperCase()} PAYMENT RECEIPT`,
    "========================",
    `Date:       ${new Date(t.created_at).toLocaleString()}`,
    `Reference:  ${t.txn_ref_no}`,
    `Invoice:    ${inv?.invoice_number || "—"}`,
    `Student:    ${studentName}`,
    `Method:     ${methodLabel}`,
    `Status:     ${t.status.toUpperCase()}`,
    `Amount:     PKR ${Number(t.amount).toLocaleString()}`,
    "",
    t.jc_response_message ? `Note: ${t.jc_response_message}` : "",
    "",
    "Keep this receipt for your records.",
  ];
  return lines.filter(Boolean).join("\n");
}

function downloadReceipt(text: string, ref: string, provider: string = "payment") {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${provider}-receipt-${ref}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const ParentFeesModule = ({ child, schoolId }: ParentFeesModuleProps) => {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [jcEnabled, setJcEnabled] = useState(false);
  const [epEnabled, setEpEnabled] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [downloadingVoucher, setDownloadingVoucher] = useState<string | null>(null);
  const [txns, setTxns] = useState<JcTxn[]>([]);
  const [receiptTxn, setReceiptTxn] = useState<JcTxn | null>(null);
  const [invSearch, setInvSearch] = useState("");
  const [invStatus, setInvStatus] = useState("__all");
  const [invFromDate, setInvFromDate] = useState("");
  const [invToDate, setInvToDate] = useState("");
  const [uploadFor, setUploadFor] = useState<InvoiceRecord | null>(null);
  const [editProof, setEditProof] = useState<any | null>(null);
  const [deleteProof, setDeleteProof] = useState<any | null>(null);
  const [deletingProof, setDeletingProof] = useState(false);
  const [proofs, setProofs] = useState<any[]>([]);
  const [viewProof, setViewProof] = useState<{ url: string; name: string } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const highlightInvoice = useMemo(() => new URLSearchParams(location.search).get("invoice"), [location.search]);
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (highlightInvoice && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightInvoice, invoices.length]);

  const downloadVoucher = async (inv: InvoiceRecord) => {
    if (!schoolId || !child) return;
    setDownloadingVoucher(inv.id);
    try {
      const [{ data: school }, { data: branding }, { data: settings }, { data: items }, { data: fullInv }] = await Promise.all([
        supabase.from("schools").select("id,name,address,phone,email,website,motto,logo_url").eq("id", schoolId).maybeSingle(),
        (supabase as any).from("school_branding").select("accent_hue,accent_saturation,accent_lightness").eq("school_id", schoolId).maybeSingle(),
        (supabase as any).from("fee_settings").select("bank_name,bank_account_title,bank_account_number,bank_iban,bank_branch,bank_swift,voucher_footer_note,currency").eq("school_id", schoolId).maybeSingle(),
        supabase.from("fee_invoice_items").select("label,amount,sort_order").eq("invoice_id", inv.id).order("sort_order"),
        supabase.from("fee_invoices").select("subtotal,discount_amount,sibling_discount_amount,merit_discount_amount,merit_discount_reason,total_amount").eq("id", inv.id).maybeSingle(),
      ]);
      const data: VoucherCopyData = {
        invoiceNumber: inv.invoice_number,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: inv.due_date,
        periodLabel: inv.period_label,
        school: {
          name: school?.name ?? "School",
          address: (school as any)?.address ?? null,
          phone: (school as any)?.phone ?? null,
          email: (school as any)?.email ?? null,
          website: (school as any)?.website ?? null,
          logoUrl: (school as any)?.logo_url ?? null,
          motto: (school as any)?.motto ?? null,
        },
        student: {
          name: `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim(),
          rollNumber: (child as any).roll_number ?? null,
          studentCode: (child as any).student_code ?? null,
          className: (child as any).class_name ?? null,
          sectionName: (child as any).section_name ?? null,
          parentName: null,
          parentPhone: null,
        },
        items: (items ?? []).map((it: any) => ({ label: it.label, amount: Number(it.amount) })),
        subtotal: Number((fullInv as any)?.subtotal ?? inv.total_amount),
        baseDiscount: Number((fullInv as any)?.discount_amount ?? 0),
        meritDiscount: Number((fullInv as any)?.merit_discount_amount ?? 0),
        meritReason: (fullInv as any)?.merit_discount_reason ?? null,
        siblingDiscount: Number((fullInv as any)?.sibling_discount_amount ?? 0),
        total: Number((fullInv as any)?.total_amount ?? inv.total_amount),
        currency: (settings as any)?.currency ?? "PKR",
        accentHsl: branding
          ? { h: Number((branding as any).accent_hue ?? 210), s: Number((branding as any).accent_saturation ?? 100), l: Number((branding as any).accent_lightness ?? 50) }
          : { h: 210, s: 100, l: 50 },
        notes: null,
        bank: settings
          ? {
              bankName: (settings as any).bank_name,
              accountTitle: (settings as any).bank_account_title,
              accountNumber: (settings as any).bank_account_number,
              iban: (settings as any).bank_iban,
              branch: (settings as any).bank_branch,
              swift: (settings as any).bank_swift,
            }
          : null,
        footerNote: (settings as any)?.voucher_footer_note ?? null,
      };
      const doc = generateVoucherPdf(data);
      doc.save(`voucher-${inv.invoice_number}.pdf`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not download voucher");
    } finally {
      setDownloadingVoucher(null);
    }
  };

  const printChallan = (inv: InvoiceRecord) => {
    const due = Math.max(Number(inv.total_amount) - Number(inv.paid_amount), 0);
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("Pop-up blocked. Allow pop-ups to print."); return; }
    const html = `<!doctype html><html><head><title>Fee Challan ${inv.invoice_number}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0a0a0a;padding:20px}
        .challan{border:1px dashed #888;padding:18px;margin-bottom:14px;border-radius:8px}
        h2{margin:0 0 6px;font-size:16px}
        .row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px dotted #ddd}
        .total{font-size:16px;font-weight:700;margin-top:10px;padding-top:8px;border-top:2px solid #0a0a0a}
        .muted{color:#6b7280;font-size:11px}
        .copy-label{background:#0a0a0a;color:#fff;display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;margin-bottom:8px}
        @media print{button{display:none}}
      </style></head><body>
      ${["School Copy","Bank Copy","Parent Copy"].map(label => `
        <div class="challan">
          <span class="copy-label">${label}</span>
          <h2>FEE PAYMENT CHALLAN</h2>
          <div class="muted">Invoice ${inv.invoice_number}</div>
          <div class="row"><span>Student</span><span>${child?.first_name || ""} ${child?.last_name || ""}</span></div>
          <div class="row"><span>Period</span><span>${inv.period_label || "—"}</span></div>
          <div class="row"><span>Due Date</span><span>${format(new Date(inv.due_date), "MMM d, yyyy")}</span></div>
          <div class="row"><span>Total</span><span>PKR ${Number(inv.total_amount).toLocaleString()}</span></div>
          <div class="row"><span>Paid</span><span>PKR ${Number(inv.paid_amount).toLocaleString()}</span></div>
          <div class="total">Amount Due: PKR ${due.toLocaleString()}</div>
          <div class="muted" style="margin-top:8px">Pay at the school office or your bank using this challan. Keep your copy as proof of payment.</div>
        </div>
      `).join("")}
      <script>setTimeout(()=>window.print(),250)</script>
      </body></html>`;
    w.document.write(html);
    w.document.close();
  };

  useEffect(() => {
    if (!child || !schoolId) return;
    let cancelled = false;

    const loadInvoices = async () => {
      const { data } = await supabase.from("fee_invoices")
        .select("id, invoice_number, period_label, due_date, total_amount, paid_amount, status")
        .eq("school_id", schoolId).eq("student_id", child.student_id)
        .order("due_date", { ascending: false }).limit(100);
      if (!cancelled) setInvoices((data as InvoiceRecord[]) || []);
    };
    const loadProviders = async () => {
      const [{ data: jc }, { data: ep }] = await Promise.all([
        supabase.from("jazzcash_settings").select("is_enabled").eq("school_id", schoolId).maybeSingle(),
        supabase.from("easypaisa_settings").select("is_enabled").eq("school_id", schoolId).maybeSingle(),
      ]);
      if (!cancelled) {
        setJcEnabled(!!jc?.is_enabled);
        setEpEnabled(!!ep?.is_enabled);
      }
    };
    const loadTxns = async () => {
      const [{ data: jcRows }, { data: epRows }] = await Promise.all([
        supabase.from("jazzcash_transactions")
          .select("id, invoice_id, txn_ref_no, amount, status, jc_response_message, created_at")
          .eq("school_id", schoolId).eq("student_id", child.student_id)
          .order("created_at", { ascending: false }).limit(50),
        supabase.from("easypaisa_transactions")
          .select("id, invoice_id, order_ref_no, amount, status, ep_response_message, created_at")
          .eq("school_id", schoolId).eq("student_id", child.student_id)
          .order("created_at", { ascending: false }).limit(50),
      ]);
      const merged: JcTxn[] = [
        ...((jcRows || []) as any[]).map(r => ({ ...r, provider: "jazzcash" as const })),
        ...((epRows || []) as any[]).map(r => ({
          id: r.id, invoice_id: r.invoice_id, txn_ref_no: r.order_ref_no,
          amount: r.amount, status: r.status, jc_response_message: r.ep_response_message,
          created_at: r.created_at, provider: "easypaisa" as const,
        })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
      if (!cancelled) setTxns(merged);
    };

    const loadProofs = async () => {
      const { data } = await (supabase as any).from("fee_payment_proofs")
        .select("id, invoice_id, file_path, file_name, amount, paid_at, method, note, status, rejection_reason, created_at, verified_at")
        .eq("school_id", schoolId).eq("student_id", child.student_id)
        .order("created_at", { ascending: false }).limit(100);
      if (!cancelled) setProofs(data || []);
    };

    (async () => {
      setLoading(true);
      await Promise.all([loadInvoices(), loadProviders(), loadTxns(), loadProofs()]);
      if (!cancelled) setLoading(false);
    })();

    const ch = supabase.channel(`pfees-${child.student_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_invoices", filter: `student_id=eq.${child.student_id}` }, loadInvoices)
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_payment_proofs", filter: `student_id=eq.${child.student_id}` }, loadProofs)
      .on("postgres_changes", { event: "*", schema: "public", table: "jazzcash_settings", filter: `school_id=eq.${schoolId}` }, loadProviders)
      .on("postgres_changes", { event: "*", schema: "public", table: "easypaisa_settings", filter: `school_id=eq.${schoolId}` }, loadProviders)
      .on("postgres_changes", { event: "*", schema: "public", table: "jazzcash_transactions", filter: `student_id=eq.${child.student_id}` }, (payload) => {
        loadTxns();
        const newRow = payload.new as any;
        if (newRow && payload.eventType === "UPDATE") {
          if (newRow.status === "success") toast.success(`Payment received for ${newRow.txn_ref_no}`);
          else if (newRow.status === "failed") toast.error(`Payment failed: ${newRow.jc_response_message || "Unknown reason"}`);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "easypaisa_transactions", filter: `student_id=eq.${child.student_id}` }, (payload) => {
        loadTxns();
        const newRow = payload.new as any;
        if (newRow && payload.eventType === "UPDATE") {
          if (newRow.status === "success") toast.success(`Payment received for ${newRow.order_ref_no}`);
          else if (newRow.status === "failed") toast.error(`Payment failed: ${newRow.ep_response_message || "Unknown reason"}`);
        }
      })
      .subscribe();



    // Separate channel for app_notifications keyed to current auth user (parent), to refresh on proof verify/reject
    const userChan = supabase.channel(`pfees-notif-${child.student_id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "app_notifications" }, (payload: any) => {
        const n = payload.new;
        if (!n) return;
        if (["fee_proof_verified", "fee_proof_rejected", "fee_proof_submitted"].includes(n.type)) {
          loadInvoices();
          loadProofs();
          if (n.type === "fee_proof_verified") toast.success(n.title);
          else if (n.type === "fee_proof_rejected") toast.error(n.title);
        }
      })
      .subscribe();


    return () => { cancelled = true; supabase.removeChannel(ch); supabase.removeChannel(userChan); };
  }, [child, schoolId]);

  const payNow = async (invoiceId: string, provider: "jazzcash" | "easypaisa" = "jazzcash") => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error(friendlyError("popup blocked", provider));
      return;
    }
    const label = provider === "easypaisa" ? "Easypaisa" : "JazzCash";
    w.document.write(`<p style="font-family:sans-serif;text-align:center;padding:40px">Preparing ${label} checkout…</p>`);
    setPaying(`${provider}:${invoiceId}`);
    try {
      const fnName = provider === "easypaisa" ? "easypaisa-initiate" : "jazzcash-initiate";
      const { data, error } = await supabase.functions.invoke(fnName, { body: { invoice_id: invoiceId } });
      if (error) throw error;
      const errMsg = (data as any)?.error;
      if (errMsg) throw new Error(errMsg);
      const html = (data as any)?.html;
      if (!html) throw new Error("Failed to start checkout");
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e: any) {
      try { w.close(); } catch {}
      toast.error(friendlyError(e?.message || "", provider));
    } finally {
      setPaying(null);
    }
  };

  const filteredInvoices = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    return invoices.filter(i => {
      if (invStatus !== "__all" && i.status !== invStatus) return false;
      if (invFromDate && i.due_date < invFromDate) return false;
      if (invToDate && i.due_date > invToDate) return false;
      if (q) {
        const hay = `${i.invoice_number} ${i.period_label || ""} ${i.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, invSearch, invStatus, invFromDate, invToDate]);

  if (!child) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center text-center py-16 gap-3">
          <div className="rounded-full bg-muted p-4"><Inbox className="h-8 w-8 text-muted-foreground" /></div>
          <h3 className="font-display text-lg font-semibold">Select a child to view fees</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Use the child switcher above to choose which child's fee vouchers and payment status you'd like to see.
          </p>
        </CardContent>
      </Card>
    );
  }


  const statusVariant = (status: string): any => status === "paid" ? "default" : status === "overdue" ? "destructive" : status === "partial" ? "secondary" : "outline";
  const totalOutstanding = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled").reduce((sum, i) => sum + Math.max(Number(i.total_amount) - Number(i.paid_amount), 0), 0);
  const totalBilled = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
  const overdueCount = invoices.filter(i => i.status === "overdue").length;
  const successPaymentsTotal = txns.filter(t => t.status === "success").reduce((s, t) => s + Number(t.amount || 0), 0);
  const nextDue = invoices
    .filter(i => i.status !== "paid" && i.status !== "cancelled")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  const txnIcon = (status: string) => {
    if (status === "success") return <CheckCircle2 className="h-4 w-4 text-primary" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };
  const txnBadgeVariant = (status: string): any => status === "success" ? "default" : status === "failed" ? "destructive" : "secondary";


  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Fees</h1>
        <p className="text-muted-foreground">View fee invoices and payment status for {child.first_name || "your child"}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className={totalOutstanding > 0 ? "border-destructive/40 bg-destructive/5" : ""}>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4" /><span className="uppercase tracking-wide">Outstanding</span>
            </div>
            <p className="mt-2 text-xl font-semibold">PKR {totalOutstanding.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{overdueCount} overdue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="h-4 w-4" /><span className="uppercase tracking-wide">Total Paid</span>
            </div>
            <p className="mt-2 text-xl font-semibold">PKR {totalPaid.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">of PKR {totalBilled.toLocaleString()} billed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-4 w-4" /><span className="uppercase tracking-wide">Next Due</span>
            </div>
            <p className="mt-2 text-xl font-semibold">
              {nextDue ? format(new Date(nextDue.due_date), "MMM d") : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {nextDue ? `PKR ${Math.max(Number(nextDue.total_amount) - Number(nextDue.paid_amount), 0).toLocaleString()}` : "Nothing pending"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <History className="h-4 w-4" /><span className="uppercase tracking-wide">Online Paid</span>
            </div>
            <p className="mt-2 text-xl font-semibold">PKR {successPaymentsTotal.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{txns.filter(t => t.status === "success").length} successful txns</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={invSearch} onChange={e => setInvSearch(e.target.value)} placeholder="Search invoice # or period…" className="pl-8 pr-8" />
              {invSearch && (
                <button type="button" onClick={() => setInvSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={invStatus} onValueChange={setInvStatus}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" className="w-[150px]" value={invFromDate} onChange={e => setInvFromDate(e.target.value)} />
              <Label className="text-xs text-muted-foreground">to</Label>
              <Input type="date" className="w-[150px]" value={invToDate} onChange={e => setInvToDate(e.target.value)} />
            </div>
            {(invSearch || invStatus !== "__all" || invFromDate || invToDate) && (
              <Button size="sm" variant="ghost" onClick={() => { setInvSearch(""); setInvStatus("__all"); setInvFromDate(""); setInvToDate(""); }}>
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">
              {[0,1,2,3].map(i => (
                <div key={i} className="flex items-center gap-3 p-2 border rounded-md">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20 ml-auto" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 gap-2">
              <div className="rounded-full bg-muted p-3"><FileText className="h-6 w-6 text-muted-foreground" /></div>
              <p className="font-medium">{invoices.length === 0 ? "No invoices yet" : "No invoices match your filters"}</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                {invoices.length === 0
                  ? "When the school issues a fee voucher for " + (child.first_name || "your child") + ", it will appear here instantly."
                  : "Try clearing the search or status filter to see more results."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Invoice #</TableHead><TableHead>Period</TableHead><TableHead>Due Date</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Due</TableHead>
                <TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredInvoices.map(inv => {
                  const due = Math.max(Number(inv.total_amount) - Number(inv.paid_amount), 0);
                  const myProofs = proofs.filter(p => p.invoice_id === inv.id);
                  const pendingProof = myProofs.find(p => p.status === "pending");
                  return (
                    <TableRow
                      key={inv.id}
                      ref={highlightInvoice === inv.id ? highlightRef : undefined}
                      className={highlightInvoice === inv.id ? "bg-primary/10 transition-colors" : ""}
                    >
                      <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                      <TableCell>{inv.period_label || "—"}</TableCell>
                      <TableCell>{format(new Date(inv.due_date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right">PKR {Number(inv.total_amount).toLocaleString()}</TableCell>
                      <TableCell className="text-right">PKR {due.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
                          {pendingProof && <Badge variant="secondary" className="text-[10px]">Proof pending</Badge>}
                          {myProofs.some(p => p.status === "rejected") && <Badge variant="destructive" className="text-[10px]">Proof rejected</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => downloadVoucher(inv)} disabled={downloadingVoucher === inv.id}>
                            {downloadingVoucher === inv.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />}
                            Voucher
                          </Button>
                          {due > 0 && jcEnabled && (
                            <Button size="sm" onClick={() => payNow(inv.id, "jazzcash")} disabled={paying === `jazzcash:${inv.id}`}>
                              {paying === `jazzcash:${inv.id}` ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CreditCard className="h-3 w-3 mr-1" />}
                              JazzCash
                            </Button>
                          )}
                          {due > 0 && epEnabled && (
                            <Button size="sm" variant="secondary" onClick={() => payNow(inv.id, "easypaisa")} disabled={paying === `easypaisa:${inv.id}`}>
                              {paying === `easypaisa:${inv.id}` ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wallet className="h-3 w-3 mr-1" />}
                              Easypaisa
                            </Button>
                          )}
                          {due > 0 && !pendingProof && (
                            <Button size="sm" variant="outline" onClick={() => setUploadFor(inv)}>
                              <Upload className="h-3 w-3 mr-1" /> Upload proof
                            </Button>
                          )}
                          {pendingProof && (
                            <>
                              <Button size="sm" variant="outline" disabled>
                                <Clock className="h-3 w-3 mr-1" /> Awaiting verify
                              </Button>
                              <Button size="sm" variant="ghost" title="Edit proof" onClick={() => setEditProof(pendingProof)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Delete proof" onClick={() => setDeleteProof(pendingProof)} className="text-destructive hover:text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {myProofs.length > 0 && (
                            <Button size="sm" variant="ghost" onClick={async () => {
                              const p = myProofs[0];
                              const { data, error } = await supabase.storage.from("fee-payment-proofs").createSignedUrl(p.file_path, 300);
                              if (error || !data) { toast.error("Could not open file"); return; }
                              setViewProof({ url: data.signedUrl, name: p.file_name || "proof" });
                            }}>
                              <Eye className="h-3 w-3 mr-1" /> View proof
                            </Button>
                          )}
                          {due > 0 && (
                            <Button size="sm" variant="outline" onClick={() => printChallan(inv)}>
                              <Printer className="h-3 w-3 mr-1" /> Challan
                            </Button>
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Status</CardTitle>
          <p className="text-sm text-muted-foreground">Live updates from your recent online payment attempts (JazzCash & Easypaisa).</p>
        </CardHeader>
        <CardContent>
          {txns.length === 0 ? (
            <p className="text-muted-foreground text-sm">No payment attempts yet.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>When</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {txns.map(t => {
                  const inv = invoices.find(i => i.id === t.invoice_id);
                  return (
                    <TableRow key={t.id}>
                      <TableCell>{format(new Date(t.created_at), "MMM d, h:mm a")}</TableCell>
                      <TableCell>{inv?.invoice_number || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{t.txn_ref_no}</TableCell>
                      <TableCell className="text-right">PKR {Number(t.amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={txnBadgeVariant(t.status)} className="gap-1">
                          {txnIcon(t.status)}
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                        {t.jc_response_message || (t.status === "pending" ? `Awaiting confirmation from ${t.provider === "easypaisa" ? "Easypaisa" : "JazzCash"}…` : "—")}
                      </TableCell>
                      <TableCell className="text-right">
                        {t.status === "failed" && inv && Math.max(Number(inv.total_amount) - Number(inv.paid_amount), 0) > 0 && ((t.provider === "easypaisa" && epEnabled) || (t.provider !== "easypaisa" && jcEnabled)) && (
                          <Button size="sm" variant="outline" onClick={() => payNow(t.invoice_id, t.provider === "easypaisa" ? "easypaisa" : "jazzcash")} disabled={paying === `${t.provider || "jazzcash"}:${t.invoice_id}`}>
                            {paying === `${t.provider || "jazzcash"}:${t.invoice_id}` ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                            Try again
                          </Button>
                        )}
                        {t.status === "success" && (
                          <Button size="sm" variant="outline" onClick={() => setReceiptTxn(t)}>
                            <Receipt className="h-3 w-3 mr-1" /> Receipt
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!receiptTxn} onOpenChange={(o) => !o && setReceiptTxn(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Payment Receipt
            </DialogTitle>
          </DialogHeader>
          {receiptTxn && (() => {
            const inv = invoices.find(i => i.id === receiptTxn.invoice_id);
            const receiptText = buildReceiptText(receiptTxn, inv, child?.first_name || "");
            return (
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono">{receiptTxn.txn_ref_no}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span>{inv?.invoice_number || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Student</span><span>{child?.first_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{format(new Date(receiptTxn.created_at), "MMM d, yyyy h:mm a")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{receiptTxn.provider === "easypaisa" ? "Easypaisa" : "JazzCash"}</span></div>
                  <div className="flex justify-between font-semibold pt-2 border-t"><span>Amount Paid</span><span>PKR {Number(receiptTxn.amount).toLocaleString()}</span></div>
                  {receiptTxn.jc_response_message && (
                    <div className="text-xs text-muted-foreground pt-1">{receiptTxn.jc_response_message}</div>
                  )}
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button variant="outline" onClick={() => {
                    navigator.clipboard.writeText(receiptTxn.txn_ref_no);
                    toast.success("Reference copied");
                  }}>Copy reference</Button>
                  <Button onClick={() => downloadReceipt(receiptText, receiptTxn.txn_ref_no, receiptTxn.provider || "jazzcash")}>
                    <Download className="h-4 w-4 mr-1" /> Download
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {uploadFor && schoolId && child && (
        <ManualProofUploadDialog
          open={!!uploadFor}
          onOpenChange={(v) => !v && setUploadFor(null)}
          schoolId={schoolId}
          studentId={child.student_id}
          invoiceId={uploadFor.id}
          invoiceNumber={uploadFor.invoice_number}
          amountDue={Math.max(Number(uploadFor.total_amount) - Number(uploadFor.paid_amount), 0)}
        />
      )}

      {editProof && schoolId && child && (() => {
        const inv = invoices.find(i => i.id === editProof.invoice_id);
        return (
          <ManualProofUploadDialog
            open={!!editProof}
            onOpenChange={(v) => !v && setEditProof(null)}
            schoolId={schoolId}
            studentId={child.student_id}
            invoiceId={editProof.invoice_id}
            invoiceNumber={inv?.invoice_number || ""}
            amountDue={inv ? Math.max(Number(inv.total_amount) - Number(inv.paid_amount), 0) : Number(editProof.amount)}
            existingProof={editProof}
          />
        );
      })()}

      <Dialog open={!!deleteProof} onOpenChange={(o) => !o && !deletingProof && setDeleteProof(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this proof?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove your uploaded receipt. You can upload a new one afterwards. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProof(null)} disabled={deletingProof}>Cancel</Button>
            <Button variant="destructive" disabled={deletingProof} onClick={async () => {
              if (!deleteProof) return;
              setDeletingProof(true);
              const tId = toast.loading("Deleting proof…");
              let fileRemoved: boolean | null = null;
              try {
                if (deleteProof.file_path) {
                  const { error: rmErr } = await supabase.storage.from("fee-payment-proofs").remove([deleteProof.file_path]);
                  fileRemoved = !rmErr;
                }
                const { error } = await (supabase as any).from("fee_payment_proofs").delete().eq("id", deleteProof.id);
                if (error) throw error;
                const desc = fileRemoved === true
                  ? "Receipt file removed from storage."
                  : fileRemoved === false
                    ? "Record deleted, but the receipt file could not be removed."
                    : undefined;
                toast.success("Proof deleted", { id: tId, description: desc });
                setProofs(prev => prev.filter(p => p.id !== deleteProof.id));
                setDeleteProof(null);
              } catch (e: any) {
                toast.error(e?.message || "Failed to delete proof", { id: tId });
              } finally {
                setDeletingProof(false);
              }
            }}>
              {deletingProof ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={!!viewProof} onOpenChange={(o) => !o && setViewProof(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{viewProof?.name}</DialogTitle></DialogHeader>
          {viewProof && (
            viewProof.name.toLowerCase().endsWith(".pdf")
              ? <iframe src={viewProof.url} className="w-full h-[70vh] rounded border" />
              : <img src={viewProof.url} alt="proof" className="w-full max-h-[70vh] object-contain rounded border" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ParentFeesModule;
