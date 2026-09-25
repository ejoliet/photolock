import { installNetguard, markBootComplete } from "./privacy/netguard";
import { getSharedPool } from "./workers/pool";

// AIDEV-NOTE: Netguard must install before any other module has a chance to touch
// fetch/XHR/WebSocket, so this import + call stays first in the module.
installNetguard({
  bootAllowlist: [
    /\.wasm$/,
    /\.tflite$/,
    /\/assets\//,
    /sw\.js$/,
    /workbox-.*\.js$/,
    /manifest\.webmanifest$/,
    /\.svg$/,
  ],
});

import { mountNetCounter } from "./ui/netCounter";
import { mountDropzone } from "./ui/dropzone";
import { mountGrid } from "./ui/grid";
import { mountPresetPicker } from "./ui/presetPicker";
import type { PresetSelection } from "./ui/presetPicker";
import { mountLeakPanel } from "./ui/leakPanel";
import { mountProPanel } from "./ui/proPanel";
import { runJob } from "./core/pipeline";
import { outputName } from "./io/naming";
import { buildZip, downloadBlob } from "./io/zip";
import { pickOutputDir, writeResult } from "./io/folderWrite";
import { WriteDeniedError } from "./core/errors";
import type { CollectedFile } from "./io/input";
import type { Box, Job, Preset, ProcessResult } from "./core/types";
import { initPro, isPro, requirePro } from "./pro/gate";
import { readRecipeFromLocation } from "./pro/recipes";
import { mountRedactEditor } from "./ui/redactEditor";
import { decodeFile } from "./core/decode";
import presetsJson from "./presets/presets.json";
import { renderDonateLink } from "./donate/donate-snippet.js";

function loadPresets(): Preset[] {
  return presetsJson as Preset[];
}

// AIDEV-NOTE: encoding runs in workers, and each worker fetches its codec WASM on first
// use. Warm the JPEG codec (the default format) in every worker while still in the boot
// phase, so a first batch makes no requests after load. Other formats load on first use
// and are documented in DEVELOPER.md (M4).
async function warmCodecs(): Promise<void> {
  try {
    await getSharedPool().warm(["jpeg"]);
  } catch {
    // AIDEV-NOTE: warm-up is best-effort; a real failure surfaces as EncodeError later.
  }
}

