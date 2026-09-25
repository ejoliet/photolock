import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// AIDEV-NOTE: this suite only runs against build output that already exists (produced
// by `npm run build` / `npm run build:offline`), so `npm test` alone (no builds) stays
// fast and doesn't require building first. `npm run test:build` runs the builds first.
const DIST_DIR = resolve(__dirname, "../dist");
const OFFLINE_HTML = resolve(__dirname, "../dist-offline/photolock.html");

// AIDEV-NOTE: exceptions beyond the RDD's Stripe/Lemon Squeezy checkout links are XML
// namespace / schema URIs that ship as string constants inside third-party WASM/JS
// (never fetched), plus one verified-inert case: jsquash's codec glue embeds a Node.js
// compatibility shim (`process.release.name === 'node'` guarded) that sets
// `import.meta.url = 'https://localhost'` as a dummy placeholder for non-browser
// runtimes. That branch never executes in a browser and the string is never fetched;
// confirmed by inspecting the surrounding guard in the built output during Gate 4.
const ALLOWED_URL_PATTERNS = [
  /buy\.stripe\.com/,
  /lemonsqueezy\.com/,
  /www\.w3\.org/,
  /ns\.adobe\.com/,
  /purl\.org/,
  /schema\.org/,
  /xmlns/,
  /^https:\/\/localhost$/,
  // AIDEV-NOTE: exifreader's XMP namespace-table fallback returns this string for an
  // unrecognized namespace prefix; it is a return value, never a fetch target.
  /^http:\/\/fallback\.namespace\/$/,
  // AIDEV-NOTE: Vite/Rolldown's own bundler runtime embeds this URL only inside a
  // thrown-Error message string for missing `require()` support; never fetched.
  /rolldown\.rs\/in-depth\/bundling-cjs/,
  // AIDEV-NOTE: Workbox logs this URL in a console.warn() string, not a fetch.
  /bit\.ly\/wb-precache/,
];

function isAllowedUrl(url: string): boolean {
  return ALLOWED_URL_PATTERNS.some((re) => re.test(url));
}

function findDisallowedUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>)\\`]*/g) ?? [];
  return matches.filter((url) => !isAllowedUrl(url));
}

function listTextFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTextFiles(full));
    } else if (/\.(html|js|css|json|webmanifest)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe.skipIf(!existsSync(DIST_DIR))("dist/ contains no disallowed remote URLs", () => {
  it("greps every text file for http(s):// references", () => {
    const offenders: string[] = [];
    for (const file of listTextFiles(DIST_DIR)) {
      const text = readFileSync(file, "utf-8");
      for (const url of findDisallowedUrls(text)) {
        offenders.push(`${file}: ${url}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe.skipIf(!existsSync(OFFLINE_HTML))("dist-offline/photolock.html is a self-contained single file", () => {
  it("has no disallowed remote URLs", () => {
    const text = readFileSync(OFFLINE_HTML, "utf-8");
    const offenders = findDisallowedUrls(text);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("has no external script/link/url(http) references and no libheif", () => {
    const text = readFileSync(OFFLINE_HTML, "utf-8");
    expect(text).not.toMatch(/<script[^>]+src=/i);
    expect(text).not.toMatch(/<link[^>]+href=/i);
    expect(text).not.toMatch(/url\(https?:/i);
    expect(text.toLowerCase()).not.toContain("libheif");
  });

  it("is the only file in dist-offline/", () => {
    const dir = resolve(__dirname, "../dist-offline");
    const entries = readdirSync(dir);
    expect(entries).toEqual(["photolock.html"]);
    expect(statSync(OFFLINE_HTML).isFile()).toBe(true);
  });
});
