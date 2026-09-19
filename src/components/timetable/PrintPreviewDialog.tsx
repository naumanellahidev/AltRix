import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { describeShare } from "@/lib/documents";
import { downloadTimetable, printTimetable, shareTimetable, type TimetableInput } from "@/lib/documents/timetable";
import { PeriodTimetableGrid, type PeriodTimetableEntry } from "@/components/timetable/PeriodTimetableGrid";

type Period = {
  id: string;
  label: string;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
};

export function PrintPreviewDialog({
  open,
  onOpenChange,
  headerTitle,
  headerSubtitle,
  periods,
  entries,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headerTitle: string;
  headerSubtitle?: string | null;
  periods: Period[];
  entries: PeriodTimetableEntry[];
}) {
  // Print, download and share the same A4 PDF. Printing used to call
  // window.print() on the whole application behind this dialog.
  const run = async (kind: "print" | "download" | "share") => {
    const input: TimetableInput = {
      title: "Class Timetable",
      subject: headerSubtitle || "All sections",
      periods,
      entries: entries.map((e) => ({
        day_of_week: e.day_of_week,
        period_id: e.period_id,
        subject_name: e.subject_name ?? null,
        room: e.room ?? null,
        teacher_name: e.teacher_name ?? null,
      })),
      cellDetail: "teacher",
    };
    const id = toast.loading("Preparing timetable…");
    try {
      if (kind === "share") {
        const outcome = await shareTimetable(input);
        const { tone, message } = describeShare(outcome);
        if (tone === "error") toast.error(message, { id });
        else if (tone === "success") toast.success(message, { id });
        else toast.info(message, { id, duration: 9000 });
        return;
      }
      const result: { warnings: string[]; fileName?: string } =
        kind === "print" ? await printTimetable(input) : await downloadTimetable(input);
      const done = kind === "print" ? "Sent to print" : `Downloaded ${result.fileName}`;
      if (result.warnings.length) toast.warning(`${done}. Note: ${result.warnings.join("; ")}`, { id, duration: 9000 });
      else if (kind === "print") toast.dismiss(id);
      else toast.success(done, { id });
    } catch (e) {
      toast.error(`The timetable could not be produced: ${e instanceof Error ? e.message : String(e)}`, { id });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Print preview</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl border bg-surface p-4">
            <p className="font-display text-xl">{headerTitle}</p>
            {headerSubtitle ? <p className="text-sm text-muted-foreground">{headerSubtitle}</p> : null}
          </div>

          <div className="print-area">
            <PeriodTimetableGrid periods={periods} entries={entries} printable density="compact" stickyDayColumn={false} />
          </div>
        </div>

        <DialogFooter className="no-print gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={() => run("share")} className="gap-1.5">
            <MessageCircle className="h-4 w-4 text-green-600" /> WhatsApp
          </Button>
          <Button variant="outline" onClick={() => run("download")} className="gap-1.5">
            <Download className="h-4 w-4" /> Download PDF
          </Button>
          <Button variant="hero" onClick={() => run("print")} className="gap-1.5">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
