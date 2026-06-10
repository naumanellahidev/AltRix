import { forwardRef } from "react";
import { BrandedDocument } from "@/components/pdf/BrandedDocument";
import { SchoolDocumentBranding } from "@/hooks/useSchoolDocument";

type Posting = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: string;
  status: string;
  openings: number;
  description: string | null;
  requirements: string | null;
  posted_at: string;
  closes_at: string | null;
};

type Props = {
  school: SchoolDocumentBranding | null;
  posting: Posting;
  applyEmail?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  contract: "Contract",
  internship: "Internship",
  intern: "Internship",
};

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }) : "—";

export const RecruitmentPostingDocument = forwardRef<HTMLDivElement, Props>(function RecruitmentPostingDocument(
  { school, posting, applyEmail, signatoryName, signatoryTitle },
  ref,
) {
  const requirements = (posting.requirements || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <BrandedDocument
      ref={ref}
      school={school}
      documentTitle="Career Opportunity"
      referenceNumber={`JOB-${posting.id.slice(0, 8).toUpperCase()}`}
      issuedOn={posting.posted_at}
      signatoryName={signatoryName || "HR Department"}
      signatoryTitle={signatoryTitle || "Human Resources"}
    >
      {/* Title block */}
      <div className="text-center mb-6">
        <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">We are hiring</p>
        <h2
          className="text-3xl font-bold mt-2"
          style={{ color: "hsl(var(--primary))" }}
        >
          {posting.title}
        </h2>
        <p className="text-sm text-slate-600 mt-2">
          {[posting.department, posting.location, TYPE_LABEL[posting.employment_type] || posting.employment_type]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </div>

      {/* Quick facts */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          ["Department", posting.department || "—"],
          ["Location", posting.location || "—"],
          ["Type", TYPE_LABEL[posting.employment_type] || posting.employment_type],
          ["Openings", String(posting.openings)],
          ["Posted On", fmt(posting.posted_at)],
          ["Apply By", posting.closes_at ? fmt(posting.closes_at) : "Open until filled"],
          ["Status", posting.status.toUpperCase()],
          ["Reference", `JOB-${posting.id.slice(0, 8).toUpperCase()}`],
        ].map(([k, v]) => (
          <div key={k as string} className="border border-slate-200 rounded p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p>
            <p className="text-[12.5px] font-semibold text-slate-800 mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      {posting.description && (
        <section className="mb-5">
          <h3
            className="text-sm font-bold uppercase tracking-wider mb-2 pb-1 border-b-2"
            style={{ borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" }}
          >
            About the Role
          </h3>
          <p className="whitespace-pre-wrap text-[13px]">{posting.description}</p>
        </section>
      )}

      {requirements.length > 0 && (
        <section className="mb-5">
          <h3
            className="text-sm font-bold uppercase tracking-wider mb-2 pb-1 border-b-2"
            style={{ borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" }}
          >
            Requirements
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-[13px]">
            {requirements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-5">
        <h3
          className="text-sm font-bold uppercase tracking-wider mb-2 pb-1 border-b-2"
          style={{ borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" }}
        >
          How to Apply
        </h3>
        <p className="text-[13px]">
          Interested candidates are encouraged to submit a comprehensive CV along with relevant
          credentials and references {applyEmail || school?.email ? (
            <>
              to <span className="font-semibold">{applyEmail || school?.email}</span>
            </>
          ) : (
            "via the school's official HR channel"
          )}
          {posting.closes_at && (
            <> by <span className="font-semibold">{fmt(posting.closes_at)}</span></>
          )}
          . Only shortlisted applicants will be contacted for interview.
        </p>
      </section>

      <p className="text-[12px] italic text-slate-600 mt-6 border-t border-slate-200 pt-3">
        {school?.name || "We"} {school?.name ? "is " : ""}an equal-opportunity employer. We celebrate
        diversity and are committed to creating an inclusive environment for all employees.
      </p>
    </BrandedDocument>
  );
});
