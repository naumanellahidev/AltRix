import { useEffect, useState } from "react";
import { X, Smartphone, Download, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios" | "other">("other");

  useEffect(() => {
    // Detect OS
    const ua = navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);

    if (isIos) {
      setPlatform("ios");
    } else if (isAndroid) {
      setPlatform("android");
    }

    // Check if app is already running in standalone mode (already installed)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches 
      || (window.navigator as any).standalone 
      || document.referrer.includes("android-app://");

    if (isStandalone) {
      return;
    }

    // Check if user dismissed prompt in the last 7 days
    const dismissedAt = localStorage.getItem("altrix_pwa_dismissed_at");
    if (dismissedAt) {
      const parsedDate = new Date(dismissedAt);
      const diffDays = (Date.now() - parsedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 7) {
        return;
      }
    }

    // Android/Chrome support
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // iOS support: Show prompt manually since beforeinstallprompt isn't supported on iOS Safari
    if (isIos) {
      // Show iOS prompt after 3 seconds of load time
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA install choice: ${outcome}`);

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("altrix_pwa_dismissed_at", new Date().toISOString());
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-rise rounded-2xl border border-blue-100 bg-white/95 backdrop-blur-md p-4 shadow-[0_15px_40px_rgba(37,99,235,0.18)] max-w-md mx-auto">
      <button 
        onClick={handleDismiss} 
        className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-blue-400 text-white shadow-md shadow-blue-200">
          <Smartphone className="h-5 w-5 animate-pulse" />
        </span>
        <div className="space-y-1 pr-6">
          <h4 className="font-display text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
            Install AltRix Mobile App <Sparkles className="h-3.5 w-3.5 text-blue-500" />
          </h4>
          
          {platform === "ios" ? (
            <div className="text-[11px] font-semibold text-slate-500 leading-relaxed space-y-1">
              <p>Add to your home screen for quick access, fee alerts & bus tracking:</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Tap the <span className="font-bold text-blue-600">Share</span> button in Safari</li>
                <li>Scroll down and tap <span className="font-bold text-blue-600">Add to Home Screen</span></li>
              </ol>
            </div>
          ) : (
            <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
              Install the app for instant push notifications, child attendance alerts, transport maps, and quick fee payments.
            </p>
          )}

          <div className="flex gap-2 pt-2">
            {platform !== "ios" && (
              <Button 
                onClick={handleInstall} 
                size="sm" 
                className="h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold gap-1.5 shadow-sm shadow-blue-200"
              >
                <Download className="h-3.5 w-3.5" />
                Install
              </Button>
            )}
            <Button 
              onClick={handleDismiss} 
              variant="outline" 
              size="sm" 
              className="h-8 rounded-lg text-xs font-bold border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              Maybe Later
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
