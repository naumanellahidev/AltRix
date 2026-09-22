/**
 * Periods a student was billed for more than once.
 *
 * Until the duplicate guard went into `generate_fee_voucher`, re-running a
 * class billing issued a second full invoice to everyone in it — and both
 * copies counted as money the family owed, so the defaulters list and every
 * total built on it were wrong.
 *
 * Nothing is cancelled automatically. Which copy goes is the school's decision
 * and belongs in its books, so the office cancels one with a reason, and a
 * copy money has already been paid against cannot be cancelled here at all.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CopyX, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money as formatMoney, date as formatDate } from "@/lib/documents/format";

interface DuplicateInvoice {
  id: string;
  invoice_number: string;
  due_date: string | null;
  total_amount: string;
  paid_amount: string;
  cancellable: boolean;
  status: string;
  created_at: string | null;
}

interface DuplicateGroup {
  student_id: string;
  student_name: string;
  period: string;
  plan_name: string | null;
  invoices: DuplicateInvoice[];
  duplicated_amount: string;
}

export function DuplicateInvoicesCard({ currency = "PKR" }: { currency?: string }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<{ invoice: DuplicateInvoice; group: DuplicateGroup } | null>(null);
  const [reason, setReason] = useState("Duplicate of the same period");

  const { data, isLoading, error } = useQuery<{ count: number; groups: DuplicateGroup[] }>({
    queryKey: ["fees", "duplicate-invoices"],
    queryFn: async () => (await apiClient.get("/finance/duplicate-invoices")).data,
    staleTime: 120_000,
  });

  const cancel = useMutation({
    mutationFn: async ({ id, why }: { id: string; why: string }) =>
      (await apiClient.patch(`/finance/vouchers/${id}/cancel`, null, { params: { reason: why } })).data,
    onSuccess: (_res, vars) => {
      toast.success("The duplicate voucher was cancelled, with the reason on the invoice.");
      setTarget(null);
      qc.invalidateQueries({ queryKey: ["fees"] });
      qc.invalidateQueries({ queryKey: ["fee_invoices"] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.detail ?? e?.message ?? "The voucher was not cancelled");
    },
  });

  if (isLoading) return <Skeleton className="h-28 rounded-2xl" />;
  if (error || !data || data.groups.length === 0) return null;

  const totalDuplicated = data.groups.reduce((acc, g) => acc + Number(g.duplicated_amount), 0);

  return (
    <>
      <Card className="rounded-2xl border-amber-300 dark:border-amber-900">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 font-display text-base font-bold">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Billed twice for the same period
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {data.groups.length} student period{data.groups.length === 1 ? "" : "s"} carry more than one live
            voucher, adding {formatMoney(String(totalDuplicated), { currency })} to what families appear to owe.
            Cancel the copy that should not stand.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.groups.map((g) => (
            <div key={`${g.student_id}-${g.period}`} className="rounded-xl border p-3">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-semibold">{g.student_name}</span>
                <span className="text-sm text-muted-foreground">
                  {g.period}
                  {g.plan_name ? ` · ${g.plan_name}` : ""}
                </span>
                <Badge variant="secondary" className="rounded-md">
                  {g.invoices.length} vouchers
                </Badge>
              </div>
              <div className="space-y-1.5">
                {g.invoices.map((inv, i) => (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{inv.invoice_number}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {formatMoney(inv.total_amount, { currency })}
                        {Number(inv.paid_amount) > 0
                          ? ` · ${formatMoney(inv.paid_amount, { currency })} paid`
                          : ""}
                        {inv.due_date ? ` · due ${formatDate(inv.due_date)}` : ""}
                      </span>
                      {i === 0 ? (
                        <Badge variant="outline" className="ml-2 rounded-md text-[10px]">
                          first issued
                        </Badge>
                      ) : null}
                    </div>
                    {inv.cancellable ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => {
                          setTarget({ invoice: inv, group: g });
                          setReason(`Duplicate of ${g.invoices.find((x) => x.id !== inv.id)?.invoice_number ?? "the same period"}`);
                        }}
                      >
                        <CopyX className="mr-1.5 h-3.5 w-3.5" /> Cancel this one
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Paid — refund or move the payment first
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {target?.invoice.invoice_number}?</DialogTitle>
            <DialogDescription>
              {target
                ? `${target.group.student_name} · ${target.group.period} · ${formatMoney(target.invoice.total_amount, { currency })}. The voucher stays on record as cancelled, with this reason written on it.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Input
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this voucher being cancelled?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || cancel.isPending}
              onClick={() => target && cancel.mutate({ id: target.invoice.id, why: reason.trim() })}
            >
              {cancel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cancel the voucher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DuplicateInvoicesCard;
