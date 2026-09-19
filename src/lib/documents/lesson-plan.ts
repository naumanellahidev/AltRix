/**
 * Lesson plans, as a teacher files them or hands them to a coordinator.
 *
 * Both planners drew the plan straight onto a bare jsPDF page headed "AltRix
 * AI Lesson Plan" — the software's name where the school's should be — with
 * fixed line spacing, so long objectives ran off the right edge and a long
 * schedule step ran into the footer; prior knowledge, materials,
 * differentiation and homework, all on screen, were left out; and the file was
 * "Lesson_Plan_<topic>.pdf" with no class or date.
 *
 * Here it is a document on the school's letterhead: the lesson's particulars,
 * objectives, prior knowledge and materials, the schedule as a table that
 * repeats its header across pages, differentiation, homework, and the slide
 * script, with lines for the teacher and the coordinator who reviews it.
 */
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { type PdfDocument, createDocumentAsync } from "./document";
import { print as printPdf, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { date as formatDate, documentFileName } from "./format";
import { drawTable } from "./table";

export interface LessonStep {
  timeRange?: string | null;
  phase?: string | null;
  teacherAction?: string | null;
  studentAction?: string | null;
}

export interface LessonSlide {
  slideNumber?: number | string | null;
  title?: string | null;
  bulletPoints?: string[] | null;
  visualSuggestion?: string | null;
  speakerNotes?: string | null;
}

export interface LessonPlanInput {
  title: string;
  subject?: string | null;
  classLabel?: string | null;
  curriculum?: string | null;
  gradeLevel?: string | null;
  durationMinutes?: number | null;
  blooms?: string[] | null;
  teacherName?: string | null;
  /** YYYY-MM-DD the lesson is planned for. */
  date?: string | null;
  objectives?: string[] | null;
  priorKnowledge?: string[] | null;
  materials?: string[] | null;
  schedule?: LessonStep[] | null;
  differentiation?: { advanced?: string | null; struggling?: string | null; ell?: string | null } | null;
  homework?: string | null;
  slides?: LessonSlide[] | null;
}

const clean = (list: Array<string | null | undefined> | null | undefined) =>
  (list ?? []).map((s) => (s ?? "").trim()).filter(Boolean);

export async function buildLessonPlan(
  plan: LessonPlanInput,
  options: { brand?: SchoolBrand } = {},
): Promise<{ doc: PdfDocument; fileName: string; warnings: string[] }> {
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];
  const title = plan.title.trim() || "Lesson plan";

  const doc = await createDocumentAsync({
    title: "Lesson Plan",
    subtitle: title,
    school: {
      name: brand.name ?? "",
      address: brand.address,
      phone: brand.phone,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: [plan.classLabel, plan.subject].filter(Boolean).join(" · ") || title,
  });

  // The topic in full: a field would cut a long one short.
  doc.text(title, { style: "bold", size: doc.theme.size.body + 2, color: doc.theme.accent, spaceAfter: 2 });
  doc.fields(
    [
      { label: "Subject", value: plan.subject },
      { label: "Class", value: plan.classLabel },
      { label: "Date", value: plan.date ? formatDate(plan.date) : null },
      { label: "Duration", value: plan.durationMinutes ? `${plan.durationMinutes} minutes` : null },
      { label: "Teacher", value: plan.teacherName },
      { label: "Curriculum", value: plan.curriculum },
      { label: "Grade level", value: plan.gradeLevel },
      { label: "Bloom's levels", value: clean(plan.blooms).join(", ") || null },
    ],
    3,
  );
  doc.advance(1);

  const list = (heading: string, items: string[]) => {
    if (!items.length) return;
    doc.sectionTitle(heading);
    items.forEach((item, i) => doc.text(`${i + 1}. ${item}`, { spaceAfter: 0.8 }));
    doc.advance(1.5);
  };
  list("Learning objectives", clean(plan.objectives));
  list("Prior knowledge", clean(plan.priorKnowledge));
  list("Materials", clean(plan.materials));

  const steps = (plan.schedule ?? []).filter((s) => s && (s.phase || s.teacherAction || s.studentAction));
  if (steps.length) {
    doc.sectionTitle("Lesson schedule");
    drawTable(doc, {
      columns: [
        { header: "Time", width: 0.8, bold: () => true, value: (s: LessonStep) => s.timeRange ?? "" },
        { header: "Phase", width: 1, bold: () => true, value: (s: LessonStep) => s.phase ?? "" },
        { header: "Teacher", width: 2.4, value: (s: LessonStep) => s.teacherAction ?? "" },
        { header: "Students", width: 2.4, value: (s: LessonStep) => s.studentAction ?? "" },
      ],
      rows: steps,
      fontSize: 8.5,
    });
    doc.advance(2);
  }

  const diff = plan.differentiation ?? {};
  const diffRows = (
    [
      ["Stretch (advanced learners)", diff.advanced],
      ["Support (students who need help)", diff.struggling],
      ["English language learners", diff.ell],
    ] as Array<[string, string | null | undefined]>
  ).filter(([, v]) => v && v.trim());
  if (diffRows.length) {
    doc.sectionTitle("Differentiation");
    drawTable(doc, {
      columns: [
        { header: "For", width: 1, bold: () => true, value: (r: [string, string | null | undefined]) => r[0] },
        { header: "Strategy", width: 2.6, value: (r: [string, string | null | undefined]) => (r[1] ?? "").trim() },
      ],
      rows: diffRows,
      accentHeader: false,
    });
    doc.advance(2);
  }

  if (plan.homework?.trim()) {
    doc.sectionTitle("Homework");
    doc.text(plan.homework.trim(), { spaceAfter: 2 });
  }

  const slides = (plan.slides ?? []).filter((s) => s && (s.title || clean(s.bulletPoints).length));
  if (slides.length) {
    doc.sectionTitle("Slide script");
    slides.forEach((slide, i) => {
      doc.ensureSpace(22);
      doc.text(`Slide ${slide.slideNumber ?? i + 1}${slide.title ? ` — ${slide.title}` : ""}`, { style: "bold", spaceAfter: 1 });
      clean(slide.bulletPoints).forEach((bp) => doc.text(`•  ${bp}`, { size: doc.theme.size.small, spaceAfter: 0.4 }));
      if (slide.visualSuggestion?.trim()) {
        doc.text(`Visual: ${slide.visualSuggestion.trim()}`, { size: doc.theme.size.small, style: "italic", color: doc.theme.inkMuted, spaceAfter: 0.4 });
      }
      if (slide.speakerNotes?.trim()) {
        doc.text(`Speaker notes: ${slide.speakerNotes.trim()}`, { size: doc.theme.size.small, color: doc.theme.inkMuted });
      }
      doc.advance(2.5);
    });
  }

  if (!clean(plan.objectives).length && !steps.length) warnings.push("the plan has no objectives or schedule yet");

  doc.signatures([
    { title: "Teacher", name: plan.teacherName ?? null },
    { title: "Reviewed by (Coordinator)" },
  ]);

  for (const lost of doc.unprintableText) warnings.push(`"${lost}" could not be printed`);
  const fileName = documentFileName(
    [plan.classLabel, plan.subject, title, "Lesson Plan", plan.date ? formatDate(plan.date) : null],
    "pdf",
  );
  return { doc, fileName, warnings };
}

export async function downloadLessonPlan(plan: LessonPlanInput) {
  const { doc, fileName, warnings } = await buildLessonPlan(plan);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

export async function printLessonPlan(plan: LessonPlanInput) {
  const { doc, warnings } = await buildLessonPlan(plan);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the lesson plan could not be sent to the printer");
  return { warnings };
}

export async function shareLessonPlan(plan: LessonPlanInput): Promise<ShareOutcome & { warnings: string[] }> {
  const { doc, fileName, warnings } = await buildLessonPlan(plan);
  const outcome = await shareFile(doc.blob(), fileName, { title: `Lesson plan — ${plan.title}` });
  return { ...outcome, warnings };
}
