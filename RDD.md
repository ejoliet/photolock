# photolock

> See what your photos leak, strip it, and resize for any platform, in the browser, with proof that nothing is uploaded.

Status: **RDD spec (Type A)**. No code yet. A coding agent implements from this file.

---

## Purpose

**Problem.** Many browser tools already do batch resize plus EXIF stripping with a "never uploads" claim. Users can't verify that claim. They also don't know what a photo leaks beyond GPS. The classic example is an embedded EXIF thumbnail that still shows the *original, uncropped* image.

**Solution.** photolock is a static web app with four parts:

1. **Leak report.** For each photo, list every metadata block, and flag an embedded thumbnail that differs from the main image.
2. **Clean output.** Re-encode from pixels, so no metadata survives by default.
3. **Platform presets and "under X KB" mode.** Resize or compress to fit a platform size or a file-size limit.
4. **Offline proof.** A strict Content Security Policy (CSP), a live network counter, and a single-file build that runs with Wi-Fi off.

**Scope.** This is a cheap test of search traffic and the payment setup, not a main bet. Free core, plus a one-time Pro unlock: face blur with manual redaction boxes, folder write-back, and saved recipes.

---

## Hosting decision

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **GitHub Pages** (`ejoliet.github.io/photolock`) | Free, same origin as the existing donate snippet, deploys via Actions | No custom HTTP headers: CSP only via `<meta>` (no `frame-ancestors`, no `report-uri`, no `Permissions-Policy`); no COOP/COEP headers | **MVP choice** |
| Cloudflare Pages | Real headers via `_headers`, including COOP/COEP | New account and surface to manage | Move here only if headers become necessary |
| Custom domain on either | Better SEO than a `github.io` subpath; SEO is the survival mechanism | ~$10–15/yr | Add before any SEO push (Open Question Q1) |

> 💡 Because GitHub Pages can't send COOP/COEP headers, `SharedArrayBuffer` is unavailable. So the stack avoids `wasm-vips`, which hard-requires it. Parallelism comes from a pool of single-threaded workers instead.

---

## Architecture

```
Files / folder (drag-drop, picker)
        │
        ▼
  io/input.ts ──► job queue ──► workers/pool.ts ──► N × process.worker.ts
                                                     │ 1. scan leaks (ExifReader)
                                                     │ 2. decode (createImageBitmap | libheif)
                                                     │ 3. [Pro] redact boxes
                                                     │ 4. resize (jSquash resize)
                                                     │ 5. encode (jSquash mozjpeg/webp/avif/png)
                                                     │ 6. [target KB] quality search loop
                                                     ▼
                                              result {bytes, report}
        ┌─────────────────────────────┬───────────────────┘
        ▼                             ▼
  io/zip.ts (fflate, free)    io/folderWrite.ts (File System Access, Pro)

privacy/netguard.ts ── wraps fetch/XHR/beacon/WebSocket + PerformanceObserver ──► UI counter
```

| Component | Responsibility |
|---|---|
| `core/leaks.ts` | Parse EXIF, XMP, IPTC, ICC, MPF, PNG text chunks, WebP EXIF chunk. Produce a `LeakReport`. |
| `core/thumbCompare.ts` | Extract the embedded thumbnail, compute a perceptual hash (dHash) against the main image, and flag a mismatch. |
| `core/decode.ts` | Native decode first. HEIC falls back to libheif only when native decode fails. Always applies EXIF orientation. |
| `core/resize.ts` | Fit modes `contain`, `cover` (center crop), and `width-only`. Never upscales unless the user opts in. |
| `core/encode.ts` | Format plus quality to bytes. Output carries no metadata. |
| `core/targetSize.ts` | Binary-search quality to fit under `maxKB`, with a downscale fallback. |
| `workers/pool.ts` | Pool size `min(hardwareConcurrency - 1, 4)`, at least 1. Streams results; never holds all decoded bitmaps in memory. |
| `privacy/netguard.ts` | Count and block any request after boot. Exposes a `requestsAfterBoot` counter to the UI. |
| `pro/*` | License check, face detection, redaction, and recipes. |

---

## Recommended stack

Versions and licenses come from the npm registry, checked 2026-09-24.

