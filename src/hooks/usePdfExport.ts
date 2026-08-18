import { useCallback } from "react";
import { exportCleanDocumentToPdf, CleanPdfExportOptions } from "@/lib/pdfExportEngine";

type ExportOpts = {
  filename: string;
  orientation?: "portrait" | "landscape";
  format?: "a4" | "letter";
};

/**
 * Hook providing clean document PDF export and printing functions.
 * Guaranteed to export ONLY the target document without headers, footers, or AI Copilot.
 */
export function usePdfExport() {
  const exportNodeToPdf = useCallback(async (node: HTMLElement | string, opts: ExportOpts) => {
    return exportCleanDocumentToPdf(node, {
      filename: opts.filename,
      orientation: opts.orientation || "portrait",
      format: opts.format || "a4",
    });
  }, []);

  const printNode = useCallback(async (node: HTMLElement | string | null) => {
    if (!node) return;
    const element = typeof node === "string" ? document.getElementById(node) : node;
    if (!element) return;

    // Create an isolated iframe for clean native browser printing
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-1";
    document.body.appendChild(iframe);

    const styleNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((n) => n.outerHTML)
      .join("\n");

    const clone = element.cloneNode(true) as HTMLElement;
    // Remove unwanted controls
    clone.querySelectorAll(".no-print, [data-print='hide'], [data-html2canvas-ignore], button, .action-bar").forEach(el => el.remove());

    const html = `<!doctype html><html><head><meta charset="utf-8">
<base href="${document.baseURI}">
${styleNodes}
<style>
  @page { size: A4; margin: 8mm; }
  html, body { background: #ffffff !important; color: #0f172a !important; margin: 0; padding: 0; }
  body { padding: 4mm; font-family: inherit; }
  .no-print, [data-print="hide"], [data-html2canvas-ignore], .copilot-trigger, header, footer, nav, aside { display: none !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
</style>
</head><body><div id="print-root"></div></body></html>`;

    iframe.srcdoc = html;

    iframe.onload = () => {
      const doc = iframe.contentDocument!;
      const root = doc.getElementById("print-root")!;
      root.appendChild(doc.adoptNode(clone));
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 1000);
      }, 300);
    };
  }, []);

  return { exportNodeToPdf, printNode };
}
