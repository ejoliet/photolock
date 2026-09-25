# Developer guide

## Setup

```bash
git clone https://github.com/ejoliet/photolock.git
cd photolock
npm ci
```

Node 22 LTS+ required (`npm ci`). Folder write-back needs a Chromium browser.
`exiftool` and ImageMagick are only needed to generate fixtures, and are run by
Emmanuel, never installed by the agent.

**exifreader postinstall script.** `exifreader` (and a couple of dev
dependencies) ship an npm `postinstall` script. If your npm version enforces
the install-script allowlist (npm's `--ignore-scripts`/"approve scripts"
security feature), run `npm approve-scripts` (or `npm install --foreground-scripts`)
once so `npm ci` doesn't silently skip it.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server at `http://localhost:5173/photolock/` |
| `npm run build` | Hosted build to `dist/` |
| `npm run build:offline` | Single-file offline build to `dist-offline/photolock.html` |
| `npm run preview` | Preview the hosted build |
| `npm test` | Vitest, run once |
| `npm run test:watch` | Vitest, watch mode |
| `npm run test:build` | Runs both builds, then greps their output for disallowed remote URLs and confirms the offline build is a single self-contained file |
| `npm run lint` | ESLint + `tsc --noEmit` |

## Manual checks (Emmanuel)

These need a real browser and are not automated.

| # | Check |
|---|---|
| M1 | Drop the `fixtures/` folder (`npm run dev`, open `http://localhost:5173/photolock/`, use the folder picker or drag-drop). Every image file processes and appears as a card; non-image files are skipped. Click "Download ZIP" and confirm the folder structure from `fixtures/` is preserved, with `<basename>-<presetId>.<ext>` names and `(2)`-style collision suffixes. A file that fails to decode shows an error + "Retry" button and doesn't stop the rest of the batch. |
| M2 | `thumb-leak.jpg` shows a mismatch warning in the leak panel (click its result card, or it auto-shows on the first result), with the original embedded thumbnail visible. |
| M3 | `rotated.jpg` output is upright. Run `exiftool -a -G1 out.jpg` on the output of `gps.jpg` and confirm no metadata (no GPS, no serial) survives. |
| M4 | DevTools Network tab: nothing after load during a 50-file batch. The `#net-counter` UI reads "Requests after load: 0". Use JPEG output: only the JPEG codec is pre-warmed in every worker at boot. WebP/AVIF/PNG codecs load on first use (served from the PWA cache once installed) — a known exception to document if it matters. |
| M5 | `dist-offline/photolock.html` opened with Wi-Fi off processes a JPEG batch end-to-end (decode, resize, encode, ZIP download). **Unverified in this spike**: whether the jsquash WASM codecs actually instantiate from the inlined `data:` URLs under `connect-src 'none'` in a real browser — `assetsInlineLimit` forces every `.wasm` into a base64 `data:` URL at build time, and `new Response(dataUrl).arrayBuffer()`/`WebAssembly.instantiate(bytes)` should never need `connect-src`, but this has only been checked by inspecting build output text (no `http(s)://` refs, no `<script src=`, no `libheif`), not by opening the file in a browser. |
| M6 | Deploy check: `npm run build && npx vite preview`, then repeat M1–M4 on the live Pages URL. |

### Generating fixtures (Emmanuel only, needs exiftool + ImageMagick)

```bash
cd fixtures
exiftool -GPSLatitude=34.0522 -GPSLatitudeRef=N -GPSLongitude=118.2437 -GPSLongitudeRef=W \
  -SerialNumber=TEST123 -o gps.jpg base.jpg
exiftool -Orientation=6 -n -o rotated.jpg base.jpg
magick base.jpg -crop 50%x50%+0+0 cropped.jpg
magick base.jpg -resize 160x120 thumb_original.jpg
exiftool "-ThumbnailImage<=thumb_original.jpg" -o thumb-leak.jpg cropped.jpg
# Add one iPhone HEIC photo as iphone.heic
```

## Open Question defaults applied

- **Q1** (custom domain): not decided; `PHOTOLOCK_BASE` defaults to `/photolock/`.
- **Q2** (libheif in single-file build): default applied — no HEIC in the
  single-file build. `src/core/decode.ts` throws `UnsupportedFormatError`
  before ever importing `libheif-js/wasm-bundle` when
  `import.meta.env.PHOTOLOCK_SINGLEFILE === 'true'`, and
  `vite.singlefile.config.ts` also externalizes that specifier so its WASM is
  never bundled (`grep -c libheif dist-offline/photolock.html` is `0`).