| Layer | Chosen | Latest | License | Why | Rejected |
|---|---|---|---|---|---|
| Build | Vite + `vite-plugin-singlefile` + `vite-plugin-pwa` | 8.3.1 / 2.3.3 / 1.3.0 | MIT | Worker and WASM bundling, single-file offline build, offline service worker | No-build vanilla (WASM codecs need bundling) |
| Codecs | `@jsquash/jpeg`, `webp`, `avif`, `png`, `resize` | 1.6.0 / 1.5.0 / 2.1.1 / 3.1.1 / 2.1.1 | Apache-2.0 | Squoosh codecs, modular, single-thread builds work without COOP/COEP | `wasm-vips` 0.0.18 (needs `SharedArrayBuffer`); `pica` 10.0.3 (resize only); `@silvia-odwyer/photon` 0.3.3 (weaker encoders) |
| Metadata | `exifreader` | 4.45.2 | MPL-2.0 | Active; covers EXIF, XMP, IPTC, ICC, MPF, and thumbnails | `exifr` (last release 2021) |
| HEIC | `libheif-js` | 1.23.2 | LGPL-3.0 | Active | `heic2any` (last release 2023); `heic-to` (also LGPL, wraps libheif) |
| ZIP | `fflate` | 0.8.3 | MIT | Small, streaming | `jszip` (heavier); `client-zip` (fine, but needs a streaming download path) |
| Faces (Pro) | `@mediapipe/tasks-vision` face detector | 1.0.1 | Apache-2.0 | On-device, WASM plus model file | License-plate models deferred (Q3) |
| License check | `@noble/ed25519` | 3.2.0 | MIT | Offline Ed25519 verification, matches the portfolio pattern | WebCrypto Ed25519 (uneven browser support) |
| UI | Vanilla TypeScript, no framework | — | — | Small bundle, fast first load for SEO | React (adds weight for no gain) |

> ⚠️ `libheif-js` is LGPL-3.0. Loading it as a separate, unmodified, replaceable WASM file is the usual compliant pattern. Inlining it into the single-file build needs a decision (Q2). This is not legal advice.

---

## Repository layout

```
photolock/
├── index.html                  # CSP <meta>, app shell
├── src/
│   ├── main.ts                 # Boot: netguard first, then UI
│   ├── ui/                     # dropzone.ts, grid.ts, leakPanel.ts, netCounter.ts, presetPicker.ts
│   ├── core/                   # decode.ts, resize.ts, encode.ts, targetSize.ts, leaks.ts, thumbCompare.ts, pipeline.ts
│   ├── workers/                # pool.ts, process.worker.ts
│   ├── io/                     # input.ts, zip.ts, folderWrite.ts, naming.ts
│   ├── privacy/netguard.ts
│   ├── pro/                    # license.ts, faces.ts, redact.ts, recipes.ts, gate.ts
│   ├── presets/presets.json    # Versioned platform presets
│   └── donate/                 # Vendored copy of donate-snippet.js (never loaded remotely)
├── public/
│   ├── wasm/                   # Copied codec, libheif, and MediaPipe WASM (self-hosted)
│   └── models/                 # Face detector .tflite (self-hosted)
├── tests/                      # Vitest unit tests
├── fixtures/                   # Test images (see Testing)
├── scripts/
│   ├── gen-keypair.mjs         # Writes private key to ./.keys/ (gitignored)
│   └── sign-license.mjs        # Reads PHOTOLOCK_SIGNING_KEY from env
├── vite.config.ts              # Hosted build, base '/photolock/'
├── vite.singlefile.config.ts   # Offline single-HTML build
├── .github/workflows/          # ci.yml, deploy.yml
├── DEVELOPER.md
├── LICENSE                     # MIT
└── README.md
```

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 22 LTS+ | `npm ci` |
| Browser for dev | Chrome/Edge current | Folder write-back is Chromium-only |
| exiftool | any recent | Only for generating fixtures (Emmanuel runs it) |

---

## Quick start

```bash
git clone https://github.com/ejoliet/photolock.git
cd photolock
npm ci
npm run dev              # http://localhost:5173/photolock/
npm run build            # dist/          hosted build
npm run build:offline    # dist-offline/photolock.html  single file
npm test
```

---

## Configuration reference

This is a static app with no runtime environment variables. Build and script variables:

