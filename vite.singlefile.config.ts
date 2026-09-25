import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { stripTelemetry } from "./build/stripTelemetry";
import { readdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// AIDEV-NOTE: vite-plugin-singlefile always emits index.html; rename to photolock.html
// in closeBundle so the offline artifact matches the RDD-specified filename. This also
// deletes every other file `dist-offline/` ends up with: Vite's `?worker&inline` query
// (used by workers/pool.ts for the single-file build) already base64-inlines the worker
// code into photolock.html, but Vite's nested worker sub-build still writes its
// intermediate chunk to outDir as a side effect — that copy is redundant and must not
// ship, per the RDD "exactly one file" requirement.
function renamePhotolockHtml(): Plugin {
  return {
    name: "photolock-rename-html",
    closeBundle() {
      const outDir = resolve(__dirname, "dist-offline");
      try {
        renameSync(resolve(outDir, "index.html"), resolve(outDir, "photolock.html"));
      } catch {
        // AIDEV-NOTE: no-op if index.html is already renamed or missing (repeat builds)
      }
      try {
        for (const entry of readdirSync(outDir)) {
          if (entry !== "photolock.html") rmSync(resolve(outDir, entry), { recursive: true, force: true });
        }
      } catch {
        // AIDEV-NOTE: no-op if outDir doesn't exist yet
      }
    },
  };
}

export default defineConfig({
  base: "./",
  // AIDEV-NOTE: the hosted build's public/wasm, public/models, and PWA icons are
  // fetched by URL and don't belong in a single-HTML offline artifact (models/wasm
  // aren't even referenced by the offline code paths); turning off publicDir keeps
  // dist-offline/ to just photolock.html.
  publicDir: false,
  build: {
    outDir: "dist-offline",
    // AIDEV-NOTE: inline everything (JS/CSS/workers) into one HTML file. jsquash's
    // `new URL('x.wasm', import.meta.url)` assets become base64 data: URLs because
    // Vite's asset-inlining threshold is raised well above any codec's wasm size.
    assetsInlineLimit: 100 * 1024 * 1024,
    rollupOptions: {
      // AIDEV-NOTE: Q2 default — libheif-js is never bundled into the offline build.
      // decode.ts guards HEIC decode with a PHOTOLOCK_SINGLEFILE check before this
      // import is ever reached, so externalizing it here just keeps its wasm out of
      // the output entirely (verified by grep in tests/build-output.test.ts).
      external: ["libheif-js/wasm-bundle"],
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  define: {
    "import.meta.env.PHOTOLOCK_SINGLEFILE": JSON.stringify("true"),
    "import.meta.env.PHOTOLOCK_PUBLIC_KEY": JSON.stringify(
      process.env.PHOTOLOCK_PUBLIC_KEY ?? "",
    ),
  },
  plugins: [stripTelemetry(), viteSingleFile({ useRecommendedBuildConfig: true, removeViteModuleLoader: true }), rewriteOfflineCsp(), renamePhotolockHtml()],
});

// AIDEV-NOTE: the hosted CSP meta (index.html) uses connect-src 'self' because WASM/
// models are same-origin fetches; the offline build inlines everything as data: URLs
// with zero fetches, so connect-src tightens to 'none'. worker-src/img-src gain
// blob: data: because inlined workers and the redaction canvas both use blob/data URLs
// in this build. script-src/style-src keep 'wasm-unsafe-eval' only — no 'unsafe-inline'
// was needed in this spike; vite-plugin-singlefile inlines script/style tags without
// requiring inline-script execution outside the module graph.
function rewriteOfflineCsp(): Plugin {
  return {
    name: "photolock-offline-csp",
    transformIndexHtml(html) {
      return html
        .replace("connect-src 'self';", "connect-src 'none';")
        .replace("worker-src 'self' blob:;", "worker-src 'self' blob: data:;")
        .replace("img-src 'self' blob: data:;", "img-src 'self' blob: data:;");
    },
  };
}
