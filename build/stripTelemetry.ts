import type { Plugin } from "vite";

// AIDEV-NOTE: @mediapipe/tasks-vision ships a hardcoded telemetry POST to
// odml.pa.googleapis.com. photolock promises zero requests after load and the
// build-output test forbids remote URLs, so the URL is blanked at bundle time.
// Netguard would block the call anyway; this removes the URL from the artifact.
const TELEMETRY = /https:\/\/odml\.pa\.googleapis\.com\/[^"'`]*/g;

export function stripTelemetry(): Plugin {
  return {
    name: "photolock-strip-telemetry",
    renderChunk(code) {
      if (!TELEMETRY.test(code)) return null;
      TELEMETRY.lastIndex = 0;
      return { code: code.replace(TELEMETRY, ""), map: null };
    },
  };
}
