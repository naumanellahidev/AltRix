import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
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
  Percent
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  total_fees_paid: number;
  generated_at: string;
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
  const [selectedPlanDetails, setSelectedPlanDetails] = useState<InstallmentPlanDetail | null>(null);
  const [viewPlanInvoice, setViewPlanInvoice] = useState<InvoiceRecord | null>(null);
  const [taxCerts, setTaxCerts] = useState<TaxCertificate[]>([]);
  const [generatingTax, setGeneratingTax] = useState(false);
  const [showTaxDialog, setShowTaxDialog] = useState(false);
  const [fiscalYear, setFiscalYear] = useState("2025-2026");

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
        supabase
          .from("fee_invoices")
          .select("id, invoice_number, period_label, due_date, total_amount, paid_amount, status, subtotal, sibling_discount_amount")
          .eq("school_id", schoolId)
          .eq("student_id", child.student_id)
          .order("due_date", { ascending: false }),
        supabase
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
    } catch (err) {
      console.error("Error loading payment data:", err);
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
      toast.error("Error generating tax certificate");
    } finally {
      setGeneratingTax(false);
    }
  };

  const downloadTaxCertificate = (cert: TaxCertificate) => {
    const text = `ANNUAL TAX CERTIFICATE\n=====================\nCertificate No: ${cert.certificate_number}\nFiscal Year:    ${cert.fiscal_year}\nStudent:        ${child?.first_name} ${child?.last_name || ""}\nTotal Paid:     PKR ${Number(cert.total_fees_paid).toLocaleString()}\nGenerated:      ${new Date(cert.generated_at).toLocaleDateString()}\n\nVerified by AltRix School ERP Finance Module.`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tax-certificate-${cert.fiscal_year}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const triggerPayment = async (gatewayName: string) => {
    if (!gatewaySelectedInvoice || !child) return;
    setShowGatewayDialog(false);
    setPaying(gatewaySelectedInvoice.id);

    try {
      const amount = Math.max(gatewaySelectedInvoice.total_amount - gatewaySelectedInvoice.paid_amount, 0);
      if (gatewayName === "jazzcash") {
        const body = {
          student_id: child.student_id,
          voucher_id: gatewaySelectedInvoice.id,
          amount: amount,
          mobile_number: "03001234567", // placeholder or input
          description: `Fee Payment for ${gatewaySelectedInvoice.invoice_number}`,
        };
        const res = await apiClient.post("/payments/jazzcash/initiate", body);
        toast.info("JazzCash Transaction initiated!");
        // Simulate callback or window trigger
      } else {
        toast.success(`Payment via ${gatewayName} processed successfully (Simulation)`);
      }
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Payment initiation failed");
    } finally {
      setPaying(null);
    }
  };

  const downloadVoucher = async (inv: InvoiceRecord) => {
    if (!schoolId || !child) return;
    setDownloadingVoucher(inv.id);
    try {
      const [
        { data: school },
        { data: branding },
        { data: settings },
        { data: items },
        { data: fullInv },
      ] = await Promise.all([
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
          ? {
              h: Number((branding as any).accent_hue ?? 210),
              s: Number((branding as any).accent_saturation ?? 100),
              l: Number((branding as any).accent_lightness ?? 50),
            }
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

      {/* Balance Dashboard block */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-destructive bg-gradient-to-r from-destructive/5 to-transparent">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Pending</p>
                <h3 className="text-2xl font-bold font-display tracking-tight text-foreground mt-2">
                  PKR {outstandingVal.toLocaleString()}
                </h3>
              </div>
              <Badge variant="destructive" className="font-semibold">Pending</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Paid</p>
                <h3 className="text-2xl font-bold font-display tracking-tight text-foreground mt-2">
                  PKR {totalPaidVal.toLocaleString()}
                </h3>
              </div>
              <Badge variant="default" className="font-semibold bg-primary">Completed</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-500/5 to-transparent">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overdue Amount</p>
                <h3 className="text-2xl font-bold font-display tracking-tight text-amber-600 mt-2">
                  PKR {overdueVal.toLocaleString()}
                </h3>
              </div>
              <Badge className="font-semibold bg-amber-500 hover:bg-amber-600 text-white">Overdue</Badge>
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
      <Card className="shadow-soft">
        <CardHeader className="pb-3 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <CardTitle className="text-lg font-bold font-display">Invoices & Challans</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <select
              value={invStatus}
              onChange={(e) => setInvStatus(e.target.value)}
              className="h-9 px-3 border border-input rounded-md text-sm bg-background text-foreground"
            >
              <option value="__all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partial</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
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
                                size="xs"
                                className="bg-primary text-primary-foreground font-semibold"
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
                  <option value="2025-2026">2025-2026</option>
                  <option value="2024-2025">2024-2025</option>
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
                    <Button onClick={() => downloadTaxCertificate(c)} variant="outline" size="sm" className="h-8 w-8 p-0">
                      <Download className="h-4 w-4" />
                    </Button>
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
          invoice={uploadFor}
          isOpen={!!uploadFor}
          onClose={() => {
            setUploadFor(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
