/**
 * Handing a finished document to the person who asked for it.
 *
 * This exists because of a specific failure the audit found in seven places:
 * a generator threw, the catch block showed "Downloaded successfully", and the
 * user went looking in their Downloads folder for a file that had never been
 * created. A toast is not evidence. Nothing here reports success that it did
 * not observe, and every partial result carries its warnings out with it so the
 * caller has to decide what to do about them rather than never hearing.
 */
import JSZip from "jszip";

import type { PdfDocument } from "./document";
import { documentFileName } from "./format";

export interface GenerationWarning {
  /** What the document is, so a warning names something a user recognises. */
  subject: string;
  message: string;
}

export interface GenerationResult {
  ok: boolean;
  filename: string | null;
  /** Produced but imperfect: a missing logo, an unverifiable signature. */
  warnings: GenerationWarning[];
  /** Set when nothing was produced. */
  error: string | null;
}

export function succeeded(filename: string, warnings: GenerationWarning[] = []): GenerationResult {
  return { ok: true, filename, warnings, error: null };
}

export function failed(error: unknown, warnings: GenerationWarning[] = []): GenerationResult {
  return {
    ok: false,
    filename: null,
    warnings,
    error: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Save a document to the user's disk.
 *
 * Resolves only once the download has actually been handed to the browser. If
 * anything fails, it rejects — the caller must not tell the user otherwise.
 */
export function download(doc: PdfDocument, filename?: string): GenerationResult {
  const name = filename ?? doc.filename();
  try {
    const blob = doc.blob();
    if (!blob || blob.size === 0) {
      return failed(new Error("the generated document was empty"));
    }
    triggerDownload(blob, name);
    return succeeded(name);
  } catch (error) {
    return failed(error);
  }
}

/** Put a blob in front of the browser's download machinery. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick: revoking immediately races the download in
  // Safari and the file arrives empty.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Open the document in the browser's print dialog.
 *
 * Printing from a PDF rather than from the page means what prints is what was
 * designed — the same margins, the same page breaks, the same footers — instead
 * of whatever the browser decides to do with the screen layout.
 */
export function print(doc: PdfDocument): GenerationResult {
  try {
    const blob = doc.blob();
    if (!blob || blob.size === 0) {
      return failed(new Error("the generated document was empty"));
    }
    printBlob(blob);
    return succeeded(doc.filename());
  } catch (error) {
    return failed(error);
  }
}

/**
 * Send any finished PDF to the browser's print dialog, from a hidden frame.
 *
 * The frame outlives the dialog: it is removed on a long timer, not straight
 * after print() returns, because Firefox and Safari return immediately and a
 * removed frame prints a blank page.
 */
export function printBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;

  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      // A browser that refuses to drive the frame's print dialog still has the
      // document at the object URL; open it rather than silently doing nothing.
      window.open(url, "_blank", "noopener");
    }
    window.setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 5 * 60_000);
  };

  document.body.appendChild(frame);
}

