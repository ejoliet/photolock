import * as ExifReader from "exifreader";
import type { LeakReport } from "./types";
import { compareThumbnail } from "./thumbCompare";

type Severity = "high" | "medium" | "low";
type Block = LeakReport["items"][number]["block"];

// AIDEV-NOTE: exifreader's .d.ts doesn't declare every recognized tag name
// (e.g. SerialNumber lives in tag-names-exif-ifd.js, not exif-reader.d.ts),
// so groups are walked as generic records rather than the typed interfaces.
type TagEntry = { value?: unknown; description?: unknown } | unknown;
type TagGroup = Record<string, TagEntry>;

const HIGH_EXACT_KEYS = new Set([
  "SerialNumber",
  "BodySerialNumber",
  "LensSerialNumber",
  "CameraSerialNumber",
  "OwnerName",
  "CameraOwnerName",
  "Artist",
  "Copyright",
  "ImageUniqueID",
]);

const MEDIUM_EXACT_KEYS = new Set(["Make", "Model", "Software"]);

// AIDEV-NOTE: these exif keys represent MPF (Multi-Picture Format) data even
// though exifreader nests them inside the `exif` group rather than a
// separate `mpf` group in this version.
const MPF_KEYS = new Set([
  "MPFVersion",
  "NumberOfImages",
  "MPEntry",
  "ImageUIDList",
  "TotalFrames",
  "Images",
]);

export function severityFor(block: string, key: string): Severity {
  if (key.startsWith("GPS")) return "high";
  if (HIGH_EXACT_KEYS.has(key)) return "high";
  if (block === "XMP" && /creator|email/i.test(key)) return "high";
  if (MEDIUM_EXACT_KEYS.has(key)) return "medium";
  if (key.startsWith("DateTime")) return "medium";
  if (key.startsWith("Lens")) return "medium";
  return "low";
}

function truncate(value: string, max = 200): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function stringifyEntry(entry: TagEntry): string {
  if (entry && typeof entry === "object" && "description" in entry) {
    const description = (entry as { description?: unknown }).description;
    if (typeof description === "string") return description;
    if (typeof description === "number") return String(description);
  }
  if (entry && typeof entry === "object" && "value" in entry) {
    const value = (entry as { value?: unknown }).value;
    try {
      return typeof value === "string" ? value : JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  try {
    return JSON.stringify(entry);
  } catch {
    return String(entry);
  }
}

function collect(
  group: TagGroup | undefined,
  block: Block,
  items: LeakReport["items"],
  opts: { exclude?: Set<string>; reroute?: (key: string) => Block } = {},
): void {
  if (!group) return;
  for (const [key, entry] of Object.entries(group)) {
    if (opts.exclude?.has(key)) continue;
    const resolvedBlock = opts.reroute ? opts.reroute(key) : block;
    items.push({
      block: resolvedBlock,
      key,
      value: truncate(stringifyEntry(entry)),
      severity: severityFor(resolvedBlock, key),
    });
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += chars[((b1 & 15) << 2) | (b2 >> 6)];
    result += chars[b2 & 63];
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const b0 = bytes[i] ?? 0;
    result += chars[b0 >> 2];
    result += chars[(b0 & 3) << 4];
    result += "==";
  } else if (remaining === 2) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += chars[(b1 & 15) << 2];
    result += "=";
  }
  return result;
}

export async function scanLeaks(file: File | Blob, name?: string): Promise<LeakReport> {
  const fileName = name ?? (file instanceof File ? file.name : "");
  const arrayBuffer = await file.arrayBuffer();
  const items: LeakReport["items"] = [];

  let tags: ExifReader.ExpandedTags;
  try {
    tags = ExifReader.load(arrayBuffer, {
      expanded: true,
      includeUnknown: false,
    }) as ExifReader.ExpandedTags;
  } catch {
    return { file: fileName, items };
  }

  const isWebp = tags.file?.FileType?.value === "webp";
  collect(tags.exif as TagGroup | undefined, isWebp ? "WebP-EXIF" : "EXIF", items, {
    reroute: (key) => (MPF_KEYS.has(key) ? "MPF" : isWebp ? "WebP-EXIF" : "EXIF"),
  });
  collect(tags.iptc as TagGroup | undefined, "IPTC", items);
  collect(tags.icc as TagGroup | undefined, "ICC", items);
  if (tags.xmp) {
    collect(tags.xmp as unknown as TagGroup, "XMP", items, { exclude: new Set(["_raw"]) });
  }
  collect(tags.pngText as TagGroup | undefined, "PNG-text", items);
  collect(tags.pngFile as TagGroup | undefined, "PNG-text", items);

  const report: LeakReport = { file: fileName, items };

  if (typeof tags.gps?.Latitude === "number" && typeof tags.gps?.Longitude === "number") {
    report.gps = { lat: tags.gps.Latitude, lon: tags.gps.Longitude };
  }

  const thumbnail = tags.Thumbnail;
  if (thumbnail?.image) {
    const thumbBytes = new Uint8Array(thumbnail.image as ArrayBuffer);
    const dataUrl = `data:image/jpeg;base64,${bytesToBase64(thumbBytes)}`;
    let mismatch = false;
    let distance = -1;
    try {
      const result = await compareThumbnail(thumbBytes, file);
      mismatch = result.mismatch;
      distance = result.distance;
    } catch {
      // AIDEV-NOTE: no createImageBitmap/OffscreenCanvas in Node (tests); the
      // browser build resolves this branch via thumbCompare.ts instead.
      // mismatch/distance already default to false/-1.
    }
    report.thumbnail = { present: true, mismatch, distance, dataUrl };
  }

  return report;
}
