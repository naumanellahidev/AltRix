/**
 * Print, download or share a weekly timetable as a PDF on the school's
 * letterhead. Replaces window.print(), which printed the whole application —
 * sidebar, header and all — around the grid.
 */
import { useState } from "react";
import { Download, Loader2, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { describeShare } from "@/lib/documents/deliver";
import {
  type TimetableInput,
  downloadTimetable,
  printTimetable,
  shareTimetable,
} from "@/lib/documents/timetable";

export function TimetableDocumentActions({
  input,
  disabled,
  size = "sm",
}: {
  /** Built on demand, so the latest data is printed. */
  input: () => TimetableInput;
  disabled?: boolean;
  size?: "sm" | "default";
}) {
  const [busy, setBusy] = useState<null | "print" | "download" | "share">(null);

  const run = async (kind: "print" | "download" | "share") => {
    setBusy(kind);
    const id = toast.loading("Preparing the timetable…");
    try {
      const data = input();
      if (kind === "share") {
        const outcome = await shareTimetable(data);
        const { tone, message } = describeShare(outcome);
        const note = outcome.warnings.length ? ` Note: ${outcome.warnings.join("; ")}` : "";
        if (tone === "error") toast.error(message + note, { id });
        else if (tone === "info") toast.info(message + note, { id, duration: 9000 });
        else toast.success(message + note, { id });
        return;
      }
      const result: { warnings: string[]; fileName?: string } =
        kind === "print" ? await printTimetable(data) : await downloadTimetable(data);
      const done = kind === "print" ? "Sent to print" : `Downloaded ${result.fileName}`;
      if (result.warnings.length) toast.warning(`${done}. Note: ${result.warnings.join("; ")}`, { id, duration: 9000 });
      else if (kind === "print") toast.dismiss(id);
      else toast.success(done, { id });
    } catch (e) {
      toast.error(`The timetable could not be produced: ${e instanceof Error ? e.message : String(e)}`, { id });
    } finally {
      setBusy(null);
    }
  };

  const items = [
    ["share", MessageCircle, "WhatsApp"],
    ["download", Download, "PDF"],
    ["print", Printer, "Print"],
  ] as const;

  return (
    <>
      {items.map(([kind, Icon, label]) => (
        <Button key={kind} variant="outline" size={size} disabled={disabled || !!busy} onClick={() => run(kind)}>
          {busy === kind ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Icon className="mr-1 h-4 w-4" />}
          {label}
        </Button>
      ))}
    </>
  );
}
