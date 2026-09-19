import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";

type Kind = "report-card" | "certificate";

interface Verdict {
  verified: boolean;
  school: string | null;
  holder: string | null;
  title: string;
  facts: Array<{ label: string; value: string }>;
  message: string | null;
}

const CERTIFICATE_NAMES: Record<string, string> = {
  transfer_certificate: "School Leaving / Transfer Certificate",
  character_certificate: "Character Certificate",
  bonafide: "Bonafide Certificate",
  noc: "No Objection Certificate",
};

function readable(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function formatDate(value: unknown): string | null {
  const text = readable(value);
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime())
    ? text
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

async function verify(kind: Kind, code: string): Promise<Verdict> {
  if (kind === "report-card") {
    const { data } = await apiClient.get(`/report-cards/verify/${encodeURIComponent(code)}`);
    const pct = readable(data?.percentage);
    return {
      verified: data?.verified === true,
      school: readable(data?.school_name),
      holder: readable(data?.student_name),
      title: "Report Card",
      message: data?.verified ? null : readable(data?.message),
      facts: [
        { label: "Term", value: readable(data?.period) },
        { label: "Session", value: readable(data?.academic_year) },
        { label: "Result", value: pct ? `${Number(pct).toFixed(2)}%${data?.grade ? ` · Grade ${data.grade}` : ""}` : readable(data?.grade) },
        {
          label: "Position",
          value: data?.position ? `${data.position}${data?.total_students ? ` of ${data.total_students}` : ""}` : null,
        },
        { label: "Issued", value: formatDate(data?.published_at) },
        { label: "Signed by", value: readable(data?.signed_by) },
      ].filter((f): f is { label: string; value: string } => !!f.value),
    };
  }

  const { data } = await apiClient.get(`/documents/certificates/verify/${encodeURIComponent(code)}`);
  const revoked = data?.status && data.status !== "valid";
  return {
    verified: data?.valid === true,
    school: readable(data?.school_name),
    holder: readable(data?.student_name),
    title: CERTIFICATE_NAMES[data?.certificate_type] ?? readable(data?.certificate_type) ?? "Certificate",
    message: data?.valid
      ? null
      : revoked
        ? `This certificate has been ${String(data.status)} by the school and is no longer valid.`
        : readable(data?.message),
    facts: [
      { label: "Certificate No.", value: readable(data?.certificate_number) },
      { label: "Issued", value: formatDate(data?.issue_date) },
      { label: "Remarks", value: readable(data?.remarks) },
    ].filter((f): f is { label: string; value: string } => !!f.value),
  };
}

/**
 * Where a document's QR code leads.
 *
 * Anyone holding a printed report card or certificate — a college, an
 * employer, another school — scans the code and sees, from the school's own
 * records, whether the document is genuine and what it says. No login needed,
 * and only what verification requires is shown.
 */
export default function VerifyDocumentPage() {
  const { kind, code } = useParams<{ kind: string; code: string }>();
  const [state, setState] = useState<{ loading: boolean; verdict: Verdict | null; error: string | null }>({
    loading: true,
    verdict: null,
    error: null,
  });

  useEffect(() => {
    const k = kind === "certificate" ? "certificate" : kind === "report-card" ? "report-card" : null;
    if (!k || !code) {
      setState({ loading: false, verdict: null, error: "This verification link is incomplete." });
      return;
    }
    let cancelled = false;
    verify(k, code)
      .then((verdict) => !cancelled && setState({ loading: false, verdict, error: null }))
      .catch(() =>
        !cancelled &&
        setState({
          loading: false,
          verdict: null,
          error: "The school's records could not be reached. Try again in a moment.",
        }),
      );
    return () => {
      cancelled = true;
    };
  }, [kind, code]);

  const { loading, verdict, error } = state;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 flex items-start justify-center">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm justify-center">
          <ShieldCheck className="h-4 w-4" /> Document verification
        </div>

        <Card className="rounded-2xl shadow-sm border-slate-200">
          <CardContent className="p-6 space-y-5">
            {loading && (
              <div className="flex items-center gap-3 text-slate-600" aria-live="polite">
                <Loader2 className="h-5 w-5 animate-spin" /> Checking with the school's records…
              </div>
            )}

            {!loading && error && (
              <div className="flex items-start gap-3 text-amber-700" role="alert">
                <ShieldAlert className="h-6 w-6 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {!loading && verdict && (
              <>
                <div className={`flex items-start gap-3 ${verdict.verified ? "text-emerald-700" : "text-red-700"}`} role="status">
                  {verdict.verified ? <CheckCircle2 className="h-8 w-8 shrink-0" /> : <XCircle className="h-8 w-8 shrink-0" />}
                  <div>
                    <p className="text-lg font-semibold">
                      {verdict.verified ? "Verified — this document is genuine" : "Not verified"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {verdict.verified
                        ? `This ${verdict.title.toLowerCase()} matches the records of ${verdict.school ?? "the issuing school"}.`
                        : verdict.message ?? "No document matches this code. It may have been altered, withdrawn or never issued."}
                    </p>
                  </div>
                </div>

                {verdict.verified && (
                  <dl className="divide-y divide-slate-100 border-t border-slate-100">
                    {verdict.school && (
                      <div className="flex justify-between gap-4 py-2 text-sm">
                        <dt className="text-slate-500">Issued by</dt>
                        <dd className="font-medium text-right">{verdict.school}</dd>
                      </div>
                    )}
                    {verdict.holder && (
                      <div className="flex justify-between gap-4 py-2 text-sm">
                        <dt className="text-slate-500">Issued to</dt>
                        <dd className="font-medium text-right" dir="auto">{verdict.holder}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4 py-2 text-sm">
                      <dt className="text-slate-500">Document</dt>
                      <dd className="font-medium text-right">{verdict.title}</dd>
                    </div>
                    {verdict.facts.map((f) => (
                      <div key={f.label} className="flex justify-between gap-4 py-2 text-sm">
                        <dt className="text-slate-500">{f.label}</dt>
                        <dd className="font-medium text-right" dir="auto">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                <p className="text-xs text-slate-400">
                  Compare these details with the printed document. If anything differs, the printed copy has been
                  altered — contact the school directly.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
