/**
 * Print, download or share a visitor pass with progress and outcome toasts.
 * Shared by the gate console, the parent's pre-registration and the public
 * self-registration page.
 */
import { toast } from "sonner";

import { describeShare } from "@/lib/documents/deliver";
import {
  type VisitorPassInput,
  downloadVisitorPass,
  printVisitorPass,
  shareVisitorPass,
} from "@/lib/documents/visitor-pass";

export async function visitorPassAction(
  kind: "download" | "print" | "share",
  input: VisitorPassInput,
  phone?: string | null,
): Promise<void> {
  const id = toast.loading("Preparing the pass…");
  try {
    if (kind === "share") {
      const outcome = await shareVisitorPass(input, phone);
      const { tone, message } = describeShare(outcome);
      const note = outcome.warnings.length ? ` Note: ${outcome.warnings.join("; ")}` : "";
      if (tone === "error") toast.error(message + note, { id });
      else if (tone === "info") toast.info(message + note, { id, duration: 9000 });
      else toast.success(message + note, { id });
      return;
    }
    const result: { warnings: string[]; fileName?: string } =
      kind === "print" ? await printVisitorPass(input) : await downloadVisitorPass(input);
    const done = kind === "print" ? "Sent to print" : `Downloaded ${result.fileName}`;
    if (result.warnings.length) toast.warning(`${done}. Note: ${result.warnings.join("; ")}`, { id, duration: 9000 });
    else if (kind === "print") toast.dismiss(id);
    else toast.success(done, { id });
  } catch (e) {
    toast.error(`The pass could not be produced: ${e instanceof Error ? e.message : String(e)}`, { id });
  }
}
