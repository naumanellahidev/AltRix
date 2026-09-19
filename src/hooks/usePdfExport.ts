import { useCallback } from "react";

import { renderDomToPdf, type DomPdfResult } from "@/lib/documents/dom-to-pdf";
import { exportCleanDocumentToPdf } from "@/lib/pdfExportEngine";

type ExportOpts = {
  filename: string;
  orientation?: "portrait" | "landscape";
  format?: "a4" | "letter";
  /** PDF title and footer label. */
  title?: string;
  /** School or organisation name for the footer. */
  author?: string;
  onProgress?: (step: string) => void;
};

type PrintOpts = {
  title?: string;
  orientation?: "portrait" | "landscape";
};

function resolve(node: HTMLElement | string | null): HTMLElement | null {
  if (!node) return null;
  return typeof node === "string" ? document.getElementById(node) : node;
}

/** Copy the live values of form fields onto a clone, which cloneNode does not. */
function freezeFormValues(source: HTMLElement, clone: HTMLElement) {
  const from = source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  const to = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  to.forEach((field, i) => {
    const live = from[i];
    if (!live) return;
    if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
      if ((live as HTMLInputElement).checked) field.setAttribute("checked", "");
      else field.removeAttribute("checked");
    } else if (field instanceof HTMLSelectElement) {
      Array.from(field.options).forEach((o, j) => {
        if ((live as HTMLSelectElement).options[j]?.selected) o.setAttribute("selected", "");
        else o.removeAttribute("selected");
      });
    } else if (field instanceof HTMLTextAreaElement) {
      field.textContent = live.value;
    } else {
      field.setAttribute("value", live.value);
    }
  });
}

/**
 * Clean document export and printing.
 *
 * Export draws a vector PDF of the element (see pdfExportEngine). Print uses the
 * browser's own print engine on a copy of the element in an isolated frame —
 * also vector, and the one path that gives the user their printer's options.
 */
export function usePdfExport() {
  const exportNodeToPdf = useCallback(async (node: HTMLElement | string, opts: ExportOpts): Promise<DomPdfResult> => {
    return exportCleanDocumentToPdf(node, {
      filename: opts.filename,
      orientation: opts.orientation || "portrait",
      format: opts.format || "a4",
      documentTitle: opts.title,
      author: opts.author,
      onProgress: opts.onProgress,
    });
  }, []);

  /** Build the PDF and open it in a new tab: a preview that matches the file exactly. */
  const previewNode = useCallback(async (node: HTMLElement | string, opts: Omit<ExportOpts, "filename"> & { filename?: string }) => {
    const element = resolve(node);
    if (!element) throw new Error("Nothing to preview");
    // Opened before the await, so the browser treats it as a response to the
    // click rather than a pop-up to block.
    const tab = window.open("", "_blank");
    try {
      const result = await renderDomToPdf(element, {
        title: opts.title,
        author: opts.author,
        orientation: opts.orientation,
        size: opts.format,
        onProgress: opts.onProgress,
      });
      const url = URL.createObjectURL(result.pdf.output("blob"));
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return result;
    } catch (error) {
      tab?.close();
      throw error;
    }
  }, []);

  const printNode = useCallback(async (node: HTMLElement | string | null, opts: PrintOpts = {}) => {
    const element = resolve(node);
    if (!element) throw new Error("Nothing to print");

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "0",
      opacity: "0",
      pointerEvents: "none",
      zIndex: "-1",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(iframe);

    const styleNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((n) => n.outerHTML)
      .join("\n");

    const clone = element.cloneNode(true) as HTMLElement;
    freezeFormValues(element, clone);
    clone.querySelectorAll(".no-print, [data-print='hide'], [data-html2canvas-ignore], [data-pdf-ignore], button, .action-bar")
      .forEach((el) => el.remove());

    const title = (opts.title ?? document.title).replace(/[<>&"]/g, "");
    const orientation = opts.orientation === "landscape" ? "A4 landscape" : "A4";

    // Only the app's chrome is hidden, by the attributes it carries. The old
    // rule hid every <header> and <footer> — including the letterhead of the
    // document being printed.
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${title}</title>
<base href="${document.baseURI}">
${styleNodes}
<style>
  @page {
    size: ${orientation};
    margin: 16mm 16mm 20mm 18mm;
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt system-ui, sans-serif; color: #64748b; }
    @bottom-left { content: "${title}"; font: 8pt system-ui, sans-serif; color: #64748b; }
  }
  html, body { background: #ffffff !important; color: #0f172a !important; margin: 0; padding: 0; }
  .no-print, [data-print="hide"], [data-html2canvas-ignore], [data-pdf-ignore], .copilot-trigger { display: none !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, img, svg, figure, [data-keep-together] { break-inside: avoid; }
  [data-page-break="before"] { break-before: page; }
  [data-page-break="after"] { break-after: page; }
  h1, h2, h3, h4 { break-after: avoid; }
</style>
</head><body><div id="print-root"></div></body></html>`;

    await new Promise<void>((resolveLoad, rejectLoad) => {
      iframe.onload = () => resolveLoad();
      iframe.onerror = () => rejectLoad(new Error("The print frame could not be prepared"));
      iframe.srcdoc = html;
    });

    const frameDoc = iframe.contentDocument!;
    frameDoc.getElementById("print-root")!.appendChild(frameDoc.adoptNode(clone));

    // Print only once images and fonts are ready: printing earlier produced
    // documents with blank crests and fallback fonts.
    const images = Array.from(frameDoc.images);
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((r) => {
            if (img.complete) return r();
            img.addEventListener("load", () => r(), { once: true });
            img.addEventListener("error", () => r(), { once: true });
            window.setTimeout(r, 8000);
          }),
      ),
    );
    await frameDoc.fonts?.ready?.catch?.(() => undefined);

    const win = iframe.contentWindow!;
    // Removed after the dialog closes, not on a timer: Firefox and Safari
    // return from print() immediately, and removing the frame then prints a
    // blank page.
    const cleanup = () => window.setTimeout(() => iframe.remove(), 500);
    win.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => iframe.isConnected && iframe.remove(), 5 * 60_000);

    win.focus();
    win.print();
  }, []);

  return { exportNodeToPdf, previewNode, printNode };
}
