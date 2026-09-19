/**
 * Student ID cards for the admissions, directory and card screens.
 *
 * Kept under the names those screens import. Cards are now vector PDF sheets
 * built by `src/lib/documents/id-card.ts` — real card size, crop marks,
 * duplex-ready backs, QR codes drawn locally (they used to be fetched from a
 * third-party service with the child's details in the URL), photos through
 * signed URLs, and no placeholder text.
 *
 * Several screens call this with `void`, so it reports its own outcome on
 * screen and never rejects: a card that could not be produced says so.
 */
import { toast } from "sonner";

import type { SupabaseClient } from "@/lib/api";
import {
  buildIdCardSheets,
  loadActiveSchoolBrand,
  type IdCardSettings,
  type IdCardStudent,
} from "@/lib/documents";
import { printBlob, triggerDownload } from "@/lib/documents/deliver";

export type StudentForCard = IdCardStudent;

export type CardSettings = IdCardSettings & {
  id?: string;
  school_id: string;
};

export const DEFAULT_CARD_SETTINGS = (schoolId: string): CardSettings => ({
  school_id: schoolId,
  card_layout: "vertical",
  primary_color: "#ea580c",
  text_color: "#ffffff",
  // Empty until the school writes one. A placeholder here used to be printed
  // on every card as "SCHOOL TAGLINE".
  card_title: "",
  show_logo: true,
  show_qr_code: true,
  show_roll_number: true,
  show_class: true,
  show_dob: true,
  show_blood_group: true,
  show_emergency_contact: true,
  show_signature: false,
  signature_text: "Authorized Signature",
  design_style: "modern",
});

export interface CardRunResult {
  ok: boolean;
  fileName: string | null;
  warnings: string[];
  error: string | null;
}

async function settingsFor(api: SupabaseClient, schoolId: string): Promise<CardSettings> {
  const { data } = await api.from("school_id_card_settings").select("*").eq("school_id", schoolId).maybeSingle();
  return data ? ({ ...DEFAULT_CARD_SETTINGS(schoolId), ...(data as Partial<CardSettings>) } as CardSettings) : DEFAULT_CARD_SETTINGS(schoolId);
}

async function run(
  api: SupabaseClient,
  schoolId: string,
  students: StudentForCard[],
  mode: "print" | "download",
  label?: string | null,
): Promise<CardRunResult> {
  if (students.length === 0) {
    toast.error("Select at least one student to make a card for.");
    return { ok: false, fileName: null, warnings: [], error: "no students selected" };
  }
  const id = toast.loading(`Preparing ${students.length} ID card${students.length === 1 ? "" : "s"}…`);
  try {
    const [settings, brand] = await Promise.all([settingsFor(api, schoolId), loadActiveSchoolBrand(schoolId)]);
    const { pdf, fileName, sheets, warnings } = await buildIdCardSheets(students, settings, { brand, label });
    const blob = pdf.output("blob");
    if (mode === "print") printBlob(blob);
    else triggerDownload(blob, fileName);

    const done = mode === "print" ? `Sent ${students.length} card${students.length === 1 ? "" : "s"} to print (${sheets} sheets, front and back)` : `Downloaded ${fileName}`;
    if (warnings.length) toast.warning(`${done}. Note: ${warnings.join("; ")}`, { id, duration: 10000 });
    else toast.success(done, { id });
    return { ok: true, fileName, warnings, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    toast.error(`ID cards could not be produced: ${message}`, { id });
    return { ok: false, fileName: null, warnings: [], error: message };
  }
}

/** Print cards for the given students. The logo and name arguments are kept for existing callers; the school's own record is used. */
export async function printStudentCards(
  api: SupabaseClient,
  schoolId: string,
  students: StudentForCard[],
  _schoolLogo?: string | null,
  _schoolName?: string,
  label?: string | null,
): Promise<CardRunResult> {
  return run(api, schoolId, students, "print", label);
}

/** Download cards as a PDF, to send to a card printer. */
export async function downloadStudentCards(
  api: SupabaseClient,
  schoolId: string,
  students: StudentForCard[],
  label?: string | null,
): Promise<CardRunResult> {
  return run(api, schoolId, students, "download", label);
}
