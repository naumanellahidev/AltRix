import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Lock, FileText, CheckCircle2, Mail, ExternalLink, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  badge: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export default function LegalLayout({
  title,
  subtitle,
  badge,
  lastUpdated,
  children,
}: LegalLayoutProps) {
  const navigate = useNavigate();

  const navLinks = [
    { name: "Privacy Policy", path: "/privacy", icon: Shield },
    { name: "Terms of Service", path: "/terms", icon: FileText },
    { name: "Compliance & Certifications", path: "/compliance", icon: CheckCircle2 },
    { name: "Security & Trust", path: "/security", icon: Lock },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* ── Top Header Bar ── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3.5 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 group">
              <img
                src="/altrix-logo.png"
                alt="AltRix Logo"
                className="h-8 sm:h-9 w-auto max-w-[160px] object-contain transition-transform group-hover:scale-105"
              />
            </Link>
            <div className="hidden sm:block h-5 w-[1px] bg-slate-200" />
            <span className="hidden sm:inline-flex text-xs font-bold text-slate-500 uppercase tracking-wider">
              Legal &amp; Trust Center
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/")}
              className="text-xs font-bold rounded-xl border-slate-200 bg-white hover:bg-slate-100 text-slate-700 shadow-2xs"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Portal
            </Button>
            <a
              href="mailto:contact@altrixcore.com?subject=AltRix%20Legal%20%26%20Compliance%20Inquiry"
              className="hidden md:inline-flex items-center justify-center text-xs font-bold px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all"
            >
              <Mail className="h-3.5 w-3.5 mr-1.5" /> Contact Legal Desk
            </a>
          </div>
        </div>
      </header>

      {/* ── Document Hero Banner ── */}
      <section className="bg-gradient-to-b from-white via-slate-50 to-slate-100/60 border-b border-slate-200/80 py-12 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto text-center space-y-3.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-bold tracking-wide uppercase">
            <Shield className="h-3.5 w-3.5" /> {badge}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {title}
          </h1>
          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            {subtitle}
          </p>
          <p className="text-xs font-mono text-slate-400">
            Official Version 2026.2 &bull; Effective Date: {lastUpdated}
          </p>
        </div>
      </section>

      {/* ── Main Content Container ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Navigation Sidebar */}
          <aside className="lg:col-span-3">
            <div className="sticky top-24 space-y-2 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 pt-2 block">
                Legal Documents
              </span>
              {navLinks.map((item) => {
                const Icon = item.icon;
                const isActive = window.location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.name}
                  </Link>
                );
              })}

              <div className="pt-4 border-t border-slate-100 px-3 pb-2 space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Institutional Desk
                </span>
                <p className="text-xs text-slate-500 leading-relaxed">
                  For Data Processing Addendums (DPA) or enterprise compliance inquiries:
                </p>
                <a
                  href="mailto:compliance@altrixcore.com"
                  className="text-xs font-bold text-blue-600 hover:underline block truncate"
                >
                  compliance@altrixcore.com &rarr;
                </a>
              </div>
            </div>
          </aside>

          {/* Right Document Article */}
          <article className="lg:col-span-9 bg-white p-6 sm:p-10 rounded-2xl border border-slate-200/80 shadow-xs prose prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-blue-600">
            {children}
          </article>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full bg-white border-t border-slate-200/80 py-6 px-6 sm:px-8 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/altrix-logo.png" alt="AltRix Logo" className="h-7 w-auto max-w-[140px] object-contain" />
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs text-slate-500 font-medium">The AI-Powered Institute Operating System</span>
          </div>

          <div className="flex gap-6 justify-center flex-wrap">
            <Link to="/privacy" className="text-xs font-bold text-slate-600 hover:text-blue-600">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-xs font-bold text-slate-600 hover:text-blue-600">
              Terms of Service
            </Link>
            <Link to="/compliance" className="text-xs font-bold text-slate-600 hover:text-blue-600">
              Compliance
            </Link>
            <Link to="/security" className="text-xs font-bold text-slate-600 hover:text-blue-600">
              Security
            </Link>
          </div>

          <p className="text-xs text-slate-400 font-medium">
            &copy; {new Date().getFullYear()} AltRix Operating System. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
