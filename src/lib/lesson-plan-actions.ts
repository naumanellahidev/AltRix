/**
 * Download, print or share a lesson plan with progress and outcome toasts.
 * Shared by the AI curriculum planner and the teacher's lesson planner.
 */
import { toast } from "sonner";

import { describeShare } from "@/lib/documents/deliver";
import {
  type LessonPlanInput,
  downloadLessonPlan,
  printLessonPlan,
  shareLessonPlan,
} from "@/lib/documents/lesson-plan";

export async function lessonPlanAction(kind: "download" | "print" | "share", plan: LessonPlanInput): Promise<void> {
  const id = toast.loading("Preparing the lesson plan…");
  try {
    if (kind === "share") {
      const outcome = await shareLessonPlan(plan);
      const { tone, message } = describeShare(outcome);
      const note = outcome.warnings.length ? ` Note: ${outcome.warnings.join("; ")}` : "";
      if (tone === "error") toast.error(message + note, { id });
      else if (tone === "info") toast.info(message + note, { id, duration: 9000 });
      else toast.success(message + note, { id });
      return;
    }
    const result: { warnings: string[]; fileName?: string } =
      kind === "print" ? await printLessonPlan(plan) : await downloadLessonPlan(plan);
    const done = kind === "print" ? "Sent to print" : `Downloaded ${result.fileName}`;
    if (result.warnings.length) toast.warning(`${done}. Note: ${result.warnings.join("; ")}`, { id, duration: 9000 });
    else if (kind === "print") toast.dismiss(id);
    else toast.success(done, { id });
  } catch (e) {
    toast.error(`The lesson plan could not be produced: ${e instanceof Error ? e.message : String(e)}`, { id });
  }
}