| Variable | Used by | Required | Description |
|---|---|---|---|
| `PHOTOLOCK_BASE` | `vite.config.ts` | no, default `/photolock/` | Set to `/` for a custom domain |
| `PHOTOLOCK_PUBLIC_KEY` | build | yes for Pro | Ed25519 public key (base64url), embedded at build time |
| `PHOTOLOCK_SIGNING_KEY` | `scripts/sign-license.mjs` | local only | Private key. **Never** committed, never in CI. |

> ⚠️ Add `.keys/` and `.env*` to `.gitignore` in Phase 0. Run the `ship-check` skill before the repo or any release goes public.

---

## Interface contract

### CSP (hosted build, in `index.html`)

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  worker-src 'self' blob:;
  connect-src 'self';
  img-src 'self' blob: data:;
  style-src 'self';
  object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
```

- `connect-src 'self'` is required, because WASM and model files are fetched from the same origin.
- The single-file build uses `connect-src 'none'`. WASM is inlined as base64 and instantiated from bytes, with no fetch.
- Stripe donation is a plain link, so it's a navigation, not a request.

### Netguard

```ts
// src/privacy/netguard.ts
export function installNetguard(opts: { bootAllowlist: RegExp[] }): void;
export function markBootComplete(): void;          // Call after WASM and models are loaded
export function onRequest(cb: (e: NetEvent) => void): void;
export interface NetEvent { url: string; phase: "boot" | "after-boot"; blocked: boolean; via: "fetch"|"xhr"|"beacon"|"ws"|"resource" }
```

After `markBootComplete()`, any `fetch`, XHR, `sendBeacon`, or WebSocket call is blocked, and it's counted as a `NetguardError`. `PerformanceObserver('resource')` counts anything the wrappers miss. The UI shows **"Requests after load: 0"** and lists the boot-time assets.

### Data model

```ts
interface Preset {
  id: string; platform: string; label: string;
  width: number; height?: number;
  fit: "contain" | "cover" | "width-only";
  format: "jpeg" | "webp" | "avif" | "png";
  quality?: number; maxKB?: number;
  lastVerified: string | null; sourceUrl: string | null;  // Emmanuel fills these in
}

interface LeakReport {
  file: string;
  items: { block: "EXIF"|"XMP"|"IPTC"|"ICC"|"MPF"|"PNG-text"|"WebP-EXIF";
           key: string; value: string;
           severity: "high"|"medium"|"low" }[];   // GPS, serial, owner = high
  gps?: { lat: number; lon: number };
  thumbnail?: { present: true; mismatch: boolean; distance: number; dataUrl: string };
}

interface Job {
  files: File[]; presetIds: string[];
  targetKB?: number; redactions?: Record<string, Box[]>;   // Pro
  output: "zip" | "folder";                                 // folder = Pro
}

interface Box { x: number; y: number; w: number; h: number; source: "auto"|"manual" }
```

### Seed presets

The agent ships **only** these generic sizes, all with `lastVerified: null`. Emmanuel verifies and adds platform-specific ones. The agent must not invent platform specs.

| id | Size | Fit |
|---|---|---|
| `square-1080` | 1080×1080 | cover |
| `portrait-1080x1350` | 1080×1350 | cover |
| `story-1080x1920` | 1080×1920 | cover |
| `og-1200x630` | 1200×630 | cover |
| `web-1920w` | 1920 wide | width-only |

### Target size algorithm

1. Encode at q=85. If the size is at most `maxKB`, stop.
2. Binary-search quality in [30, 85], with at most 7 iterations.
3. If q=30 still doesn't fit, downscale by 0.85 and repeat. Allow at most 4 downscales.
4. If it still doesn't fit, return `TargetUnreachableError` with the best result attached.

### Recipes (Pro to save, free to open)

The URL hash `#r=<base64url(JSON{v:1, presetIds, targetKB, format, quality})>` holds settings only, never image data. Opening a shared recipe works without a license.

### License

- **Key format:** `base64url(payloadJSON).base64url(sig)`.
- **Payload:** `{v:1, product:"photolock", tier:"pro", id:string, issued:"YYYY-MM-DD"}`. It contains no email or other personal data.
- **Verification:** offline, with `@noble/ed25519` against `PHOTOLOCK_PUBLIC_KEY`.
- **Storage:** the key is kept in `localStorage`.
- **No license server call, ever.** A server call would break the zero-request promise.

### Redaction (Pro)

