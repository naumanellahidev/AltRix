import React from "react";
import LegalLayout from "./LegalLayout";
import { CheckCircle2, Shield, Lock, FileCheck, Server, AlertCircle } from "lucide-react";

export default function CompliancePage() {
  const certifications = [
    {
      title: "FERPA Compliant Architecture",
      org: "U.S. Department of Education",
      desc: "Comprehensive role-based access controls and encrypted student data storage preventing unauthorized disclosure of education records.",
    },
    {
      title: "GDPR & UK GDPR Readiness",
      org: "European Data Protection Board",
      desc: "Full support for data subject access requests, automated consent tracking, right-to-erasure workflows, and strict data processing agreements.",
    },
    {
      title: "COPPA Educational Exemption",
      org: "Federal Trade Commission",
      desc: "Direct institutional contracting ensuring student data under 13 is collected exclusively for educational services under school authority.",
    },
    {
      title: "TLS 1.3 & Dedicated HTTPS",
      org: "Internet Engineering Task Force (IETF)",
      desc: "Strict transport security, automated certificate renewal via Let's Encrypt, and encrypted SMTP MTA relay across all communications.",
    },
  ];

  return (
    <LegalLayout
      title="Compliance & Regulatory Certifications"
      subtitle="Detailed overview of AltRix regulatory alignments, educational data protection frameworks, and enterprise compliance standards."
      badge="Regulatory Alignment"
      lastUpdated="August 25, 2026"
    >
      <div className="space-y-8 text-sm leading-relaxed text-slate-700">
        <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 not-prose space-y-2">
          <h3 className="text-base font-bold text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Enterprise Compliance Guarantee
          </h3>
          <p className="text-xs text-emerald-800 leading-relaxed">
            AltRix Cloud OS is built from the ground up to satisfy the strictest global compliance demands for K-12 schools, higher education institutions, multi-campus academies, and examination boards.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">1. Regulatory Frameworks Matrix</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose">
            {certifications.map((c) => (
              <div key={c.title} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-blue-600 shrink-0" />
                  <h4 className="font-bold text-slate-900 text-xs">{c.title}</h4>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{c.org}</span>
                <p className="text-xs text-slate-600 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">2. Institutional Role-Based Access Control (RBAC)</h2>
          <p>
            AltRix enforces strict least-privilege administrative separation:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li><strong>Super Master Admin:</strong> Global platform oversight, billing management, MTA server administration, and infrastructure telemetry.</li>
            <li><strong>School Owner:</strong> Multi-campus oversight, subscription tiers, institutional branding, and school-wide reporting.</li>
            <li><strong>Principal / Campus Director:</strong> Branch-isolated administration, staff management, class scheduling, and local student directory access.</li>
            <li><strong>Teacher, Accountant, HR &amp; Parent Portals:</strong> Strictly scoped functional views preventing access to unrelated institutional modules or financial ledgers.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">3. Automated Data Backup &amp; Disaster Recovery</h2>
          <p>
            To guarantee operational continuity and zero data loss:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li><strong>Daily Automated Snapshots:</strong> Encrypted PostgreSQL database dumps and configuration archives are generated daily.</li>
            <li><strong>Offsite Replication:</strong> Encrypted backups are replicated to geo-isolated storage zones.</li>
            <li><strong>RPO / RTO Metrics:</strong> Recovery Point Objective (RPO) of &lt; 1 hour and Recovery Time Objective (RTO) of &lt; 15 minutes.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">4. Request a Compliance Package / DPA</h2>
          <p>
            Educational authorities, district auditors, or prospective institutional clients may request a customized Data Processing Addendum (DPA) and compliance binder:
          </p>
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 not-prose space-y-1 text-xs">
            <p><strong>AltRix Compliance Operations</strong></p>
            <p>Email: <a href="mailto:compliance@altrixcore.com" className="text-blue-600 font-bold hover:underline">compliance@altrixcore.com</a></p>
            <p>Direct Phone: <span className="font-mono text-slate-700">+1 (800) ALTRIX-CORE</span></p>
            <p>Website: <a href="https://altrixcore.com/compliance" className="text-blue-600 font-bold hover:underline">https://altrixcore.com/compliance</a></p>
          </div>
        </section>
      </div>
    </LegalLayout>
  );
}