- **Q3** (license-plate model): default applied — manual boxes only.
- **Q4** (MediaPipe under `connect-src 'none'`): default applied — Pro face
  detection is hosted-build only (see "Pro / Q4 spike" below).
- **Q5** (license fulfillment): default applied — manual signing via
  `scripts/sign-license.mjs`.
- **Q6** (Pro price): default applied — $9 one-time, set in `src/pro/gate.ts`.

## Configuration

| Variable | Used by | Required | Description |
|---|---|---|---|
| `PHOTOLOCK_BASE` | `vite.config.ts` | no, default `/photolock/` | Set to `/` for a custom domain |
| `PHOTOLOCK_PUBLIC_KEY` | build | yes for Pro | Ed25519 public key (base64url), embedded at build time |
| `PHOTOLOCK_SIGNING_KEY` | `scripts/sign-license.mjs` | local only | Private key. Never committed, never in CI. |

## Display P3 / color gamut

`core/decode.ts` decodes with `colorSpaceConversion: "default"` and the
encoders write untagged sRGB bytes (no ICC profile is ever attached, since
output strips all metadata). A Display P3 photo (common on iPhone) therefore
loses some gamut on the edges of P3's wider red/green range — colors outside
sRGB get clipped/mapped to their nearest sRGB equivalent. This is an
intentional tradeoff: attaching an ICC profile would reintroduce a metadata
block the whole point of the tool is to strip, and canvas-based re-encoding in
a browser has no simple wide-gamut round trip without one.

## libheif LGPL note

`libheif-js` is LGPL-3.0. It is loaded in the hosted build as its own,
unmodified, separately-fetched module (`import("libheif-js/wasm-bundle")`),
which is the usual LGPL-compliant pattern (the file stays replaceable without
relinking the whole app). It is never bundled into the single-file offline
build (Q2 default: no HEIC offline), so no LGPL inlining question arises
there.

## Pro / Q4 spike

**Q4 default applied: Pro face detection is hosted-build only.** The single-file
build throws `Error('Face detection is hosted-build only (Q4 default)')` from
`src/pro/faces.ts` whenever `import.meta.env.PHOTOLOCK_SINGLEFILE === 'true'`.

**Reason.** `@mediapipe/tasks-vision`'s `FilesetResolver.forVisionTasks(wasmPath)`
and `FaceDetector.createFromOptions(...)` fetch the WASM runtime and the
`.tflite` model by URL at call time. The offline build's CSP is
`connect-src 'none'`, so those fetches would be blocked. Inlining the WASM and
model as base64 and instantiating from bytes would need a custom MediaPipe
loader that bypasses `FilesetResolver`'s network fetch — not attempted here.

**Known risk found in Gate 4 (report, not silently patched):** the built
`@mediapipe/tasks-vision` bundle (`dist/assets/vision_bundle-*.js`) contains a
hardcoded telemetry endpoint, `https://odml.pa.googleapis.com/v1/log`, called
via a `POST` in the library's own usage-logging code. Two layers neutralize it:

1. `build/stripTelemetry.ts` (a Vite plugin used by both build configs) blanks
   that URL out of every emitted chunk, so neither `dist/` nor the offline HTML
   contains it. `tests/build-output.test.ts` enforces this (no allowlist entry).
2. `detectFaces()` is only reachable from the Pro-gated "Add redaction boxes"
   toggle, is lazy-loaded, and any request it still attempted after boot would
   be blocked and counted by netguard (`src/privacy/netguard.ts`).

If MediaPipe is upgraded, re-run `npm run test:build`; a changed endpoint will
fail the build-output test rather than ship.

### Self-hosting MediaPipe assets (hosted build only)

MediaPipe assets are never fetched from a CDN at runtime; they must be copied
into `public/` and committed to the repo:

```bash
mkdir -p public/wasm/mediapipe
cp -r node_modules/@mediapipe/tasks-vision/wasm/* public/wasm/mediapipe/

mkdir -p public/models
curl -L -o public/models/blaze_face_short_range.tflite \
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
```

`src/pro/faces.ts` defaults to `${import.meta.env.BASE_URL}wasm/mediapipe` and
`${import.meta.env.BASE_URL}models/blaze_face_short_range.tflite`.

### License keypair and signing workflow (Q5)