- The face detector proposes boxes. The user reviews them, adds manual boxes, or deletes boxes before anything is applied.
- The fill is a **solid block or a coarse mosaic plus noise, never a Gaussian blur**, because a blur can be partially reversed.
- The UI copy says "helps hide", never "anonymizes" or "safe".

---

## Error handling

| Error | When | UI behavior |
|---|---|---|
| `UnsupportedFormatError` | Format not decodable natively or by libheif | Mark the file failed; keep the batch going |
| `DecodeError` | Corrupt file | Same as above |
| `TooLargeError` | More than 100 MP decoded | Skip with a message (protects tab memory) |
| `EncodeError` | Codec failure | Retry once, then mark failed |
| `TargetUnreachableError` | Can't reach `maxKB` | Offer the best result along with its actual size |
| `WriteDeniedError` | Folder permission revoked | Fall back to ZIP |
| `LicenseInvalidError` | Bad signature or format | Show a message; Pro stays locked |
| `NetguardError` | Request attempted after boot | Block it, show it red in the counter, log it to the console |

A failed file never aborts the batch. Failed files get a retry button.

---

## Testing

```bash
npm test          # Vitest: core logic, no browser
npm run lint      # eslint + tsc --noEmit
```

| Suite | Covers |
|---|---|
| `targetSize.test.ts` | Search converges, respects iteration caps, downscale fallback |
| `resize.test.ts` | Fit-mode geometry, no upscaling, orientation-aware sizes |
| `leaks.test.ts` | Fixture parsing: GPS, serial, and thumbnail detected |
| `thumbCompare.test.ts` | dHash distance separates matching and mismatched thumbnails |
| `license.test.ts` | Valid key, tampered key, wrong product (uses a test keypair made in-test) |
| `recipes.test.ts` | Encode/decode round-trip; rejects unknown `v` |
| `naming.test.ts` | Output names, collision suffixes, folder structure kept in the ZIP |

### Fixtures (Emmanuel generates these; the agent does not install exiftool)

```bash
cd fixtures
exiftool -GPSLatitude=34.0522 -GPSLatitudeRef=N -GPSLongitude=118.2437 -GPSLongitudeRef=W \
  -SerialNumber=TEST123 -o gps.jpg base.jpg
exiftool -Orientation=6 -n -o rotated.jpg base.jpg
# Leaking-thumbnail fixture: main image cropped, thumbnail still from the original
magick base.jpg -crop 50%x50%+0+0 cropped.jpg
magick base.jpg -resize 160x120 thumb_original.jpg
exiftool "-ThumbnailImage<=thumb_original.jpg" -o thumb-leak.jpg cropped.jpg
# Add one iPhone HEIC photo as iphone.heic
```

---

## Non-goals (v1)

- Fit-without-crop with borders or blur-fill (Instasize style). Deferred to v2.
- Android share target (Web Share Target API). Deferred to v2.
- Face-aware smart crop. v1 `cover` mode is a center crop.
- Automatic license-plate detection. Manual boxes cover plates in v1 (Q3).
- Filters, text overlays, collages.
- Any backend, analytics, or telemetry, including "privacy-friendly" analytics.
- RAW camera formats, GIF animation, and video.
- Keeping selected metadata (for example copyright). v1 strips everything.

---

## Open questions

- [ ] **Q1** Custom domain now or after launch? It affects `PHOTOLOCK_BASE` and SEO. Owner: Emmanuel.
- [ ] **Q2** Inline `libheif-js` in the single-file build (LGPL obligations), or ship the offline build without HEIC? Default until resolved: **no HEIC in the single-file build.**
- [ ] **Q3** Is there a license-plate model with a permissive license (not AGPL)? Default: manual boxes only.
- [ ] **Q4** Does MediaPipe tasks-vision run from inlined bytes under `connect-src 'none'`? Default until the Gate-3 spike proves it: **Pro face detection is hosted-build only.**
- [ ] **Q5** License fulfillment with zero backend: sign keys manually per sale at first, or add a tiny webhook signer later? Default: manual signing (`scripts/sign-license.mjs`), with Lemon Squeezy as checkout only.
- [ ] **Q6** Pro price. Default: $9 one-time, set in `src/pro/gate.ts`.

---

## Agent build instructions

> Implement end-to-end from this README. Use the defaults under Open Questions; don't block on them.
> Don't spend tokens on browser or visual checks, GitHub pushes and PRs, or heavy installs (exiftool, ImageMagick, Playwright). List exact commands for Emmanuel in `DEVELOPER.md` instead.

