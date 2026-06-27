import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global chunk reload handler for handling dynamically imported module failures when new versions are deployed
if (typeof window !== "undefined") {
  const handleChunkError = (error: any) => {
    const errorMsg = String(error?.message || error || "").toLowerCase();
    if (
      errorMsg.includes("failed to fetch dynamically imported module") ||
      errorMsg.includes("importing a module script failed") ||
      errorMsg.includes("failed to fetch")
    ) {
      console.warn("Dynamic import failed. Reloading page to fetch latest assets...", error);
      const lastReload = localStorage.getItem("eduverse:last_chunk_reload");
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        localStorage.setItem("eduverse:last_chunk_reload", String(now));
        window.location.reload();
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
if (typeof window !== "undefined" && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered successfully with scope:', reg.scope))
      .catch(err => console.warn('Service Worker registration failed:', err));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
