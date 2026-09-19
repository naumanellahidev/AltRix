import { DataExportMenu, type ExportFormat } from "@/components/documents/DataExportMenu";
import type { ExportRow, PrintOptions } from "@/lib/report-export";

export interface ReportExportMenuProps {
  /** Base file name, e.g. "fee-defaulters". The title is preferred for the real name. */
  baseName: string;
  /** Tabular rows to export. */
  rows: ExportRow[];
  /** Title, subtitle, summary and further sections for the letterhead. */
  print: Omit<PrintOptions, "rows"> & { rows?: ExportRow[] };
  label?: string;
  disabled?: boolean;
  variant?: "outline" | "soft" | "hero" | "ghost" | "default" | "secondary";
  size?: "sm" | "default" | "lg" | "icon";
  hide?: Partial<Record<"csv" | "excel" | "json" | "print" | "pdf" | "share", boolean>>;
}

/**
 * The export menu every accountant report uses. Now the shared
 * {@link DataExportMenu}: branded Excel, PDF, print and WhatsApp sharing, with
 * files named after their contents.
 */
export function ReportExportMenu({ baseName, rows, print, label, disabled, variant, size, hide }: ReportExportMenuProps) {
  const title = print.title || baseName.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <DataExportMenu
      title={title}
      subtitle={print.subtitle}
      rows={rows.length ? rows : print.rows ?? rows}
      columns={print.columns}
      summary={print.summary}
      sections={print.sections}
      filters={print.filters}
      note={print.note}
      orientation={print.orientation}
      fileNameParts={print.fileNameParts}
      label={label}
      disabled={disabled}
      variant={variant}
      size={size}
      hide={hide as Partial<Record<ExportFormat, boolean>>}
    />
  );
}
