import { Download, FileSpreadsheet, FileText, FileJson, Printer, FileDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

import {
  exportCSV,
  exportExcel,
  exportJSON,
  exportPDF,
  printReport,
  type ExportRow,
  type PrintOptions,
} from "@/lib/report-export";

export interface ReportExportMenuProps {
  /** Base file name (without extension/timestamp). */
  baseName: string;
  /** Tabular rows to export. Required for CSV/Excel/JSON. */
  rows: ExportRow[];
  /** Title/subtitle/summary for print + PDF. */
  print: Omit<PrintOptions, "rows"> & { rows?: ExportRow[] };
  /** Optional override label. Defaults to "Export". */
  label?: string;
  /** Disable everything (e.g. while loading). */
  disabled?: boolean;
  /** Button variant. */
  variant?: "outline" | "soft" | "hero" | "ghost" | "default" | "secondary";
  /** Button size. */
  size?: "sm" | "default" | "lg" | "icon";
  /** Hide formats. */
  hide?: Partial<Record<"csv" | "excel" | "json" | "print" | "pdf", boolean>>;
}

/**
 * Unified export & print menu used across every Accountant report.
 * Offers CSV, Excel (.xls), JSON, Print, and Save-as-PDF in one polished dropdown.
 */
export function ReportExportMenu({
  baseName,
  rows,
  print,
  label = "Export",
  disabled,
  variant = "outline",
  size = "sm",
  hide,
}: ReportExportMenuProps) {
  const empty = !rows || rows.length === 0;

  const guard = (fn: () => void) => () => {
    if (empty) {
      toast.error("Nothing to export yet");
      return;
    }
    try {
      fn();
    } catch (err) {
      console.error("[ReportExportMenu] export failed", err);
      toast.error("Export failed");
    }
  };

  const printRows = print.rows ?? rows;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled} className="gap-2">
          <Download className="h-4 w-4" />
          <span>{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          Download
        </DropdownMenuLabel>
        {!hide?.csv && (
          <DropdownMenuItem onClick={guard(() => exportCSV(rows, baseName))}>
            <FileText className="mr-2 h-4 w-4 text-primary" />
            <span className="flex-1">CSV</span>
            <span className="text-[10px] text-muted-foreground">.csv</span>
          </DropdownMenuItem>
        )}
        {!hide?.excel && (
          <DropdownMenuItem onClick={guard(() => exportExcel(rows, baseName, print.title))}>
            <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" />
            <span className="flex-1">Excel</span>
            <span className="text-[10px] text-muted-foreground">.xls</span>
          </DropdownMenuItem>
        )}
        {!hide?.json && (
          <DropdownMenuItem onClick={guard(() => exportJSON(rows, baseName))}>
            <FileJson className="mr-2 h-4 w-4 text-amber-500" />
            <span className="flex-1">JSON</span>
            <span className="text-[10px] text-muted-foreground">.json</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          Print
        </DropdownMenuLabel>
        {!hide?.print && (
          <DropdownMenuItem onClick={guard(() => printReport({ ...print, rows: printRows }))}>
            <Printer className="mr-2 h-4 w-4" />
            <span className="flex-1">Print report</span>
          </DropdownMenuItem>
        )}
        {!hide?.pdf && (
          <DropdownMenuItem onClick={guard(() => exportPDF({ ...print, rows: printRows }))}>
            <FileDown className="mr-2 h-4 w-4 text-destructive" />
            <span className="flex-1">Save as PDF</span>
            <span className="text-[10px] text-muted-foreground">.pdf</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
