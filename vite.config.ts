import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000",
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            console.warn("Vite API proxy error:", err.message);
            if (res && !res.headersSent) {
              if (typeof res.writeHead === "function") {
                res.writeHead(502, { "Content-Type": "application/json" });
              }
              res.end(
                JSON.stringify({
                  error: "Bad Gateway",
                  message: "FastAPI Backend is not reachable. Ensure the backend server is running on port 8000.",
                })
              );
            }
          });
        },
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000",
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            console.warn("Vite API proxy error:", err.message);
            if (res && !res.headersSent) {
              if (typeof res.writeHead === "function") {
                res.writeHead(502, { "Content-Type": "application/json" });
              }
              res.end(
                JSON.stringify({
                  error: "Bad Gateway",
                  message: "FastAPI Backend is not reachable. Ensure the backend server is running on port 8000.",
                })
              );
            }
          });
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt", "pwa-512.png"],
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Never let the service worker intercept Supabase API/auth/storage/realtime
        // calls — that was the source of opaque "Failed to fetch" errors on sign-in.
        navigateFallbackDenylist: [/^\/api/, /supabase\.co/, /functions\.supabase\.co/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith("supabase.co"),
            handler: "NetworkOnly",
            method: "GET",
            options: { cacheName: "supabase-passthrough" },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith("supabase.co"),
            handler: "NetworkOnly",
            method: "POST",
          },
        ],
      },
      manifest: {
        name: "AltRix Parent Portal",
        short_name: "AltRix",
        description: "AltRix — The AI-Powered School Operating System",
        theme_color: "#2563eb",
        background_color: "#f8fafc",
        display: "standalone",
        scope: "/",
        start_url: "/",
        orientation: "portrait",
        categories: ["education", "productivity"],
        icons: [
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("jszip")) {
              return "vendor-pdf-zip";
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 2000,
  },
}));
