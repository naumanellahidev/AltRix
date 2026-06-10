import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ExistingProof {
  id: string;
  file_path: string;
  file_name?: string | null;
  amount: number;
  paid_at: string | null;
  method: string | null;
  note: string | null;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schoolId: string;
  studentId: string;
  invoiceId: string;
  invoiceNumber: string;
  amountDue: number;
  existingProof?: ExistingProof | null;
  onUploaded?: () => void;
}

export function ManualProofUploadDialog({ open, onOpenChange, schoolId, studentId, invoiceId, invoiceNumber, amountDue, existingProof, onUploaded }: Props) {
  const isEdit = !!existingProof;
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState(String(existingProof?.amount ?? amountDue ?? ""));
  const [paidAt, setPaidAt] = useState(existingProof?.paid_at || new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(existingProof?.method || "bank_transfer");
  const [note, setNote] = useState(existingProof?.note || "");
  const [submitting, setSubmitting] = useState(false);

  // Re-sync state when switching between rows / edit modes
  useEffect(() => {
    if (open) {
      setFile(null);
      setAmount(String(existingProof?.amount ?? amountDue ?? ""));
      setPaidAt(existingProof?.paid_at || new Date().toISOString().slice(0, 10));
      setMethod(existingProof?.method || "bank_transfer");
      setNote(existingProof?.note || "");
    }
  }, [open, existingProof, amountDue]);

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!isEdit && !file) { toast.error("Please attach a receipt image or PDF"); return; }
    if (file && file.size > 8 * 1024 * 1024) { toast.error("File too large (max 8MB)"); return; }

    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      let filePath = existingProof?.file_path || "";
      let fileName = existingProof?.file_name || null;
      let mimeType: string | null = null;
      let oldFileRemoved: boolean | null = null;

      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        filePath = `${schoolId}/${invoiceId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("fee-payment-proofs").upload(filePath, file, {
          cacheControl: "3600", upsert: false, contentType: file.type || undefined,
        });
        if (upErr) throw upErr;
        fileName = file.name;
        mimeType = file.type;

        // remove previous file if replacing
        if (isEdit && existingProof?.file_path && existingProof.file_path !== filePath) {
          const { error: rmErr } = await supabase.storage.from("fee-payment-proofs").remove([existingProof.file_path]);
          oldFileRemoved = !rmErr;
        }
      }

      if (isEdit) {
        const patch: Record<string, any> = {
          amount: amt, paid_at: paidAt, method, note,
        };
        if (file) { patch.file_path = filePath; patch.file_name = fileName; patch.mime_type = mimeType; }
        const { error: upErr } = await (supabase as any).from("fee_payment_proofs")
          .update(patch).eq("id", existingProof!.id);
        if (upErr) throw upErr;
        const desc = file
          ? (oldFileRemoved === false
              ? "New receipt uploaded, but the old file could not be removed."
              : "Receipt replaced successfully.")
          : "Details updated.";
        toast.success("Proof updated", { description: desc });
      } else {
        const { error: insErr } = await (supabase as any).from("fee_payment_proofs").insert({
          school_id: schoolId, invoice_id: invoiceId, student_id: studentId,
          uploaded_by: uid, file_path: filePath, file_name: fileName, mime_type: mimeType,
          amount: amt, paid_at: paidAt, method, note,
        });
        if (insErr) throw insErr;
        toast.success("Proof uploaded — awaiting verification");
      }

      onOpenChange(false);
      onUploaded?.();
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit payment proof" : "Upload payment proof"}</DialogTitle>
          <DialogDescription>
            Invoice {invoiceNumber} — {isEdit ? "update details or replace the receipt" : "for staff verification"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Receipt (image or PDF){isEdit ? " — optional, leave empty to keep current" : ""}</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
            {isEdit && existingProof?.file_name && !file && (
              <p className="text-xs text-muted-foreground mt-1">Current: {existingProof.file_name}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (PKR)</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Paid on</Label>
              <Input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Method</Label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash at office</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. paid via HBL, ref #..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : (isEdit ? <Save className="h-4 w-4 mr-1" /> : <Upload className="h-4 w-4 mr-1" />)}
            {isEdit ? "Save changes" : "Submit proof"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