```bash
node scripts/gen-keypair.mjs
# Writes ./.keys/private.key (base64url, mode 0600, gitignored).
# Prints the public key (base64url) -- set this as PHOTOLOCK_PUBLIC_KEY at build time.

PHOTOLOCK_SIGNING_KEY=$(cat .keys/private.key) node scripts/sign-license.mjs --id <order-id>
# Prints base64url(payloadJSON).base64url(sig) -- hand to the buyer.
```

`src/pro/license.ts` verifies keys entirely offline against
`PHOTOLOCK_PUBLIC_KEY` using `@noble/ed25519`. No license server call is ever
made.

### Q6 default: Pro price

`PRO_PRICE_USD = 9` in `src/pro/gate.ts`. `CHECKOUT_URL` is a placeholder
Lemon Squeezy link — Emmanuel sets the real checkout URL before launch.

### Redaction

`applyRedactions(imageData, boxes, mode)` in `src/pro/redact.ts` only supports
`'block'` (solid black) and `'mosaic'` (16px cell average plus per-pixel noise
of +/-24). Gaussian blur is intentionally not offered.

## M1–M6 build notes (Gate 4)

- `src/main.ts` wires `mountPresetPicker` into the `data-preset-slot` div,
  `mountLeakPanel` into `#leak-panel` (shows the report on the first result of
  a batch, and re-shows it whenever a grid card is clicked), and
  `mountProPanel` into `#pro-panel`. On boot it calls `initPro()` and, if a
  recipe hash is present in the URL, loads it into the current selection
  (free to open, per RDD).
- "Write to folder (Pro)" calls `requirePro('folder')` then
  `pickOutputDir()`/`writeResult`; on `WriteDeniedError` or a locked/denied
  picker it falls back to downloading the ZIP.
- "Add redaction boxes (Pro)" is a single toggle: when checked and Pro is
  unlocked, the first file in a dropped batch is decoded, `detectFaces()` is
  attempted (a thrown/rejected face-detection call — e.g. under the
  single-file build — is caught and logged, not fatal), and
  `mountRedactEditor` opens so the user can adjust boxes before saving them
  into `job.redactions`.
- The vendored `src/donate/donate-snippet.js` link is rendered into a
  `<footer>` at the bottom of `#app`.
- `vite.config.ts`'s Workbox `maximumFileSizeToCacheInBytes` is raised to 8 MB
  so the ~3.5 MB AVIF encoder WASM still gets precached (Workbox's 2 MB
  default would otherwise skip it and warn). Service-worker registration
  (`vite-plugin-pwa`'s `registerType: 'autoUpdate'`) happens before
  `markBootComplete()`, and `sw.js`, `workbox-*.js`, `manifest.webmanifest`,
  and `*.svg` (the PWA icons) are in netguard's `bootAllowlist` so the SW's own
  fetches don't trip the "requests after load" counter.
- The offline build (`vite.singlefile.config.ts`) sets `publicDir: false` (the
  hosted build's `public/wasm`, `public/models`, and PWA icons aren't used by
  any offline code path), raises `assetsInlineLimit` so jsquash's
  `new URL('x.wasm', import.meta.url)` WASM assets become `data:` URLs instead
  of separate fetched files, and externalizes `libheif-js/wasm-bundle` so it's
  never bundled. `workers/pool.ts` uses a `?worker&inline` import
  (`InlineProcessWorker`) instead of a module `new URL(...)` worker when
  `PHOTOLOCK_SINGLEFILE === 'true'`, so `process.worker.ts`'s code is
  base64-inlined into `photolock.html` as a Blob URL rather than emitted as a
  separate file. Vite's nested worker sub-build still writes an intermediate
  copy of that worker chunk into `dist-offline/` as a side effect even though
  it's also inlined; the `closeBundle` hook that renames `index.html` to
  `photolock.html` also deletes every other file left in `dist-offline/`, so
  the final output is exactly one file.
- The offline CSP is rewritten in `transformIndexHtml` (same plugin file):
  `connect-src 'self'` → `connect-src 'none'` (everything is inlined, zero
  fetches), and `worker-src`/`img-src` gain `data:` (inlined workers and the
  redaction canvas use blob/data URLs). No `'unsafe-inline'` was needed for
  `script-src`/`style-src` in this build.
- `tests/build-output.test.ts` only runs its assertions when `dist/` and/or
  `dist-offline/photolock.html` already exist, so plain `npm test` (no builds)
  stays fast; `npm run test:build` builds both first.
