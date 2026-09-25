# photolock — agent instructions

Static, client-only photo tool: leak report, metadata strip, resize/compress, offline proof.
`RDD.md` is the spec. `DEVELOPER.md` has manual checks (M1–M6) and Emmanuel-only steps.

## Commands

```bash
npm run lint         # eslint + tsc --noEmit (strict)
npm test             # vitest, node env, no browser
npm run build        # hosted build -> dist/ (base /photolock/, PWA)
npm run build:offline# single file -> dist-offline/photolock.html
npm run test:build   # both builds + tests/build-output.test.ts (no remote URLs)
```

Run `npm run lint && npm test` after every change. Run `npm run test:build` after touching
deps, `vite*.config.ts`, or `build/`. Delete `dist/` and `dist-offline/` afterwards.

## Hard constraints (from RDD, enforced by tests)

- **Zero network after load.** No analytics, no license server, no CDN. All WASM/models/fonts
  self-hosted under `public/`. `tests/build-output.test.ts` greps both builds for `http(s)://`;
  only Stripe/Lemon Squeezy links and inert XML-namespace strings are allowed. Never widen
  that allowlist to make a build pass; fix the source instead.
- **Netguard first.** `installNetguard()` is line 1 of `src/main.ts`. Anything that must
  fetch (SW, codecs, models) happens before `markBootComplete()` or goes in `bootAllowlist`.
- TypeScript `strict`, no `any` in `src/core/`. Pixels never touch storage; only settings
  and the license key go in `localStorage`.
- No new npm deps without asking. `SharedArrayBuffer` unavailable (GitHub Pages, no COOP/COEP),
  so no `wasm-vips` or multithreaded codec builds.
- Redaction: solid block or mosaic+noise only, never blur. Copy says "helps hide", never "safe".
- Seed presets only (5 generic sizes). Do not invent platform specs; Emmanuel verifies them.
- Do not install exiftool/ImageMagick/Playwright; do not push or open PRs; do not commit
  unless asked.

## Non-obvious decisions (keep)

- `build/stripTelemetry.ts` blanks MediaPipe's hardcoded `odml.pa.googleapis.com` URL at
  bundle time in both configs. Removing it fails `test:build`.
- Encoding runs in workers; netguard cannot see worker fetches. `pool.warm(["jpeg"])`
  pre-loads the JPEG codec in every worker during boot. One shared pool per page
  (`getSharedPool()`), never terminated by `runJob`.
- Redaction boxes are in source-pixel coordinates; `mapBoxesToTarget` (pipeline.ts) maps
  them through crop/scale. A redaction failure fails that file on purpose.
- Offline build: HEIC disabled (Q2), face detection throws (Q4), CSP `connect-src 'none'`,
  worker inlined via `?worker&inline`, WASM inlined as `data:` URLs.
- Seam modules use static/literal imports. Never reintroduce `/* @vite-ignore */`
  dynamic imports; they silently drop the module from the bundle.
- Comments: `AIDEV-NOTE:` / `AIDEV-TODO:` only on non-obvious decisions.

## Layout

`src/core` pipeline (decode → redact → resize → encode → targetSize, leaks, thumbCompare),
`src/workers` pool + worker, `src/io` input/zip/folder/naming, `src/privacy/netguard.ts`,
`src/pro` license/recipes/redact/faces/gate, `src/ui` DOM modules, `tests/` vitest,
`scripts/` keypair + license signing (private key never in repo or CI).
