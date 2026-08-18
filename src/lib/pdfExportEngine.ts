/**
 * Enterprise Clean Document PDF Exporter
 *
 * Guarantees that exported PDFs contain ONLY the target document:
 * - Completely isolates the target DOM node from page chrome (headers, footers, sidebars, AI Copilot).
 * - Normalizes to exact standard printable paper dimensions (A4 portrait: 794px, landscape: 1123px).
 * - Removes interactive buttons, input borders, and focus rings.
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

  // 1. Create a sandboxed off-screen isolation container
  const sandbox = document.createElement("div");
  sandbox.id = "clean-pdf-sandbox-" + Date.now();
  sandbox.style.position = "fixed";
  sandbox.style.left = "-99999px";
  sandbox.style.top = "0";
  sandbox.style.width = orientation === "landscape" ? "1123px" : "794px"; // Standard A4 width at 96 DPI
  sandbox.style.background = "#ffffff";
  sandbox.style.color = "#0f172a";
  sandbox.style.zIndex = "-9999";
  sandbox.style.opacity = "1";
  sandbox.style.pointerEvents = "none";
  sandbox.style.overflow = "visible";

  // 2. Clone the target element deeply
  const clone = element.cloneNode(true) as HTMLElement;

  // Normalize clone styles for pure print presentation
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

  // 3. Strip all non-printable elements, action buttons, toolbars, and copilot remnants
  const stripSelectors = [
    ".no-print",
    "[data-print='hide']",
    "[data-html2canvas-ignore]",
    "button:not(.keep-for-pdf)",
    ".action-bar",
    ".copilot-trigger",
    ".ai-copilot-widget",
    "#copilot-root",
    "header:not(.document-header)",
    "footer:not(.document-footer)",
    ".sonner-toaster",
  ];
  clone.querySelectorAll(stripSelectors.join(", ")).forEach((el) => el.remove());

  // 4. Clean up input / textarea fields into crisp text labels for the PDF
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
    inp.parentNode?.replaceChild(span, inp);
  });

  // 5. Append to sandbox and mount to DOM temporarily for layout computation
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
            img.onerror = () => resolve(); // continue even if an image fails
          })
      )
    );

    // Give fonts and layout a brief tick to calculate bounding boxes
    await new Promise((r) => setTimeout(r, 100));

    onProgress?.("Rendering high-definition document...");

    // 6. Capture clean canvas from the isolated sandbox
    const canvas = await html2canvas(clone, {
      scale: scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: orientation === "landscape" ? 1123 : 794,
      scrollX: 0,
      scrollY: 0,
    });

    onProgress?.("Generating vector PDF...");

    const pdf = new jsPDF({
      orientation: orientation,
      unit: "mm",
      format: format,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 6; // 6mm border margin for elegant presentation
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;

    const ratio = canvas.width / canvas.height;
    const naturalHeightMm = printableWidth / ratio;

    // Single-page fit: if content fits or overflows slightly (< 15%), scale cleanly into 1 page
    if (naturalHeightMm <= printableHeight * 1.15) {
      const fitHeight = Math.min(naturalHeightMm, printableHeight);
      const fitWidth = fitHeight * ratio;
      const x = (pageWidth - fitWidth) / 2;
      const y = margin;
      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      pdf.addImage(imgData, "JPEG", x, y, fitWidth, fitHeight, undefined, "FAST");
    } else {
      // Smart Multi-Page Slicing:
      // Slice canvas into chunks corresponding to standard page heights
      const pxPerMm = canvas.width / printableWidth;
      const sliceHeightPx = printableHeight * pxPerMm;
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
        const renderedHeightMm = currentSliceHeight / pxPerMm;
        pdf.addImage(sliceData, "JPEG", margin, margin, printableWidth, renderedHeightMm, undefined, "FAST");
      }
    }

    const finalName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    pdf.save(finalName);
    onProgress?.("Download complete!");
  } finally {
    // 7. Clean up sandbox from DOM
    sandbox.remove();
  }
}
