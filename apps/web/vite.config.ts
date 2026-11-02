import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Forwards Meta Model API calls from the browser without exposing the key:
// the browser calls same-origin /spark, and this proxy attaches the
// Authorization header from the server-side environment on every request.
const sparkProxy: Record<string, ProxyOptions> = {
  "/spark": {
    target: process.env.META_API_BASE ?? "https://api.meta.ai/v1",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/spark/, ""),
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq) => {
        const apiKey = process.env.META_API_KEY;
        if (apiKey) {
          proxyReq.setHeader("Authorization", `Bearer ${apiKey}`);
        }
      });
    },
  },
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Makes KEEPLIT installable and caches everything (including the 3.5 MB solver) so it opens with no internet.
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "KEEPLIT",
        short_name: "KEEPLIT",
        description: "AI operator for solar, battery and generator",
        theme_color: "#0A0C10",
        background_color: "#0A0C10",
        display: "standalone",
        icons: [{ src: "favicon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,wasm,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: "es" },
  server: { proxy: sparkProxy },
  preview: { proxy: sparkProxy },
});