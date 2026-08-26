import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";

export function PoweredByFooter() {
  const [branding, setBranding] = useState(() => {
    return {
      footerText:
        localStorage.getItem("altrix_platform_footer_text") ||
        "AltRix Core — The AI-Powered Institute Operating System",
      footerUrl:
        localStorage.getItem("altrix_platform_footer_url") ||
        "https://altrixcore.com",
    };
  });

  useEffect(() => {
    let isMounted = true;
    const fetchBranding = async () => {
      try {
        const res = await apiClient.get<{ footer_text?: string; footer_url?: string }>("/platform/branding");
        if (res.data && isMounted) {
          const text = res.data.footer_text || "AltRix Core — The AI-Powered Institute Operating System";
          const url = res.data.footer_url || "https://altrixcore.com";
          setBranding({ footerText: text, footerUrl: url });
          localStorage.setItem("altrix_platform_footer_text", text);
          localStorage.setItem("altrix_platform_footer_url", url);
        }
      } catch {
        // Fallback gracefully to local storage / defaults
      }
    };

    fetchBranding();

    const handleBrandingChange = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail) {
        setBranding({
          footerText: custom.detail.footer_text || "AltRix Core — The AI-Powered Institute Operating System",
          footerUrl: custom.detail.footer_url || "https://altrixcore.com",
        });
      }
    };

    window.addEventListener("altrix:platform-branding-changed", handleBrandingChange);
    return () => {
      isMounted = false;
      window.removeEventListener("altrix:platform-branding-changed", handleBrandingChange);
    };
  }, []);

  if (!branding.footerText) return null;

  const content = branding.footerUrl ? (
    <a
      href={branding.footerUrl}
      target={branding.footerUrl.startsWith("http") ? "_blank" : "_self"}
      rel="noopener noreferrer"
      className="pointer-events-auto text-[10px] text-muted-foreground/50 hover:text-primary transition-colors font-medium tracking-wide flex items-center gap-1 hover:underline select-none"
    >
      <span>{branding.footerText}</span>
    </a>
  ) : (
    <span className="pointer-events-auto text-[10px] text-muted-foreground/40 font-medium tracking-wide select-none">
      {branding.footerText}
    </span>
  );

  return (
    <div
      data-print="hide"
      className="pointer-events-none fixed bottom-2 right-3 z-[60] text-[10px] text-muted-foreground/70 print:hidden"
    >
      {content}
    </div>
  );
}