async function boot(): Promise<void> {
  await warmCodecs();

  // AIDEV-NOTE: register the service worker (hosted PWA build only; Workbox injects
  // the registration no-op on the offline build) before markBootComplete(), so its
  // network activity is counted as boot-phase, matching the netguard boot allowlist.
  markBootComplete();

  const counterEl = document.getElementById("net-counter");
  if (counterEl) mountNetCounter(counterEl);

  const app = document.getElementById("app");
  const dropzoneEl = document.getElementById("dropzone");
  const gridEl = document.getElementById("grid");
  const leakPanelEl = document.getElementById("leak-panel");
  const proPanelEl = document.getElementById("pro-panel");
  if (!app || !dropzoneEl || !gridEl) return;

  const presets = loadPresets();

  const presetSlot = document.createElement("div");
  presetSlot.setAttribute("data-preset-slot", "");
  app.insertBefore(presetSlot, gridEl);

  let selection: PresetSelection = { presetIds: [], format: "jpeg" };
  mountPresetPicker(presetSlot, presets, (s) => {
    selection = s;
  });

  const zipButton = document.createElement("button");
  zipButton.type = "button";
  zipButton.textContent = "Download ZIP";
  zipButton.disabled = true;

  const folderButton = document.createElement("button");
  folderButton.type = "button";
  folderButton.textContent = "Write to folder (Pro)";

  const redactToggle = document.createElement("label");
  const redactCheckbox = document.createElement("input");
  redactCheckbox.type = "checkbox";
  redactToggle.appendChild(redactCheckbox);
  redactToggle.appendChild(document.createTextNode(" Add redaction boxes (Pro)"));

  const controls = document.createElement("div");
  controls.id = "controls";
  controls.appendChild(zipButton);
  controls.appendChild(folderButton);
  controls.appendChild(redactToggle);
  app.insertBefore(controls, presetSlot);

  const redactEditorEl = document.createElement("div");
  redactEditorEl.id = "redact-editor";
  app.appendChild(redactEditorEl);

  const leakPanel = leakPanelEl ? mountLeakPanel(leakPanelEl) : undefined;

  const grid = mountGrid(gridEl, (result: ProcessResult) => {
    leakPanel?.show(result.report);
  });

  if (proPanelEl) {
    mountProPanel(proPanelEl, {
      onChange: () => {
        /* no state kept here; isPro() is read at use time */
      },
      getRecipe: () => ({
        v: 1,
        presetIds: selection.presetIds,
        targetKB: selection.targetKB,
        format: selection.format,
      }),
    });
  }

  await initPro();
  const sharedRecipe = readRecipeFromLocation();
  if (sharedRecipe) {
    selection = { presetIds: sharedRecipe.presetIds, targetKB: sharedRecipe.targetKB, format: sharedRecipe.format };
  }

  const footer = document.createElement("footer");
  footer.appendChild(renderDonateLink());
  app.appendChild(footer);

  const zipEntries: { path: string; bytes: Uint8Array }[] = [];
  const takenNames = new Set<string>();
  let firstResultShown = false;
  const jobRedactions: Record<string, Box[]> = {};

  zipButton.addEventListener("click", () => {
    if (zipEntries.length === 0) return;
    downloadBlob(buildZip(zipEntries), "photolock.zip");
  });

  folderButton.addEventListener("click", () => {
    void handleFolderWrite();
  });

  async function handleFolderWrite(): Promise<void> {
    try {
      requirePro("folder");
      const dir = await pickOutputDir();
      for (const entry of zipEntries) {
        await writeResult(dir, entry.path, entry.bytes);
      }
    } catch (err) {
      if (err instanceof WriteDeniedError) {
        downloadBlob(buildZip(zipEntries), "photolock.zip");
      } else {
        // AIDEV-NOTE: locked Pro feature or picker cancellation — fall back to ZIP
        // silently rather than throwing out of an event handler.
        downloadBlob(buildZip(zipEntries), "photolock.zip");
      }
    }
  }

  async function maybeOfferRedaction(files: CollectedFile[]): Promise<void> {
    if (!redactCheckbox.checked || !isPro()) return;
    const first = files[0];
    if (!first) return;
    try {
      const bitmap = await decodeFile(first.file);
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
      if (!ctx) {
        bitmap.close();
        return;
      }
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      bitmap.close();

      let boxes: Box[] = [];
      try {
        // AIDEV-NOTE: lazy import keeps MediaPipe (~large) out of the main bundle until Pro opt-in.
        const { detectFaces } = await import("./pro/faces");
        boxes = await detectFaces(imageData);
      } catch (err) {
        console.error("Face detection unavailable:", err);
      }

      const editor = mountRedactEditor(redactEditorEl, imageData, boxes);
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.textContent = "Save redaction boxes";
      saveButton.addEventListener("click", () => {
        jobRedactions[first.relPath] = editor.getBoxes();
        editor.destroy();
        saveButton.remove();
      });
      redactEditorEl.appendChild(saveButton);
    } catch (err) {
      console.error("Redaction editor unavailable:", err);
    }
  }

  function runBatch(files: CollectedFile[], presetIds: string[]): void {
    const job: Job = {
      files: files.map((f) => f.file),
      presetIds,
      targetKB: selection.targetKB,
      redactions: jobRedactions,
      output: "zip",
    };
    const relPathByName = new Map(files.map((f) => [f.file.name, f.relPath]));
    const fileByName = new Map(files.map((f) => [f.file.name, f]));

    void runJob(
      job,
      presets,
      (result: ProcessResult) => {
        grid.addResult(result);
        if (!firstResultShown) {
          firstResultShown = true;
          leakPanel?.show(result.report);
        }
        const relPath = relPathByName.get(result.file) ?? result.file;
        const path = outputName(relPath, result.presetId, result.format, takenNames);
        zipEntries.push({ path, bytes: result.bytes });
        zipButton.disabled = zipEntries.length === 0;
      },
      (done, total, failed) => {
        grid.setProgress(done, total);
        for (const f of failed) {
          const original = fileByName.get(f.file);
          if (!original) continue;
          grid.markFailed(f.file, f.error, () => runBatch([original], presetIds));
        }
      },
    );
  }

  mountDropzone(dropzoneEl, (files) => {
    const selectedIds = selection.presetIds.length > 0 ? selection.presetIds : [presets[0]?.id ?? ""].filter(Boolean);
    if (selectedIds.length === 0 || files.length === 0) return;
    firstResultShown = false;
    void maybeOfferRedaction(files).finally(() => runBatch(files, selectedIds));
  });
}

void boot();
