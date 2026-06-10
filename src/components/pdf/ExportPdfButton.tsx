import { RefObject, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileDown, Printer, Loader2 } from "lucide-react";
import { usePdfExport } from "@/hooks/usePdfExport";
import { toast } from "sonner";

type Props = {
  targetRef: RefObject<HTMLElement>;
  filename: string;
  label?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost";
};

/**
 * Dropdown: "Print / Save as PDF" (uses native dialog) and "Download .pdf"
 * (uses html2canvas-pro + jspdf). Both render the SAME DOM, so output stays
 * visually identical to the on-screen letterhead.
 */
export function ExportPdfButton({
  targetRef,
  filename,
  label = "Export",
  size = "default",
  variant = "outline",
}: Props) {
  const { exportNodeToPdf, printNode } = usePdfExport();
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    if (!targetRef.current) {
      toast.error("Nothing to export");
      return;
    }
    setBusy(true);
    try {
      await exportNodeToPdf(targetRef.current, { filename });
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = async () => {
    if (!targetRef.current) {
      toast.error("Nothing to print");
      return;
    }
    setBusy(true);
    try {
      await printNode(targetRef.current);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={busy} data-print="hide">
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handlePrint} disabled={busy}>
          <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownload} disabled={busy}>
          <Download className="h-4 w-4 mr-2" /> Download .pdf
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
