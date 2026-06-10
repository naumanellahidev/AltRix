import { forwardRef } from "react";

type Props = {
  school: any;
  contract: any;
  employeeName: string;
  employeeEmail?: string | null;
};

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }) : "—";

const fmtMoney = (amt?: number | null, cur?: string | null) => {
  if (amt == null) return null;
  return `${cur || "PKR"} ${Number(amt).toLocaleString()}`;
};

const TYPE_LABEL: Record<string, string> = {
  full_time: "Full-Time", part_time: "Part-Time", contract: "Contract",
  intern: "Internship", probation: "Probation",
};

export const ContractLetterhead = forwardRef<HTMLDivElement, Props>(
  ({ school, contract, employeeName, employeeEmail }, ref) => {
    const c = contract;
    const salary = fmtMoney(c.salary_amount, c.salary_currency);

    return (
      <div ref={ref} className="letterhead bg-white text-slate-900 mx-auto" style={{ width: "100%", maxWidth: 820 }}>
        <style>{`
          @media print {
            @page { size: A4; margin: 12mm; }
            .letterhead { box-shadow: none !important; }
            .no-print, [data-print="hide"] { display: none !important; }
          }
        `}</style>

        {/* Header band */}
        <div className="relative px-10 pt-8 pb-5 border-b-4" style={{ borderColor: "hsl(var(--primary))" }}>
          <div className="absolute top-0 left-0 right-0 h-2" style={{ background: "hsl(var(--primary))" }} />
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              {school?.logo_url ? (
                <img src={school.logo_url} alt={school.name} className="h-16 w-16 object-contain" />
              ) : (
                <div className="h-16 w-16 rounded-lg flex items-center justify-center text-white text-xl font-bold"
                     style={{ background: "hsl(var(--primary))" }}>
                  {(school?.name || "S").slice(0, 1)}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{school?.name || "School"}</h1>
                {school?.motto && <p className="text-xs italic text-slate-500 mt-0.5">{school.motto}</p>}
                <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                  {school?.address && <p>{school.address}</p>}
                  <p>
                    {school?.phone && <span>Tel: {school.phone}</span>}
                    {school?.phone && school?.email && <span> · </span>}
                    {school?.email && <span>{school.email}</span>}
                  </p>
                  {school?.website && <p>{school.website}</p>}
                </div>
              </div>
            </div>
            <div className="text-right text-xs text-slate-600">
              <p className="font-semibold text-slate-800 uppercase tracking-wider">Employment Contract</p>
              <p className="mt-1">Ref: <span className="font-mono">{c.reference_number || `HR-${String(c.id).slice(0, 8).toUpperCase()}`}</span></p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-10 py-6 space-y-5 text-[13px] leading-relaxed">

          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">To</p>
            <p className="font-semibold text-base">{employeeName}</p>
            {employeeEmail && <p className="text-slate-600 text-xs">{employeeEmail}</p>}
          </div>

          <div>
            <h2 className="text-lg font-bold underline underline-offset-4 mb-3 text-center"
                style={{ color: "hsl(var(--primary))" }}>
              LETTER OF APPOINTMENT
            </h2>
            <p>Dear {employeeName.split(" ")[0] || "Colleague"},</p>
            <p className="mt-3">
              We are pleased to offer you the position of <span className="font-semibold">{c.position || "—"}</span>
              {c.department ? <> in the <span className="font-semibold">{c.department}</span> department</> : null}
              {" "}at <span className="font-semibold">{school?.name || "our institution"}</span>, on the following terms and conditions:
            </p>
          </div>

          {/* Terms table */}
          <table className="w-full text-[12.5px] border border-slate-200">
            <tbody>
              {[
                ["Employment Type", TYPE_LABEL[c.contract_type] || c.contract_type || "—"],
                ["Start Date", fmtDate(c.start_date)],
                ["End Date", c.end_date ? fmtDate(c.end_date) : "Ongoing / Until Terminated"],
                ["Reporting To", c.reporting_to || "—"],
                ["Working Hours", c.working_hours || "—"],
                ["Probation", c.probation_period_months ? `${c.probation_period_months} month(s)` : "—"],
                ["Notice Period", c.notice_period_days ? `${c.notice_period_days} day(s)` : "—"],
                ["Compensation", salary ? `${salary} per month` : "As per offer letter"],
              ].map(([k, v]) => (
                <tr key={k as string} className="border-b border-slate-200 last:border-0">
                  <td className="py-2 px-3 bg-slate-50 font-medium text-slate-700 w-1/3">{k}</td>
                  <td className="py-2 px-3">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {c.benefits && (
            <div>
              <h3 className="font-semibold text-sm mb-1">Benefits</h3>
              <p className="whitespace-pre-wrap">{c.benefits}</p>
            </div>
          )}

          {c.terms && (
            <div>
              <h3 className="font-semibold text-sm mb-1">Terms &amp; Conditions</h3>
              <p className="whitespace-pre-wrap">{c.terms}</p>
            </div>
          )}

          {c.body && (
            <div className="whitespace-pre-wrap">{c.body}</div>
          )}

          <p className="mt-2">
            Please confirm your acceptance by signing and returning a copy of this letter. We look forward to your valuable contribution to {school?.name || "our institution"}.
          </p>

          <p className="mt-4">Sincerely,</p>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-10 pt-6 mt-2">
            <div>
              <div className="border-b border-slate-400 pb-1 mb-2 h-10" />
              <p className="font-semibold">{c.signatory_name || "Authorized Signatory"}</p>
              <p className="text-xs text-slate-600">{c.signatory_title || "Human Resources"}</p>
              <p className="text-xs text-slate-500 mt-1">{school?.name}</p>
            </div>
            <div>
              <div className="border-b border-slate-400 pb-1 mb-2 h-10" />
              <p className="font-semibold">{employeeName}</p>
              <p className="text-xs text-slate-600">Employee Acceptance</p>
            </div>
          </div>
        </div>

        {/* Footer band — single tagline */}
        <div className="px-10 py-3 border-t flex items-center justify-end text-[10.5px] text-slate-500"
             style={{ borderColor: "hsl(var(--primary) / 0.4)" }}>
          <span>AltRix — School Operating System</span>
        </div>
      </div>
    );
  }
);

ContractLetterhead.displayName = "ContractLetterhead";
