import React from "react";
import LegalLayout from "./LegalLayout";

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="AltRix Global Privacy Policy"
      subtitle="Comprehensive data governance, FERPA/GDPR compliance, and privacy protections for educational institutions, staff, students, and parents."
      badge="Data Privacy & Protection"
      lastUpdated="August 25, 2026"
    >
      <div className="space-y-8 text-sm leading-relaxed text-slate-700">
        {/* Executive Summary Callout */}
        <div className="p-5 rounded-2xl bg-blue-50/70 border border-blue-200/80 not-prose space-y-2">
          <h3 className="text-base font-bold text-blue-900 flex items-center gap-2">
            🛡️ Executive Privacy Commitment
          </h3>
          <p className="text-xs text-blue-800 leading-relaxed">
            AltRix operates with an unyielding commitment to institutional data sovereignty: <strong>we do not sell, rent, monetize, or harvest student or institutional data</strong>. All academic records, identity details, financial records, and operational telemetry remain 100% the exclusive property of the subscribing institution.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">1. Scope and Applicability</h2>
          <p>
            This Privacy Policy governs the collection, processing, storage, and protection of information within <strong>Altrix Core — The AI-Powered Institute Operating System</strong> (accessible via <code>altrixcore.com</code> and authorized institutional subdomains), operated by Altrix Core Technologies.
          </p>
          <p>
            This policy applies to all users of the platform, including Master Administrators, School Owners, Principals, Campus Directors, Teachers, Accountants, HR Personnel, Students, and Parents/Guardians.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">2. Institutional Data Ownership</h2>
          <p>
            When an educational institution registers on AltRix, it acts as the <strong>Data Controller</strong>. AltRix functions strictly as a <strong>Data Processor</strong> on behalf of the institution.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li><strong>Sole Ownership:</strong> All student records, employee files, grades, exam schedules, attendance logs, and fee transactions are exclusively owned by the respective school or university.</li>
            <li><strong>No Secondary Monetization:</strong> We never utilize customer data for targeted advertising, external marketing profiling, or data brokering.</li>
            <li><strong>Portability &amp; Deletion:</strong> Institutions can export complete database backups or request permanent cryptographic erasure at any time upon subscription closure.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">3. Information We Collect</h2>
          <p>
            To provide comprehensive school enterprise resource planning (ERP) capabilities, AltRix processes the following categories of information:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-1.5">Academic &amp; Student Data</h4>
              <p className="text-xs text-slate-600">Student full name, roll numbers, class/section assignments, attendance status, grading reports, exam responses, parent contact profiles, and behavioral remarks.</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-1.5">Staff &amp; Payroll Records</h4>
              <p className="text-xs text-slate-600">Faculty credentials, employee IDs, salary structures, leave records, biometric/RFID timestamps, qualifications, and campus assignment history.</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-1.5">Financial &amp; Billing Data</h4>
              <p className="text-xs text-slate-600">Fee vouchers, payment timestamps, transaction IDs, scholarship awards, and fine structures. Card data is processed exclusively via PCI-DSS certified gateways.</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-1.5">System &amp; Security Telemetry</h4>
              <p className="text-xs text-slate-600">Authentication timestamps, IP addresses, browser agent headers, MFA audit events, and transactional email delivery receipts (passwords/tokens never logged).</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">4. Regulatory Standards &amp; Compliance</h2>
          <p>
            AltRix architecture is engineered to comply with major global educational and data protection frameworks:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-600">
            <li><strong>FERPA (Family Educational Rights and Privacy Act):</strong> We maintain strict institutional controls, ensuring educational records are disclosed only to designated school officials and authorized guardians.</li>
            <li><strong>COPPA (Children’s Online Privacy Protection Act):</strong> AltRix collects student information solely under the direct supervision and written authorization of the school institution.</li>
            <li><strong>GDPR / UK GDPR:</strong> Robust data subject rights management, including Right of Access (Art. 15), Right to Rectification (Art. 16), and Right to Erasure (Art. 17).</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">5. Multi-Tenant Security &amp; Data Isolation</h2>
          <p>
            AltRix utilizes hardened architectural isolation principles:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li><strong>Schema &amp; Row-Level Isolation:</strong> Every school tenant’s data is strictly partitioned with database-level access policies preventing cross-tenant leakage.</li>
            <li><strong>End-to-End Encryption:</strong> All data in transit is encrypted using <strong>TLS 1.3</strong> protocols with dedicated Let's Encrypt certificates. All database storage volumes are encrypted at rest using <strong>AES-256</strong>.</li>
            <li><strong>Zero Secret Logging:</strong> Single-use activation tokens, reset hashes, and raw passwords are cryptographically salted (Argon2id/Bcrypt) and excluded from all diagnostic logs.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">6. Privacy Contacts &amp; Inquiries</h2>
          <p>
            If you have questions regarding this Privacy Policy, wish to exercise your data subject rights, or require an enterprise Data Processing Addendum (DPA), please contact our Data Protection Officer:
          </p>
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 not-prose space-y-1 text-xs">
            <p><strong>AltRix Privacy &amp; Data Governance Office</strong></p>
            <p>Email: <a href="mailto:privacy@altrixcore.com" className="text-blue-600 font-bold hover:underline">privacy@altrixcore.com</a></p>
            <p>General Support: <a href="mailto:support@altrixcore.com" className="text-blue-600 font-bold hover:underline">support@altrixcore.com</a></p>
            <p>Portal: <a href="https://altrixcore.com" className="text-blue-600 font-bold hover:underline">https://altrixcore.com</a></p>
          </div>
        </section>
      </div>
    </LegalLayout>
  );
}
