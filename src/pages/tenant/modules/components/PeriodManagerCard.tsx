import { useMemo, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Coffee, Pencil, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export type PeriodRow = {
  id: string;
  label: string;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
  is_break: boolean;
};

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const periodSchema = z
  .object({
    label: z.string().trim().min(1, "Label is required").max(40, "Keep labels under 40 characters"),
    sort_order: z.coerce.number().int().min(1, "Sort order must be 1 or higher"),
    start_time: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => !v || timeRegex.test(v), "Use HH:MM"),
    end_time: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => !v || timeRegex.test(v), "Use HH:MM"),
    is_break: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const hasStart = Boolean(v.start_time);
    const hasEnd = Boolean(v.end_time);
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start and end time must both be set",
        path: [hasStart ? "end_time" : "start_time"],
      });
    }
    if (v.start_time && v.end_time && v.start_time >= v.end_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End time must be after start time",
        path: ["end_time"],
      });
    }
  });

type PeriodFormValues = z.infer<typeof periodSchema>;

function normalizeTimeToInput(v: string | null) {
  if (!v) return "";
  // Postgres time may come back as HH:MM:SS; keep input as HH:MM
  return String(v).slice(0, 5);
}

export function PeriodManagerCard({
  schoolId,
  userId,
  periods,
  onChanged,
}: {
  schoolId: string | null;
  userId: string | null;
  periods: PeriodRow[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PeriodRow | null>(null);
  const [busy, setBusy] = useState(false);

  const sortedPeriods = useMemo(
    () => periods.slice().sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)),
    [periods],
  );

  const form = useForm<PeriodFormValues>({
    resolver: zodResolver(periodSchema),
    defaultValues: { label: "", sort_order: 1, start_time: "", end_time: "", is_break: false },
  });

  const openCreate = () => {
    setEditing(null);
    const nextSort = (sortedPeriods.at(-1)?.sort_order ?? 0) + 1;
    form.reset({ label: "", sort_order: nextSort, start_time: "", end_time: "", is_break: false });
    setOpen(true);
  };

  const openEdit = (p: PeriodRow) => {
    setEditing(p);
    form.reset({
      label: p.label,
      sort_order: p.sort_order,
      start_time: normalizeTimeToInput(p.start_time),
      end_time: normalizeTimeToInput(p.end_time),
      is_break: p.is_break,
    });
    setOpen(true);
  };

  const submit = async (values: PeriodFormValues) => {
    if (!schoolId) return;

    const normalizedLabel = values.label.trim();
    const labelLower = normalizedLabel.toLowerCase();
    const duplicate = sortedPeriods.some(
      (p) => p.id !== editing?.id && p.label.trim().toLowerCase() === labelLower,
    );
    if (duplicate) return toast.error("A period with that label already exists.");

    setBusy(true);
    try {
      const payload = {
        school_id: schoolId,
        label: normalizedLabel,
        sort_order: values.sort_order,
        start_time: values.start_time ? values.start_time : null,
        end_time: values.end_time ? values.end_time : null,
        is_break: values.is_break,
      } as const;

      const q = editing
        ? supabase.from("timetable_periods").update(payload).eq("id", editing.id).eq("school_id", schoolId)
        : supabase.from("timetable_periods").insert(payload);

      const { error } = await q;
      if (error) return toast.error(error.message);

      toast.success(editing ? "Period updated" : "Period created");
      setOpen(false);
      setEditing(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const safeDelete = async (p: PeriodRow) => {
    if (!schoolId) return;
    if (!confirm(`Delete period “${p.label}”? This cannot be undone.`)) return;

    setBusy(true);
    try {
      const { count, error: countErr } = await supabase
        .from("timetable_entries")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("period_id", p.id);

      if (countErr) return toast.error(countErr.message);
      if ((count ?? 0) > 0) {
        return toast.error("This period is used in the timetable grid. Clear those slots first, then delete.");
      }

      const { error } = await supabase.from("timetable_periods").delete().eq("school_id", schoolId).eq("id", p.id);
      if (error) return toast.error(error.message);

      toast.success("Period deleted");
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="shadow-elevated">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="font-display text-lg">Periods</CardTitle>
          <p className="text-sm text-muted-foreground">Define your daily periods (order + optional time range).</p>
        </div>
        <Button variant="hero" onClick={openCreate} disabled={!schoolId || busy}>
          <Plus className="mr-2 h-4 w-4" /> Add period
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto rounded-2xl border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPeriods.map((p) => (
                <TableRow key={p.id} className={p.is_break ? "bg-accent/30" : ""}>
                  <TableCell className="text-muted-foreground">{p.sort_order}</TableCell>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {p.is_break && <Coffee className="h-4 w-4 text-muted-foreground" />}
                      {p.label}
                      {p.is_break && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">Break</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.start_time && p.end_time ? `${normalizeTimeToInput(p.start_time)}–${normalizeTimeToInput(p.end_time)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} disabled={!schoolId || busy}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void safeDelete(p)}
                        disabled={!schoolId || busy}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {sortedPeriods.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No periods yet. Add your first period to start building timetables.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit period" : "Add period"}</DialogTitle>
            <DialogDescription>Set the display label, order, and optional time range.</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="period-label">Label</Label>
                <Input id="period-label" placeholder="Period 1" {...form.register("label")} />
                {form.formState.errors.label && (
                  <p className="text-xs text-destructive">{form.formState.errors.label.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="period-order">Sort order</Label>
                <Input id="period-order" type="number" inputMode="numeric" min={1} {...form.register("sort_order")} />
                {form.formState.errors.sort_order && (
                  <p className="text-xs text-destructive">{form.formState.errors.sort_order.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="period-start">Start time</Label>
                <Input id="period-start" placeholder="08:00" {...form.register("start_time")} />
                {form.formState.errors.start_time && (
                  <p className="text-xs text-destructive">{form.formState.errors.start_time.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="period-end">End time</Label>
                <Input id="period-end" placeholder="08:45" {...form.register("end_time")} />
                {form.formState.errors.end_time && (
                  <p className="text-xs text-destructive">{form.formState.errors.end_time.message}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-accent/30 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="is-break" className="font-medium">Break period</Label>
                <p className="text-xs text-muted-foreground">Mark as break (recess, lunch) – spans all sections</p>
              </div>
              <Switch
                id="is-break"
                checked={form.watch("is_break")}
                onCheckedChange={(v) => form.setValue("is_break", v)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="hero" disabled={busy || !schoolId}>
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
