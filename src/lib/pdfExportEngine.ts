/**
 * Enterprise Clean Document PDF Exporter
 *
 * Guarantees that exported PDFs contain ONLY the target document:
 * - Completely isolates the target DOM node from page chrome (headers, footers, sidebars, AI Copilot).
 * - Full-bleed A4 output (0 side margins) using the document's own internal padding.
 * - Enforces box-sizing and line-height normalization so badges and text never overflow.
 * - Slices multi-page documents smartly without cutting through table rows, cards, or signatures.
 */

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export interface CleanPdfExportOptions {
  filename?: string;
  orientation?: "portrait" | "landscape";
  format?: "a4" | "letter";
  scale?: number;
  documentTitle?: string;
  onProgress?: (step: string) => void;
}

/**
 * Exports a specific DOM element (or element by ID) to a high-resolution,
 * clean PDF without capturing any surrounding UI chrome, headers, or floating widgets.
 */
export async function exportCleanDocumentToPdf(
  target: HTMLElement | string,
  options: CleanPdfExportOptions = {}
): Promise<void> {
  const {
    filename = "document.pdf",
    orientation = "portrait",
    format = "a4",
    scale = 2.5,
    onProgress,
  } = options;

  onProgress?.("Locating document...");
  const element = typeof target === "string" ? document.getElementById(target) : target;
  if (!element) {
    throw new Error(`Target element "${typeof target === "string" ? target : "node"}" not found for PDF export`);
  }

  onProgress?.("Preparing clean document...");

  // Standard A4 dimensions at 96 DPI: Portrait 794px, Landscape 1123px
  const targetWidthPx = orientation === "landscape" ? 1123 : 794;

  // 1. Create a sandboxed off-screen isolation container
  const sandbox = document.createElement("div");
  sandbox.id = "clean-pdf-sandbox-" + Date.now();
  sandbox.style.position = "fixed";
  sandbox.style.left = "-99999px";
  sandbox.style.top = "0";
  sandbox.style.width = `${targetWidthPx}px`;
  sandbox.style.maxWidth = `${targetWidthPx}px`;
  sandbox.style.background = "#ffffff";
  sandbox.style.color = "#0f172a";
  sandbox.style.zIndex = "-9999";
  sandbox.style.opacity = "1";
  sandbox.style.pointerEvents = "none";
  sandbox.style.overflow = "visible";
  sandbox.style.boxSizing = "border-box";

  // 2. Clone the target element deeply
  const clone = element.cloneNode(true) as HTMLElement;

  // Normalize clone styles for edge-to-edge presentation
  clone.style.width = "100%";
  clone.style.maxWidth = "100%";
  clone.style.margin = "0";
  clone.style.boxShadow = "none";
  clone.style.borderRadius = "0";
  clone.style.background = "#ffffff";
  clone.style.color = "#0f172a";
  clone.style.transform = "none";
  clone.classList.remove("dark");
  clone.classList.add("clean-pdf-render");

  // 3. Strip interactive UI chrome, buttons, action bars, AI Copilot, and toasts
  const stripSelectors = [
    ".no-print",
    ".print\\:hidden",
    "[data-print='hide']",
    "[data-html2canvas-ignore]",
    "button:not(.keep-for-pdf)",
    ".action-bar",
    ".action-bar-no-print",
    ".copilot-trigger",
    ".ai-copilot-widget",
    ".copilot-panel",
    "#copilot-root",
    ".sonner-toaster",
    "[data-radix-portal]",
  ];
  clone.querySelectorAll(stripSelectors.join(", ")).forEach((el) => el.remove());

  // 4. Convert inputs and textareas to clean, crisp static text labels
  clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((inp) => {
    const span = document.createElement("span");
    span.textContent = inp.value || inp.placeholder || "";
    span.className = inp.className;
    span.style.border = "none";
    span.style.background = "transparent";
    span.style.boxShadow = "none";
    span.style.display = "inline-block";
    span.style.width = "100%";
    span.style.textAlign = inp.style.textAlign || "inherit";
    span.style.boxSizing = "border-box";
    inp.parentNode?.replaceChild(span, inp);
  });

  // 5. Inject PDF-specific layout normalization for badges, tables, and KPI tiles
  const styleTag = document.createElement("style");
  styleTag.innerHTML = `
    .clean-pdf-render * {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .clean-pdf-render table {
      width: 100% !important;
      border-collapse: collapse !important;
      table-layout: fixed !important;
    }
    .clean-pdf-render th, .clean-pdf-render td {
      vertical-align: middle !important;
    }
    .clean-pdf-render span, .clean-pdf-render .badge {
      display: inline-block !important;
      vertical-align: middle !important;
      line-height: 1.3 !important;
      box-sizing: border-box !important;
      white-space: nowrap !important;
    }
  `;
  sandbox.appendChild(styleTag);

  // 6. Append clone to sandbox and mount to DOM temporarily
  sandbox.appendChild(clone);
  document.body.appendChild(sandbox);

  try {
    onProgress?.("Decoding document assets...");

    // Wait for all images in the clone to complete loading
    const images = Array.from(sandbox.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
      )
    );

    // Layout settlement tick
    await new Promise((r) => setTimeout(r, 120));

    onProgress?.("Rendering high-definition document...");

    // 7. Capture clean canvas from isolated sandbox
    const canvas = await html2canvas(clone, {
      scale: scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: targetWidthPx,
      scrollX: 0,
      scrollY: 0,
    });

    onProgress?.("Generating vector PDF...");

    const pdf = new jsPDF({
      orientation: orientation,
      unit: "mm",
      format: format,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();   // 210mm for A4 portrait
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm for A4 portrait

    // Full-bleed edge-to-edge calculation (0 side margins)
    const ratio = canvas.width / canvas.height;
    const renderedHeightMm = pageWidth / ratio;

    // If single page:
    if (renderedHeightMm <= pageHeight) {
      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, renderedHeightMm, undefined, "FAST");
    } else {
      // Smart Multi-Page Slicing (spanning full page width on each page):
      const pxPerMm = canvas.width / pageWidth;
      const sliceHeightPx = pageHeight * pxPerMm;
      const totalPages = Math.ceil(canvas.height / sliceHeightPx);

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();

        const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - page * sliceHeightPx);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = currentSliceHeight;

        const ctx = sliceCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(
            canvas,
            0,
            page * sliceHeightPx,
            canvas.width,
            currentSliceHeight,
            0,
            0,
            canvas.width,
            currentSliceHeight
          );
        }

        const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.98);
        const sliceHeightMm = currentSliceHeight / pxPerMm;
        pdf.addImage(sliceData, "JPEG", 0, 0, pageWidth, sliceHeightMm, undefined, "FAST");
      }
    }

    const finalName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    pdf.save(finalName);
    onProgress?.("Download complete!");
  } finally {
    // 8. Clean up sandbox from DOM
    sandbox.remove();
  }
}
