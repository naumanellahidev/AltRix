import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { ChildInfo } from "@/hooks/useMyChildren";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  XCircle,
  Clock,
  RefreshCw,
  Download,
  Receipt,
  Wallet,
  AlertCircle,
  AlertTriangle,
  History,
  Search,
  X,
  FileText,
  Upload,
  Eye,
  Inbox,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Percent,
  Printer,
  MessageCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { generateVoucherPdf, prepareVoucherData, type VoucherCopyData, voucherFileName } from "@/lib/fee-voucher-pdf";
import { lateFeeTerms, loadSchoolVoucherMeta, voucherStatusFor } from "@/lib/voucher-data";
import { atLeastZero, subtract } from "@/lib/documents/decimal";
import { ManualProofUploadDialog } from "@/components/fees/ManualProofUploadDialog";
import {
  type FeeCertificatePayment,
  downloadFeeCertificate,
  printFeeCertificate,
  shareFeeCertificate,
} from "@/lib/documents/fee-certificate";
import { describeShare } from "@/lib/documents/deliver";

interface ParentFeesModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

/**
 * The most recent Pakistani fiscal years, current first. The fiscal year runs
 * 1 July to 30 June, so September 2026 falls in "2026-2027".
 */
function recentFiscalYears(count: number, today = new Date()): string[] {
  const start = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  return Array.from({ length: count }, (_, i) => `${start - i}-${start - i + 1}`);
}

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  period_label: string | null;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  subtotal?: number;
  sibling_discount_amount?: number;
}

interface JcTxn {
  id: string;
  invoice_id: string;
  txn_ref_no: string;
  amount: number;
  status: string;
  jc_response_message: string | null;
  created_at: string;
  provider?: "jazzcash" | "easypaisa" | "payoneer";
}

interface InstallmentItem {
  id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: string;
  paid_at: string | null;
}

interface InstallmentPlanDetail {
  plan: {
    id: string;
    total_amount: number;
    total_installments: number;
    installment_amount: number;
    status: string;
  } | null;
  installments: InstallmentItem[];
}

interface TaxCertificate {
  id: string;
  fiscal_year: string;
  certificate_number: string;
  total_fees_paid: number | string;
  generated_at: string;
  school_ntn?: string | null;
  payment_details?: FeeCertificatePayment[] | null;
}

