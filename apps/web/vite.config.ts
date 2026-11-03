import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Server-side only: the key and base come from the repo-root .env file
  // (META_ prefix keeps them out of import.meta.env), else the environment.
  // They are only used for the dev/preview proxy target and header below,
  // so they never reach the browser bundle.
  const fileEnv = loadEnv(mode, "../..", "META_");
  const apiBase =
    fileEnv.META_API_BASE ??
    process.env.META_API_BASE ??
    "https://api.meta.ai/v1";
  const apiKey = fileEnv.META_API_KEY ?? process.env.META_API_KEY;

  // Forwards Meta Model API calls from the browser without exposing the key:
  // the browser calls same-origin /spark, and this proxy attaches the
  // Authorization header from the server-side environment on every request.
  const sparkProxy: Record<string, ProxyOptions> = {
    "/spark": {
      target: apiBase,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/spark/, ""),
      configure: (proxy) => {
        proxy.on("proxyReq", (proxyReq) => {
          if (apiKey) {
            proxyReq.setHeader("Authorization", `Bearer ${apiKey}`);
          }
        });
      },
    },
  };

  return {
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
          navigateFallbackDenylist: [/^\/spark/, /^\/api/],
          globPatterns: ["**/*.{js,css,html,svg,png,wasm,woff2}"],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
      }),
    ],
    worker: { format: "es" },
    server: { proxy: sparkProxy },
    preview: { proxy: sparkProxy },
  };
});