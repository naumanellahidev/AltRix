import { RefObject, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Eye, FileDown, Loader2, Printer } from "lucide-react";
import { usePdfExport } from "@/hooks/usePdfExport";
import { toast } from "sonner";

type Props = {
  targetRef: RefObject<HTMLElement>;
  filename: string;
  label?: string;
  /** PDF title and footer label. Defaults to the filename. */
  title?: string;
  /** School or organisation for the footer. */
  author?: string;
  orientation?: "portrait" | "landscape";
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost";
};

/**
 * Print, preview or download the document inside `targetRef`.
 *
 * All three produce real, vector output from the same element: the download and
 * the preview are the identical PDF, and printing goes through the browser's
 * own print engine. Anything that did not make it into the file — a photo that
 * would not load, a name in a script that could not be drawn — is said out
 * loud instead of reported as a clean success.
 */
export function ExportPdfButton({
  targetRef,
  filename,
  label = "Export",
  title,
  author,
  orientation = "portrait",
  size = "default",
  variant = "outline",
}: Props) {
  const { exportNodeToPdf, previewNode, printNode } = usePdfExport();
  const [busy, setBusy] = useState<null | "download" | "preview" | "print">(null);

  const reportWarnings = (warnings: string[], id: string | number) => {
    if (!warnings.length) return false;
    toast.warning(
      warnings.length === 1 ? warnings[0] : `${warnings.length} items could not be included: ${warnings.slice(0, 2).join("; ")}…`,
      { id, duration: 9000 },
    );
    return true;
  };

  const handleDownload = async () => {
    if (!targetRef.current) {
      toast.error("Nothing to export yet — wait for the document to load.");
      return;
    }
    setBusy("download");
    const id = toast.loading("Preparing PDF…");
    try {
      const { pages, warnings } = await exportNodeToPdf(targetRef.current, {
        filename,
        title,
        author,
        orientation,
        onProgress: (step) => toast.loading(step, { id }),
      });
      if (!reportWarnings(warnings, id)) {
        toast.success(`Downloaded ${filename} · ${pages} page${pages === 1 ? "" : "s"}`, { id });
      }
    } catch (e: any) {
      toast.error(e?.message ? `Export failed: ${e.message}` : "Export failed", { id });
    } finally {
      setBusy(null);
    }
  };

  const handlePreview = async () => {
    if (!targetRef.current) {
      toast.error("Nothing to preview yet — wait for the document to load.");
      return;
    }
    setBusy("preview");
    const id = toast.loading("Preparing preview…");
    try {
      const { warnings } = await previewNode(targetRef.current, { title, author, orientation });
      if (!reportWarnings(warnings, id)) toast.dismiss(id);
    } catch (e: any) {
      toast.error(e?.message ? `Preview failed: ${e.message}` : "Preview failed", { id });
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = async () => {
    if (!targetRef.current) {
      toast.error("Nothing to print yet — wait for the document to load.");
      return;
    }
    setBusy("print");
    try {
      await printNode(targetRef.current, { title: title ?? filename.replace(/\.pdf$/i, ""), orientation });
    } catch (e: any) {
      toast.error(e?.message ? `Print failed: ${e.message}` : "Print failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={busy !== null} data-print="hide" aria-busy={busy !== null}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Sharp, searchable A4 document
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handlePrint} disabled={busy !== null}>
          <Printer className="h-4 w-4 mr-2" /> Print
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePreview} disabled={busy !== null}>
          <Eye className="h-4 w-4 mr-2" /> Preview PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownload} disabled={busy !== null}>
          <Download className="h-4 w-4 mr-2" /> Download PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
