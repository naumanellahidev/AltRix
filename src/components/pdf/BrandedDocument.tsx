import { forwardRef, ReactNode } from "react";
import { SchoolDocumentBranding } from "@/hooks/useSchoolDocument";

type Props = {
  school: SchoolDocumentBranding | null | undefined;
  documentTitle: string;
  referenceNumber?: string;
  issuedOn?: string | Date | null;
  children: ReactNode;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  recipientName?: string | null;
  showRecipientSignature?: boolean;
};


/**
 * Reusable branded A4 letterhead. Wraps any document body in a premium school-branded
 * header + footer with print styles. Forwarded ref points at the printable surface,
 * suitable for html2canvas / window.print.
 */
export const BrandedDocument = forwardRef<HTMLDivElement, Props>(function BrandedDocument(
  {
    school,
    documentTitle,
    referenceNumber,
    issuedOn,
    children,
    signatoryName,
    signatoryTitle,
    recipientName,
    showRecipientSignature,
  },
  ref,
) {
  const ref_no = referenceNumber || `DOC-${Date.now().toString(36).toUpperCase()}`;

  return (
    <div
      ref={ref}
      className="branded-doc bg-white text-slate-900 mx-auto shadow-sm"
      style={{ width: "100%", maxWidth: 820, fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      <style>{`
        @page { size: A4; margin: 12mm; }
        .branded-doc { background: #ffffff; color: #0f172a; }
        .branded-doc h1, .branded-doc h2, .branded-doc h3 { font-family: Georgia, 'Times New Roman', serif; }
        @media print {
          .branded-doc { box-shadow: none !important; }
          [data-print="hide"] { display: none !important; }
        }
      `}</style>

      {/* Header band */}
      <header
        className="relative px-10 pt-9 pb-5 border-b-4"
        style={{ borderColor: "hsl(var(--primary))" }}
      >
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: "hsl(var(--primary))" }} />
        <div className="absolute top-0 right-0 h-full w-1/3 opacity-[0.04] pointer-events-none"
             style={{ background: "hsl(var(--primary))" }} />
        <div className="flex items-start justify-between gap-6 relative">
          <div className="flex items-start gap-4">
            {school?.logo_url ? (
              <img src={school.logo_url} alt={school.name} className="h-20 w-20 object-contain" crossOrigin="anonymous" />
            ) : (
              <div
                className="h-20 w-20 rounded-lg flex items-center justify-center text-white text-2xl font-bold"
                style={{ background: "hsl(var(--primary))" }}
              >
                {(school?.name || "S").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight leading-tight">{school?.name || "School"}</h1>
              {school?.motto && (
                <p className="text-[11px] italic text-slate-500 mt-1 tracking-wide">{school.motto}</p>
              )}
              <div className="text-[11px] text-slate-600 mt-2 leading-snug space-y-0.5">
                {school?.address && <p>{school.address}</p>}
                <p>
                  {school?.phone && <span>Tel: {school.phone}</span>}
                  {school?.phone && school?.email && <span> · </span>}
                  {school?.email && <span>{school.email}</span>}
                </p>
                {school?.website && <p className="text-slate-500">{school.website}</p>}
              </div>
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-600 min-w-[180px]">
            <p
              className="font-bold text-slate-800 uppercase tracking-[0.18em] text-xs"
              style={{ color: "hsl(var(--primary))" }}
            >
              {documentTitle}
            </p>
            <p className="mt-2">
              Ref: <span className="font-mono text-slate-800">{ref_no}</span>
            </p>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="px-10 py-7 text-[13px] leading-relaxed">{children}</main>

      {(signatoryName || showRecipientSignature) && (
        <section className="px-10 pb-6">
          <div className="grid grid-cols-2 gap-12 pt-4">
            {signatoryName && (
              <div>
                <div className="border-b border-slate-400 pb-1 mb-2 h-10" />
                <p className="font-semibold text-[13px]">{signatoryName}</p>
                {signatoryTitle && <p className="text-[11px] text-slate-600">{signatoryTitle}</p>}
                <p className="text-[11px] text-slate-500 mt-1">{school?.name}</p>
              </div>
            )}
            {showRecipientSignature && (
              <div>
                <div className="border-b border-slate-400 pb-1 mb-2 h-10" />
                <p className="font-semibold text-[13px]">{recipientName || "Recipient"}</p>
                <p className="text-[11px] text-slate-600">Signature</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Footer — single tagline on the last page, right-aligned */}
      <footer
        className="px-10 py-3 border-t flex items-center justify-end text-[10.5px] text-slate-500"
        style={{ borderColor: "hsl(var(--primary) / 0.4)" }}
      >
        <span>AltRix — School Operating System</span>
      </footer>
    </div>
  );
});