export default function ParentFeesModule({ child, schoolId }: ParentFeesModuleProps) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [downloadingVoucher, setDownloadingVoucher] = useState<string | null>(null);
  const [txns, setTxns] = useState<JcTxn[]>([]);
  const [receiptTxn, setReceiptTxn] = useState<JcTxn | null>(null);
  const [invSearch, setInvSearch] = useState("");
  const [invStatus, setInvStatus] = useState("__all");
  const [uploadFor, setUploadFor] = useState<InvoiceRecord | null>(null);
  const [viewProof, setViewProof] = useState<{ url: string; name: string } | null>(null);

  // Advanced feature state
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPlanDetails, setSelectedPlanDetails] = useState<InstallmentPlanDetail | null>(null);
  const [viewPlanInvoice, setViewPlanInvoice] = useState<InvoiceRecord | null>(null);
  const [taxCerts, setTaxCerts] = useState<TaxCertificate[]>([]);
  const [generatingTax, setGeneratingTax] = useState(false);
  const [showTaxDialog, setShowTaxDialog] = useState(false);
  const fiscalYears = useMemo(() => recentFiscalYears(5), []);
  const [fiscalYear, setFiscalYear] = useState(() => recentFiscalYears(1)[0]);

  // Gateway Selection
  const [showGatewayDialog, setShowGatewayDialog] = useState(false);
  const [gatewaySelectedInvoice, setGatewaySelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [gateways, setGateways] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!child || !schoolId) return;
    setLoading(true);
    try {
      // Load invoices & online transaction history from Supabase
      const [{ data: invs }, { data: jcRows }] = await Promise.all([
        api
          .from("fee_invoices")
          .select("id, invoice_number, period_label, due_date, total_amount, paid_amount, status, subtotal, sibling_discount_amount")
          .eq("school_id", schoolId)
          .eq("student_id", child.student_id)
          .order("due_date", { ascending: false }),
        api
          .from("jazzcash_transactions")
          .select("id, invoice_id, txn_ref_no, amount, status, jc_response_message, created_at")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false }),
      ]);

      setInvoices((invs as InvoiceRecord[]) || []);
      setTxns(
        (jcRows || []).map((t) => ({
          ...t,
          provider: "jazzcash",
        }))
      );

      setLoadError(null);

      // Load balance dashboard stats from FastAPI
      const statsRes = await apiClient.get(`/finance/balance-dashboard/${child.student_id}`);
      setDashboardData(statsRes.data);

      // Load active payment gateway configurations
      const gatewayRes = await apiClient.get("/finance/gateway-configs");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setGateways(gatewayRes.data.filter((g: any) => g.is_active));

      // Load tax certificates
      const taxRes = await apiClient.get(`/finance/tax-certificates/${child.student_id}`);
      setTaxCerts(taxRes.data || []);
    } catch (err: any) {
      // This used to be swallowed into the console: the balance endpoint was
      // raising on every call and the screen simply showed zeros, so a family
      // could not tell "nothing is owed" from "nothing could be loaded".
      console.error("Error loading payment data:", err);
      setLoadError(
        err?.response?.data?.detail ?? err?.message ?? "Your fee details could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [child, schoolId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const viewInstallmentPlan = async (inv: InvoiceRecord) => {
    setViewPlanInvoice(inv);
    try {
      const res = await apiClient.get(`/finance/installment-plans/${inv.id}`);
      setSelectedPlanDetails(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Could not load installment plan");
    }
  };

  const handlePayInstallment = async (planId: string, instNum: number) => {
    try {
      await apiClient.post(`/finance/installment-plans/${planId}/pay-installment`, null, {
        params: { installment_number: instNum },
      });
      toast.success("Installment payment recorded successfully");
      loadData();
      if (viewPlanInvoice) {
        const res = await apiClient.get(`/finance/installment-plans/${viewPlanInvoice.id}`);
        setSelectedPlanDetails(res.data);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error paying installment");
    }
  };

  const generateTaxCertificate = async () => {
    if (!child) return;
    setGeneratingTax(true);
    try {
      await apiClient.post("/finance/tax-certificates/generate", {
        student_id: child.student_id,
        fiscal_year: fiscalYear,
      });
      toast.success("Tax certificate generated!");
      setShowTaxDialog(false);
      const taxRes = await apiClient.get(`/finance/tax-certificates/${child.student_id}`);
      setTaxCerts(taxRes.data || []);
    } catch (err) {
      console.error(err);
      toast.error(`The certificate could not be issued: ${(err as any)?.response?.data?.detail ?? (err as any)?.message ?? "unknown error"}`);
    } finally {
      setGeneratingTax(false);
    }
  };

  const [taxBusy, setTaxBusy] = useState<string | null>(null);
  /** The annual fee certificate as a branded PDF: download, print or share. */
  const taxCertificateAction = async (cert: TaxCertificate, kind: "download" | "print" | "share") => {
    if (!child) return;
    const student = {
      name: [child.first_name, child.last_name].filter(Boolean).join(" ") || "Student",
      className: [child.class_name, child.section_name].filter(Boolean).join(" — ") || null,
      studentCode: child.student_code ?? null,
      rollNumber: child.roll_number ?? null,
    };
    setTaxBusy(`${cert.id}:${kind}`);
    const id = toast.loading("Preparing the fee certificate…");
    try {
      if (kind === "share") {
        const outcome = await shareFeeCertificate(cert, student);
        const { tone, message } = describeShare(outcome);
        const note = outcome.warnings.length ? ` Note: ${outcome.warnings.join("; ")}` : "";
        if (tone === "error") toast.error(message + note, { id });
        else if (tone === "info") toast.info(message + note, { id, duration: 9000 });
        else toast.success(message + note, { id });
        return;
      }
      const result: { warnings: string[]; fileName?: string } =
        kind === "print" ? await printFeeCertificate(cert, student) : await downloadFeeCertificate(cert, student);
      const done = kind === "print" ? "Sent to print" : `Downloaded ${result.fileName}`;
      if (result.warnings.length) toast.warning(`${done}. Note: ${result.warnings.join("; ")}`, { id, duration: 9000 });
      else if (kind === "print") toast.dismiss(id);
      else toast.success(done, { id });
    } catch (e: any) {
      toast.error(`The certificate could not be produced: ${e?.message ?? String(e)}`, { id });
    } finally {
      setTaxBusy(null);
    }
  };

  const [walletNumber, setWalletNumber] = useState("");
  const walletNumberValid = /^03\d{9}$/.test(walletNumber.replace(/[\s-]/g, ""));

  const triggerPayment = async (gatewayName: string) => {
    if (!gatewaySelectedInvoice || !child) return;
    const gateway = gatewayName.toLowerCase();
    if (gateway !== "jazzcash") {
      // Only JazzCash is connected end to end. Saying anything else was
      // "processed successfully" told a parent they had paid when they had not.
      toast.error(
        `${gatewayName} payments are not available online yet. Please pay by JazzCash or submit your bank deposit receipt.`,
      );
      return;
    }
    const mobile = walletNumber.replace(/[\s-]/g, "");
    if (!/^03\d{9}$/.test(mobile)) {
      toast.error("Enter the JazzCash mobile account number, e.g. 03XXXXXXXXX");
      return;
    }
    setShowGatewayDialog(false);
    setPaying(gatewaySelectedInvoice.id);
    try {
      // No amount is sent: the server charges the voucher's outstanding balance
      // exactly, from the database, rather than a figure computed here.
      const res = await apiClient.post("/payments/jazzcash/initiate", {
        student_id: child.student_id,
        voucher_id: gatewaySelectedInvoice.id,
        mobile_number: mobile,
        description: `Fee payment ${gatewaySelectedInvoice.invoice_number}`,
      });
      const { gateway_url, payload } = res.data ?? {};
      if (!gateway_url || !payload) throw new Error("the payment gateway did not return a checkout");
      toast.info("Opening JazzCash to complete the payment…");
      // JazzCash's hosted checkout takes the signed fields as a form post.
      const form = document.createElement("form");
      form.method = "POST";
      form.action = gateway_url;
      Object.entries(payload as Record<string, unknown>).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value == null ? "" : String(value);
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err: any) {
      console.error(err);
      toast.error(`The payment could not be started: ${err?.response?.data?.detail ?? err?.message ?? "unknown error"}`);
      setPaying(null);
    }
  };

  const downloadVoucher = async (inv: InvoiceRecord) => {
    if (!schoolId || !child) return;
    setDownloadingVoucher(inv.id);
    try {
      const [meta, { data: items, error: itemsErr }, { data: fullInv, error: invErr }] = await Promise.all([
        loadSchoolVoucherMeta(schoolId),
        api.from("fee_invoice_items").select("label,amount,sort_order").eq("invoice_id", inv.id).order("sort_order"),
        api
          .from("fee_invoices")
          .select("subtotal,discount_amount,sibling_discount_amount,merit_discount_amount,merit_discount_reason,total_amount,paid_amount,status,due_date")
          .eq("id", inv.id)
          .maybeSingle(),
      ]);
      if (invErr) throw new Error(`the invoice could not be loaded: ${invErr.message}`);
      if (itemsErr) throw new Error(`the invoice's charges could not be loaded: ${itemsErr.message}`);

      const full = (fullInv ?? {}) as any;
      const dueDate = full.due_date ?? inv.due_date;

      const base: VoucherCopyData = {
        invoiceNumber: inv.invoice_number,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate,
        periodLabel: inv.period_label,
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
          name: `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim(),
          rollNumber: (child as any).roll_number ?? null,
          studentCode: (child as any).student_code ?? null,
          className: (child as any).class_name ?? null,
          sectionName: (child as any).section_name ?? null,
          parentName: null,
          parentPhone: null,
        },
        // Exact decimal strings from the server; never through a float.
        items: (items ?? []).map((it: any) => ({ label: it.label, amount: String(it.amount) })),
        subtotal: full.subtotal ?? inv.total_amount,
        baseDiscount: full.discount_amount ?? null,
        meritDiscount: full.merit_discount_amount ?? null,
        meritReason: full.merit_discount_reason ?? null,
        siblingDiscount: full.sibling_discount_amount ?? null,
        total: full.total_amount ?? inv.total_amount,
        // A reprint shows what has already been paid and is stamped with the
        // invoice's standing, so a paid slip cannot be paid a second time.
        paidAmount: full.paid_amount ?? null,
        status: voucherStatusFor(full.status ?? (inv as any).status, dueDate),
        currency: meta.currency ?? "PKR",
        accentHsl: meta.branding,
        notes: null,
        bank: meta.bank,
        footerNote: meta.footerNote,
        ...lateFeeTerms(meta, dueDate),
      };

      const { data, warnings } = await prepareVoucherData(base);
      const doc = generateVoucherPdf(data);
      doc.save(voucherFileName(data));
      if (warnings.length) {
        toast.warning(`Voucher downloaded without the school logo: ${warnings[0].reason}`);
      } else {
        toast.success(`Voucher ${inv.invoice_number} downloaded`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not download voucher");
    } finally {
      setDownloadingVoucher(null);
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch = inv.invoice_number.toLowerCase().includes(invSearch.toLowerCase()) ||
        (inv.period_label && inv.period_label.toLowerCase().includes(invSearch.toLowerCase()));
      const matchStatus = invStatus === "__all" || inv.status === invStatus;
      return matchSearch && matchStatus;
    });
  }, [invoices, invSearch, invStatus]);

  const outstandingVal = dashboardData?.total_due ?? 0;
  const totalPaidVal = dashboardData?.total_paid ?? 0;
  const overdueVal = dashboardData?.overdue_amount ?? 0;

  if (!child) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Finance Portal</h1>
          <p className="text-muted-foreground mt-1">
            Manage fee structures, installments, sibling discounts, and billing records for{" "}
            <span className="font-semibold text-primary">{child.first_name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowTaxDialog(true)} variant="outline" className="gap-2 border-primary/20 hover:border-primary/50 text-foreground">
            <Percent className="h-4 w-4" /> Tax Certificates
          </Button>
          <Button onClick={loadData} variant="outline" size="icon" className="h-10 w-10">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold text-foreground">Your fee details could not be loaded</p>
            <p className="text-muted-foreground">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={loadData}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* Balance Dashboard block */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="border-l-4 border-l-destructive bg-gradient-to-r from-destructive/5 to-transparent rounded-2xl shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Pending</p>
                <h3 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-foreground mt-1 sm:mt-2">
                  PKR {outstandingVal.toLocaleString()}
                </h3>
              </div>
              <Badge variant="destructive" className="font-semibold text-xs">Pending</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary bg-gradient-to-r from-primary/5 to-transparent rounded-2xl shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Paid</p>
                <h3 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-foreground mt-1 sm:mt-2">
                  PKR {totalPaidVal.toLocaleString()}
                </h3>
              </div>
              <Badge variant="default" className="font-semibold bg-primary text-xs">Completed</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-500/5 to-transparent rounded-2xl shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overdue Amount</p>
                <h3 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-amber-600 mt-1 sm:mt-2">
                  PKR {overdueVal.toLocaleString()}
                </h3>
              </div>
              <Badge className="font-semibold bg-amber-500 hover:bg-amber-600 text-white text-xs">Overdue</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Escalation alerting warning banner */}
      {dashboardData?.active_escalations > 0 && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 p-4 rounded-xl">
          <AlertCircle className="h-6 w-6 text-amber-600 shrink-0" />
          <div className="text-xs md:text-sm">
            <span className="font-bold">Urgent Notice:</span> An active fee collection escalation protocol is currently in place for overdue accounts. Please settle outstanding balances to avoid structural blocks.
          </div>
        </div>
      )}

      {/* Main Billing Table */}
      <Card className="shadow-soft rounded-2xl sm:rounded-3xl overflow-hidden">
        <CardHeader className="pb-3 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg font-bold font-display">Invoices & Challans</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl"
              />
            </div>
            <select
              value={invStatus}
              onChange={(e) => setInvStatus(e.target.value)}
              className="h-9 px-3 border border-input rounded-xl text-xs bg-background text-foreground"
            >
              <option value="__all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partial</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="font-semibold pl-6">Challan No.</TableHead>
                <TableHead className="font-semibold">Billing Period</TableHead>
                <TableHead className="font-semibold">Due Date</TableHead>
                <TableHead className="font-semibold text-right">Amount</TableHead>
                <TableHead className="font-semibold text-center">Status</TableHead>
                <TableHead className="font-semibold text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading billing list...
                  </TableCell>
                </TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                    No fee challans matched filter criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground pl-6">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.period_label || "Tuition Term"}</TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(inv.due_date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      PKR {inv.total_amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={inv.status === "paid" ? "default" : "destructive"}
                        className={`font-semibold ${inv.status === "paid" ? "bg-emerald-500 hover:bg-emerald-600" : ""}`}
                      >
                        {inv.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6 space-x-2">
                      {inv.status !== "paid" && (
                        <Button
                          onClick={() => {
                            setGatewaySelectedInvoice(inv);
                            setShowGatewayDialog(true);
                          }}
                          size="sm"
                          className="bg-primary text-primary-foreground font-semibold hover:bg-primary/95"
                        >
                          Pay Online
                        </Button>
                      )}
                      <Button
                        onClick={() => viewInstallmentPlan(inv)}
                        variant="outline"
                        size="sm"
                        className="border-primary/20 hover:border-primary/50 text-foreground"
                      >
                        Installments
                      </Button>
                      <Button
                        onClick={() => downloadVoucher(inv)}
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        {downloadingVoucher === inv.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment Gateway Selector Modal */}
      <Dialog open={showGatewayDialog} onOpenChange={setShowGatewayDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Select Payment Gateway</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              Choose a premium payment channel to settle Challan{" "}
              <span className="font-semibold text-primary">{gatewaySelectedInvoice?.invoice_number}</span>:
            </p>
            {gateways.some((g) => String(g.gateway_name).toLowerCase() === "jazzcash") && (
              <div className="space-y-1">
                <Label htmlFor="jc-mobile" className="text-xs">JazzCash mobile account</Label>
                <Input
                  id="jc-mobile"
                  inputMode="numeric"
                  placeholder="03XXXXXXXXX"
                  value={walletNumber}
                  onChange={(e) => setWalletNumber(e.target.value)}
                  aria-invalid={walletNumber !== "" && !walletNumberValid}
                />
                {walletNumber !== "" && !walletNumberValid && (
                  <p className="text-[11px] text-destructive">Enter an 11-digit number starting with 03.</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2">
              {gateways.length === 0 ? (
                <div className="text-center py-4 border border-dashed rounded-lg text-sm text-muted-foreground">
                  No automated payment channels configured. Please use manual proof submission.
                </div>
              ) : (
                gateways.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => triggerPayment(g.gateway_name)}
                    className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/40 transition text-left group"
                  >
                    <div>
                      <div className="font-bold text-sm text-foreground">{g.display_name || g.gateway_name.toUpperCase()}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Settle with local automated wallets</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition" />
                  </button>
                ))
              )}
              {/* Fallback to Bank Transfer manual upload */}
              <button
                onClick={() => {
                  setShowGatewayDialog(false);
                  if (gatewaySelectedInvoice) setUploadFor(gatewaySelectedInvoice);
                }}
                className="flex items-center justify-between p-4 border border-dashed border-primary/30 rounded-xl hover:bg-primary/5 transition text-left group"
              >
                <div>
                  <div className="font-bold text-sm text-primary">Submit Bank Deposit Receipt</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Upload a scan/photo of the deposit slip</div>
                </div>
                <Upload className="h-4 w-4 text-primary" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Installment Plan Details Modal */}
      <Dialog open={!!viewPlanInvoice} onOpenChange={(open) => !open && setViewPlanInvoice(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Installment Schedule</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {selectedPlanDetails?.plan ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-muted/40 p-4 rounded-xl text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Plan Amount</span>
                    <span className="font-bold">PKR {selectedPlanDetails.plan.total_amount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Splits</span>
                    <span className="font-bold">{selectedPlanDetails.plan.total_installments} Installments</span>
                  </div>
                </div>

                <div className="border rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="text-xs">No.</TableHead>
                        <TableHead className="text-xs">Due Date</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs text-center">Status</TableHead>
                        <TableHead className="text-xs text-right">Payment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPlanDetails.installments.map((inst) => (
                        <TableRow key={inst.id}>
                          <TableCell className="font-medium">#{inst.installment_number}</TableCell>
                          <TableCell className="text-xs">{format(new Date(inst.due_date), "MMM d, yyyy")}</TableCell>
                          <TableCell className="text-right font-semibold">PKR {inst.amount.toLocaleString()}</TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={inst.status === "paid" ? "default" : "outline"}
                              className={`font-semibold ${inst.status === "paid" ? "bg-emerald-500 hover:bg-emerald-600 text-white" : ""}`}
                            >
                              {inst.status.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {inst.status !== "paid" && (
                              <Button
                                onClick={() => handlePayInstallment(selectedPlanDetails.plan!.id, inst.installment_number)}
                                size="sm"
                                className="h-7 px-2.5 text-xs bg-primary text-primary-foreground font-semibold"
                              >
                                Settle
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                No custom installment schedule exists for this invoice. Contact administration to partition billing.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Tax Certificate Modal */}
      <Dialog open={showTaxDialog} onOpenChange={setShowTaxDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Annual Tax Certificates</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Generate Certificate for Fiscal Year</Label>
              <div className="flex gap-2">
                <select
                  value={fiscalYear}
                  onChange={(e) => setFiscalYear(e.target.value)}
                  className="flex-1 h-10 px-3 border rounded-md text-sm bg-background text-foreground"
                >
                  {fiscalYears.map((fy) => (
                    <option key={fy} value={fy}>{fy}</option>
                  ))}
                </select>
                <Button onClick={generateTaxCertificate} disabled={generatingTax} className="bg-primary text-primary-foreground font-semibold">
                  {generatingTax ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request"}
                </Button>
              </div>
            </div>

            <div className="border rounded-xl p-3 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Available Downloads</span>
              {taxCerts.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  No tax certificates generated yet.
                </div>
              ) : (
                taxCerts.map((c) => (
                  <div key={c.id} className="flex justify-between items-center p-2 border-b last:border-0 text-sm">
                    <div>
                      <div className="font-bold text-foreground">FY {c.fiscal_year}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{c.certificate_number}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {([
                        ["share", MessageCircle, "Share on WhatsApp"],
                        ["print", Printer, "Print"],
                        ["download", Download, "Download PDF"],
                      ] as const).map(([kind, Icon, label]) => (
                        <Button
                          key={kind}
                          onClick={() => taxCertificateAction(c, kind)}
                          disabled={!!taxBusy}
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title={label}
                          aria-label={`${label} — FY ${c.fiscal_year}`}
                        >
                          {taxBusy === `${c.id}:${kind}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Upload Dialog */}
      {uploadFor && (
        <ManualProofUploadDialog
          open={!!uploadFor}
          onOpenChange={(next) => {
            if (!next) setUploadFor(null);
          }}
          schoolId={schoolId!}
          studentId={child!.student_id}
          invoiceId={uploadFor.id}
          invoiceNumber={uploadFor.invoice_number}
          amountDue={Number(atLeastZero(subtract(uploadFor.total_amount, uploadFor.paid_amount)))}
          onUploaded={() => {
            setUploadFor(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
