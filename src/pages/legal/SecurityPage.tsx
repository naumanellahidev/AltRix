import React from "react";
import LegalLayout from "./LegalLayout";
import { ShieldCheck, Lock, Server, Terminal, Radio, AlertTriangle } from "lucide-react";

export default function SecurityPage() {
  return (
    <LegalLayout
      title="Security & Infrastructure Trust Center"
      subtitle="Complete documentation of AltRix server hardening, cryptographic protocols, MTA email security, and incident response SLA."
      badge="Enterprise Security Hardening"
      lastUpdated="August 25, 2026"
    >
      <div className="space-y-8 text-sm leading-relaxed text-slate-700">
        <div className="p-5 rounded-2xl bg-slate-900 text-white not-prose space-y-2 border border-slate-800 shadow-xl">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white tracking-tight">
              Hardened VPS Infrastructure Baseline
            </h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            AltRix Cloud OS is hosted on dedicated, hardened VPS compute nodes with strict network attack-surface reduction, automated Fail2Ban rate-limiting, and encrypted MTA local relays.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">1. Infrastructure Hardening Matrix</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Lock className="h-4 w-4 text-blue-600" /> SSH &amp; Sudo Protection
              </div>
              <p className="text-xs text-slate-600">
                Root login disabled, password authentication disabled, mandatory Ed25519 public key authentication, and rate-limited connection thresholds.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Server className="h-4 w-4 text-emerald-600" /> Web &amp; Reverse Proxy Security
              </div>
              <p className="text-xs text-slate-600">
                Nginx reverse-proxy with strict TLS 1.3 encryption, automated Let's Encrypt certificates, HSTS headers, and CSP security directives.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Terminal className="h-4 w-4 text-indigo-600" /> Mail Infrastructure Node (MTA)
              </div>
              <p className="text-xs text-slate-600">
                Dedicated Postfix SMTP relay at <code>127.0.0.1:25</code> with Docker RELAYNETS authentication, DKIM signing, and SPF verification.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Radio className="h-4 w-4 text-purple-600" /> Intrusion Prevention &amp; WAF
              </div>
              <p className="text-xs text-slate-600">
                Active Fail2Ban jails inspecting auth and API endpoints with automatic temporary IP bans on anomalous brute-force attempts.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">2. Cryptography &amp; Key Management</h2>
          <p>
            We implement industry-standard cryptographic primitives:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
            <li><strong>Password Hashing:</strong> Strong Argon2id and salted Bcrypt algorithms.</li>
            <li><strong>Session &amp; Token Security:</strong> Cryptographically signed JWT tokens with short expiration windows and single-use activation hashes.</li>
            <li><strong>Database Encryption:</strong> Transparent volume encryption (AES-256) at rest.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">3. Incident Response &amp; Breach SLA</h2>
          <p>
            In the improbable event of a confirmed security incident affecting customer data, AltRix commits to a formal notification SLA:
          </p>
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 not-prose space-y-1 text-xs text-amber-900">
            <p><strong>🚨 72-Hour Notification Commitment:</strong> Subscribing institutions will be notified via primary administrator email within 72 hours of confirmed breach verification with forensic impact assessments.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">4. Responsible Vulnerability Disclosure</h2>
          <p>
            Security researchers and institutional auditors can report vulnerabilities directly to our security team:
          </p>
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 not-prose space-y-1 text-xs">
            <p><strong>AltRix Security Operations Center (SOC)</strong></p>
            <p>Direct Email: <a href="mailto:security@altrixcore.com" className="text-blue-600 font-bold hover:underline">security@altrixcore.com</a></p>
            <p>PGP Key Fingerprint: <code className="bg-white px-1.5 py-0.5 rounded border text-[11px]">4A91 2E6F 88BC 109D 741C</code></p>
          </div>
        </section>
      </div>
    </LegalLayout>
  );
}
