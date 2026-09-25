import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { stripTelemetry } from "./build/stripTelemetry";

// AIDEV-NOTE: PHOTOLOCK_BASE lets Emmanuel switch to '/' for a custom domain (Q1) without code changes.
export default defineConfig({
  base: process.env.PHOTOLOCK_BASE ?? "/photolock/",
  build: {
    outDir: "dist",
  },
  worker: {
    format: "es",
  },
  define: {
    "import.meta.env.PHOTOLOCK_PUBLIC_KEY": JSON.stringify(
      process.env.PHOTOLOCK_PUBLIC_KEY ?? "",
    ),
  },
  plugins: [
    stripTelemetry(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      workbox: {
        globPatterns: ["**/*.{html,js,css,wasm,tflite,json}"],
        // AIDEV-NOTE: the avif codec wasm is ~3.5 MB; Workbox's 2 MB default
        // precache limit would otherwise skip it and warn at build time.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      manifest: {
        name: "photolock",
        short_name: "photolock",
        start_url: "./",
        display: "standalone",
        theme_color: "#111111",
        background_color: "#111111",
        icons: [
          { src: "icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
      },
      includeAssets: ["icon-192.svg", "icon-512.svg"],
    }),
  ],
});
