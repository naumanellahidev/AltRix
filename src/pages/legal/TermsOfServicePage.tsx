import React from "react";
import LegalLayout from "./LegalLayout";

export default function TermsOfServicePage() {
  return (
    <LegalLayout
      title="Altrix Core Terms of Service"
      subtitle="Master Subscription Agreement and Terms of Service governing the use of Altrix Core — The AI-Powered Institute Operating System by educational institutions and users."
      badge="Service Terms & Agreement"
      lastUpdated="August 25, 2026"
    >
      <div className="space-y-8 text-sm leading-relaxed text-slate-700">
        <div className="p-5 rounded-2xl bg-blue-50/70 border border-blue-200/80 not-prose space-y-2">
          <h3 className="text-base font-bold text-blue-900 flex items-center gap-2">
            📜 Master Subscription Agreement
          </h3>
          <p className="text-xs text-blue-800 leading-relaxed">
            By provisioning an institutional workspace, subscribing to an enterprise tier, or accessing Altrix Core, the subscribing school, college, university, or educational network agrees to these Terms of Service.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">1. Platform Provisioning &amp; Authorized Use</h2>
          <p>
            Altrix Core grants the customer a non-exclusive, non-transferable, worldwide right to access and utilize the operating platform in accordance with the subscribed seat tier and campus limits.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li><strong>Institutional Administration:</strong> Each school owner/master administrator is responsible for maintaining appropriate role-based permissions (Principals, Teachers, Accountants, HR).</li>
            <li><strong>Campus Isolation:</strong> Users invited by campus directors or principals are strictly partitioned to their designated campus or school branch.</li>
            <li><strong>Prohibited Conduct:</strong> Users may not reverse-engineer, decompile, launch automated scraping bots, or attempt unauthorized penetration testing against platform infrastructure.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">2. Service Level Agreement (SLA) &amp; Uptime Commitment</h2>
          <p>
            AltRix guarantees an enterprise operational standard:
          </p>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 not-prose space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900">Guaranteed System Availability:</span>
              <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">99.99% Monthly Uptime</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900">MTA Transactional Mail Delivery:</span>
              <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">&lt; 5s Average Dispatch</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Maintenance Notification Window:</span>
              <span className="font-mono text-slate-600">72 Hours Prior Notice (Off-Peak Hours)</span>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">3. Subscription, Billing &amp; Invoicing</h2>
          <p>
            Subscriptions are billed on a recurring monthly or annual basis as agreed in the customer order form.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li><strong>Transparent Invoicing:</strong> Invoices are automatically generated and available within the Super Admin Billing dashboard.</li>
            <li><strong>Payment Terms:</strong> Fees are due upon receipt or Net-30 for approved institutional purchase orders.</li>
            <li><strong>Taxes:</strong> Fees are exclusive of applicable national or regional value-added taxes unless stated otherwise.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">4. Data Sovereignty &amp; Exit Portability</h2>
          <p>
            Upon termination or expiration of an institutional subscription:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li><strong>30-Day Export Window:</strong> The customer retains full access for 30 calendar days to extract all student, grade, financial, and attendance records in standardized formats (CSV, JSON, SQL archive).</li>
            <li><strong>Permanent Cryptographic Purge:</strong> Following the export window, all tenant database rows, backups, and media assets are permanently purged from active and replica storage volumes.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">5. Limitation of Liability</h2>
          <p>
            Except for gross negligence, willful misconduct, or breaches of confidentiality, neither party shall be liable for indirect, incidental, special, or consequential damages. Total liability shall not exceed the aggregate fees paid by the customer in the preceding twelve (12) months.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">6. Legal Inquiries &amp; Notices</h2>
          <p>
            Official legal notices or contractual inquiries must be directed to:
          </p>
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 not-prose space-y-1 text-xs">
            <p><strong>AltRix Legal &amp; Governance Department</strong></p>
            <p>Email: <a href="mailto:legal@altrixcore.com" className="text-blue-600 font-bold hover:underline">legal@altrixcore.com</a></p>
            <p>Sales &amp; Subscriptions: <a href="mailto:contact@altrixcore.com" className="text-blue-600 font-bold hover:underline">contact@altrixcore.com</a></p>
            <p>Official Website: <a href="https://altrixcore.com" className="text-blue-600 font-bold hover:underline">https://altrixcore.com</a></p>
          </div>
        </section>
      </div>
    </LegalLayout>
  );
}