### Build order (gated)

| Gate | Deliverable | Done when |
|---|---|---|
| 0 | Scaffold: Vite + TypeScript strict, eslint, vitest, CI, `.gitignore` (`.keys/`, `.env*`), CSP meta, netguard | `npm run lint && npm test` pass; netguard unit test blocks a post-boot fetch |
| 1 | Pipeline: input (files, folder input, drag-drop folders), worker pool, decode (native + HEIC fallback), resize, encode, ZIP | Unit tests pass; `DEVELOPER.md` lists manual check M1 |
| 2 | Leak report + thumbnail mismatch + seed presets + target-KB mode | `leaks`, `thumbCompare`, `targetSize` tests pass |
| 3 | Pro: license, recipes, folder write-back, face detection + manual boxes + redaction | `license`, `recipes` tests pass; Q4 spike result written to `DEVELOPER.md` |
| 4 | Single-file build, PWA offline cache, GitHub Pages deploy workflow, vendored donate link | `npm run build:offline` emits one HTML file with no external refs (checked by a test on the output) |

### File map (key symbols)

| File | Symbols |
|---|---|
| `src/core/pipeline.ts` | `runJob(job, onResult, onProgress)` |
| `src/core/targetSize.ts` | `fitToSize(bitmap, fmt, maxKB)` |
| `src/core/leaks.ts` | `scanLeaks(file): Promise<LeakReport>` |
| `src/core/thumbCompare.ts` | `dHash(bitmap)`, `hamming(a, b)` |
| `src/workers/pool.ts` | `createPool(size)`, `pool.submit(task)` |
| `src/io/folderWrite.ts` | `pickOutputDir()`, `writeResult(dir, path, bytes)` |
| `src/pro/license.ts` | `verifyLicense(key): LicensePayload` |
| `src/pro/redact.ts` | `applyRedactions(imageData, boxes, mode)` |

### Constraints

- TypeScript `strict`. No `any` in `core/`.
- **No remote URLs anywhere in the build output.** All WASM, models, and fonts are self-hosted. Use system fonts.
- Decoded pixels must never touch storage. Only settings and the license go in `localStorage`.
- Apply EXIF orientation *before* stripping, so output is never sideways.
- Decode to sRGB; output is untagged sRGB. Document the small gamut loss for Display P3 photos.
- Release `ImageBitmap`s (`close()`) and transferables promptly.
- Use grep-friendly `AIDEV-NOTE:` / `AIDEV-TODO:` comments on non-obvious decisions only.
- Private signing keys never go in the repo, CI, or the build.

### Acceptance criteria

- [ ] `npm run lint && npm test` pass in CI.
- [ ] The build output contains zero `http(s)://` references except the Stripe and Lemon Squeezy links (test greps `dist/` and `dist-offline/`).
- [ ] Netguard blocks and counts a synthetic post-boot fetch (unit test).
- [ ] `DEVELOPER.md` lists manual checks M1–M6 with exact steps (below).
- [ ] Open Questions resolved or their defaults applied and noted.

### Manual checks for Emmanuel (put in `DEVELOPER.md`)

| # | Check |
|---|---|
| M1 | Drop the `fixtures/` folder. Every file processes, and the ZIP keeps the folder structure. |
| M2 | `thumb-leak.jpg` shows a mismatch warning with the original thumbnail visible. |
| M3 | `rotated.jpg` output is upright. Output of `gps.jpg` shows no metadata when run through `exiftool -a -G1 out.jpg`. |
| M4 | DevTools Network tab: nothing after load during a 50-file batch. The counter reads 0. |
| M5 | `dist-offline/photolock.html` opened with Wi-Fi off processes a JPEG batch. |
| M6 | Deploy check: `npm run build && npx vite preview`, then the same M1–M4 on the live Pages URL. |

---

## Next steps

1. Emmanuel: create the repo and set **Settings → Pages → Source: GitHub Actions**.
2. Emmanuel: generate the fixtures (commands above) and commit them.
3. Agent: Gates 0–4 in order.
4. Emmanuel: run M1–M6, verify the preset specs, fill in `lastVerified`.
5. Emmanuel: run `ship-check` before making the repo public or taking the first payment.
6. Launch: HN "Show HN" post leading with the leaking-thumbnail demo plus the offline proof.
