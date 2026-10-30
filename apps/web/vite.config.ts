import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

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
});