/** Open the document in a new tab, for a preview that matches the print. */
export function openInTab(doc: PdfDocument): GenerationResult {
  try {
    const blob = doc.blob();
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener");
    if (!opened) {
      URL.revokeObjectURL(url);
      return failed(new Error("the browser blocked the preview window"));
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return succeeded(doc.filename());
  } catch (error) {
    return failed(error);
  }
}

export interface BulkItem<T> {
  subject: T;
  /** A name a person recognises, used in warnings and in the zip. */
  label: string;
}

export interface BulkResult<T> extends GenerationResult {
  produced: number;
  requested: number;
  /** The subjects that could not be produced, and why. */
  failures: Array<{ subject: T; label: string; reason: string }>;
}

export interface BulkOptions<T> {
  items: BulkItem<T>[];
  /** Build one document. Throwing here records a failure for that subject. */
  build: (item: BulkItem<T>, index: number) => Promise<PdfDocument> | PdfDocument;
  /** Base name for the archive. */
  archiveName: string;
  onProgress?: (done: number, total: number, label: string) => void;
  /** Abort a long run. */
  signal?: AbortSignal;
}

/**
 * Generate many documents and deliver them as one archive.
 *
 * Five hundred report cards are not five hundred downloads. They are also not
 * an all-or-nothing operation: if four of them fail, the other four hundred and
 * ninety-six are still worth having — so the archive is produced, and the
 * failures are returned rather than hidden, with a manifest inside naming them
 * so whoever opens the zip a week later can still see what is missing.
 */
export async function generateArchive<T>(options: BulkOptions<T>): Promise<BulkResult<T>> {
  const { items, build, archiveName, onProgress, signal } = options;
  const zip = new JSZip();
  const failures: BulkResult<T>["failures"] = [];
  const warnings: GenerationWarning[] = [];
  const used = new Set<string>();
  let produced = 0;

  for (let index = 0; index < items.length; index += 1) {
    if (signal?.aborted) {
      return {
        ok: false,
        filename: null,
        produced,
        requested: items.length,
        failures,
        warnings,
        error: "cancelled before every document was generated",
      };
    }

    const item = items[index];
    onProgress?.(index, items.length, item.label);

    try {
      const doc = await build(item, index);
      // Named after the person or thing it is about — "Ayesha Khan - Report
      // Card.pdf" — so the files in the archive make sense on their own.
      const label = item.label || `Document ${index + 1}`;
      let name = documentFileName([label], "pdf");
      let suffix = 2;
      while (used.has(name.toLowerCase())) {
        name = documentFileName([label, `(${suffix})`], "pdf");
        suffix += 1;
      }
      used.add(name.toLowerCase());
      zip.file(name, doc.arrayBuffer());
      produced += 1;
    } catch (error) {
      failures.push({
        subject: item.subject,
        label: item.label,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  onProgress?.(items.length, items.length, "");

  if (produced === 0) {
    return {
      ok: false,
      filename: null,
      produced: 0,
      requested: items.length,
      failures,
      warnings,
      error:
        items.length === 0
          ? "there was nothing to generate"
          : "none of the documents could be generated",
    };
  }

  if (failures.length) {
    const manifest = [
      `${archiveName}`,
      `Generated ${new Date().toISOString()}`,
      "",
      `Requested: ${items.length}`,
      `Produced:  ${produced}`,
      `Missing:   ${failures.length}`,
      "",
      "The following could not be generated and are NOT in this archive:",
      ...failures.map((f) => `  - ${f.label}: ${f.reason}`),
      "",
    ].join("\n");
    zip.file("MISSING-DOCUMENTS.txt", manifest);
    warnings.push({
      subject: archiveName,
      message: `${failures.length} of ${items.length} could not be generated; see MISSING-DOCUMENTS.txt in the archive`,
    });
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const filename = documentFileName([archiveName || "Documents"], "zip");
  triggerDownload(blob, filename);

  return {
    ok: true,
    filename,
    produced,
    requested: items.length,
    failures,
    warnings,
    error: null,
  };
}

/**
 * Turn a result into the sentence to show the user.
 *
 * Deliberately not a toast helper: the caller chooses the channel. What this
 * guarantees is that the sentence matches what actually happened.
 */
export function describe(result: GenerationResult | BulkResult<unknown>): {
  tone: "success" | "warning" | "error";
  message: string;
} {
  if (!result.ok) {
    return { tone: "error", message: result.error ?? "the document could not be generated" };
  }

  const bulk = result as BulkResult<unknown>;
  if (typeof bulk.produced === "number" && bulk.produced < bulk.requested) {
    return {
      tone: "warning",
      message: `Generated ${bulk.produced} of ${bulk.requested}. ${bulk.failures.length} could not be produced and are listed inside the archive.`,
    };
  }

  if (result.warnings.length) {
    return {
      tone: "warning",
      message: `Downloaded ${result.filename}, but: ${result.warnings.map((w) => w.message).join("; ")}`,
    };
  }

  return { tone: "success", message: `Downloaded ${result.filename}` };
}

// ─── Sharing ─────────────────────────────────────────────────────────────────

export type ShareOutcome =
  /** The system share sheet took the file (WhatsApp, email, Drive…). */
  | { method: "shared"; fileName: string }
  /** The person closed the share sheet. Not an error. */
  | { method: "cancelled"; fileName: string }
  /**
   * This browser cannot hand a file to another app (most desktop browsers).
   * The file was downloaded and WhatsApp opened with a message, so the person
   * attaches the file they just saved.
   */
  | { method: "downloaded-and-opened-whatsapp"; fileName: string }
  | { method: "failed"; fileName: string; error: string };

/** True where the browser can pass a file straight to WhatsApp and other apps. */
export function canShareFiles(): boolean {
  try {
    const probe = new File([new Blob(["x"])], "probe.pdf", { type: "application/pdf" });
    return typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Share a document — on a phone, straight into WhatsApp.
 *
 * On Android and iOS, and on desktop Chrome and Edge where the system supports
 * it, this opens the share sheet with the file attached; the person picks
 * WhatsApp and a contact, and the parent receives the PDF itself. Where a
 * browser cannot share files, the file is downloaded and WhatsApp opens with
 * a message naming it, and the outcome says so, so the screen can tell the
 * person to attach the file rather than claim it was sent.
 */
export async function shareFile(
  blob: Blob,
  fileName: string,
  options: { title?: string; text?: string; phone?: string | null } = {},
): Promise<ShareOutcome> {
  const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
  const text = options.text ?? options.title ?? fileName;

  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: options.title ?? fileName, text });
      return { method: "shared", fileName };
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return { method: "cancelled", fileName };
      // Fall through to the download route: some browsers advertise file
      // sharing and then refuse particular types.
    }
  }

  try {
    triggerDownload(blob, fileName);
    const digits = (options.phone ?? "").replace(/[^\d]/g, "");
    // Pakistani mobile numbers are stored locally as 03xx…; WhatsApp needs 92…
    const international = digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
    const message = `${text}\n\n(Attached: ${fileName})`;
    const url = `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener");
    return { method: "downloaded-and-opened-whatsapp", fileName };
  } catch (error) {
    return { method: "failed", fileName, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The sentence to show after a share attempt. */
export function describeShare(outcome: ShareOutcome): { tone: "success" | "info" | "error"; message: string } {
  switch (outcome.method) {
    case "shared":
      return { tone: "success", message: `Shared ${outcome.fileName}` };
    case "cancelled":
      return { tone: "info", message: "Sharing cancelled" };
    case "downloaded-and-opened-whatsapp":
      return {
        tone: "info",
        message: `${outcome.fileName} was downloaded and WhatsApp opened — attach the file from your Downloads to send it.`,
      };
    default:
      return { tone: "error", message: `Could not share ${outcome.fileName}: ${outcome.error}` };
  }
}
