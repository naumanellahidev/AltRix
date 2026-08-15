import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Declare Vite compile-time build timestamp
declare const __APP_BUILD_ID__: string;

// Build-version auto-sync: Automatically purge outdated caches when a new build is deployed
if (typeof window !== "undefined") {
  const currentBuild = typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : String(Date.now());
  const lastKnownBuild = localStorage.getItem("altrix:build_version");

  if (lastKnownBuild && lastKnownBuild !== currentBuild) {
    console.log(`[AltRix] New build detected (${lastKnownBuild} -> ${currentBuild}). Purging stale storage and caches...`);
    
    // 1. Purge all cached tenant, branding, and module state
    try {
      const keysToPurge = Object.keys(localStorage).filter((k) =>
        k.startsWith("eduverse_") ||
        k.startsWith("altrix_") ||
        k.startsWith("supabase_") ||
        k.includes("cache") ||
        k.includes("tenant") ||
        k.includes("branding")
      );
      keysToPurge.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.warn("[AltRix] LocalStorage cache purge warning:", e);
    }

    // 2. Purge browser CacheStorage caches
    if (typeof caches !== "undefined") {
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      }).catch((e) => console.warn("[AltRix] CacheStorage purge warning:", e));
    }

    // 3. Set updated build version
    localStorage.setItem("altrix:build_version", currentBuild);
  } else if (!lastKnownBuild) {
    localStorage.setItem("altrix:build_version", currentBuild);
  }

  // Global chunk reload handler for handling dynamically imported module failures when new versions are deployed
  const handleChunkError = (error: any) => {
    const errorMsg = String(error?.message || error || "").toLowerCase();
    if (
      errorMsg.includes("failed to fetch dynamically imported module") ||
      errorMsg.includes("importing a module script failed") ||
      errorMsg.includes("failed to fetch") ||
      errorMsg.includes("bad-precaching-response")
    ) {
      console.warn("Dynamic import or service worker precache failed. Purging SW and reloading...", error);
      const lastReload = localStorage.getItem("eduverse:last_chunk_reload");
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        localStorage.setItem("eduverse:last_chunk_reload", String(now));
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) {
              registration.unregister();
            }
          }).finally(() => {
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
      }
    }
  };

  window.addEventListener("error", (e) => {
    handleChunkError(e.error || e);
  }, true);

  window.addEventListener("unhandledrejection", (e) => {
    handleChunkError(e.reason);
  });
}

// Register PWA Service Worker on load
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => {
        // Automatically check for service worker updates on reload
        reg.update().catch(() => {});
        console.log("Service Worker registered successfully with scope:", reg.scope);
      })
      .catch((err) => console.warn("Service Worker registration failed:", err));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
