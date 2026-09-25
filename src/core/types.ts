// AIDEV-NOTE: Data model transcribed verbatim from RDD.md "Interface contract" section.

export type OutputFormat = "jpeg" | "webp" | "avif" | "png";
export type FitMode = "contain" | "cover" | "width-only";

export interface Preset {
  id: string;
  platform: string;
  label: string;
  width: number;
  height?: number;
  fit: FitMode;
  format: OutputFormat;
  quality?: number;
  maxKB?: number;
  lastVerified: string | null;
  sourceUrl: string | null; // Emmanuel fills these in
}

export interface LeakReport {
  file: string;
  items: {
    block: "EXIF" | "XMP" | "IPTC" | "ICC" | "MPF" | "PNG-text" | "WebP-EXIF";
    key: string;
    value: string;
    severity: "high" | "medium" | "low"; // GPS, serial, owner = high
  }[];
  gps?: { lat: number; lon: number };
  thumbnail?: { present: true; mismatch: boolean; distance: number; dataUrl: string };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  source: "auto" | "manual";
}

export interface Job {
  files: File[];
  presetIds: string[];
  targetKB?: number;
  redactions?: Record<string, Box[]>; // Pro
  output: "zip" | "folder"; // folder = Pro
}

export interface ProcessResult {
  file: string;
  relPath: string;
  presetId: string;
  bytes: Uint8Array;
  format: OutputFormat;
  width: number;
  height: number;
  report: LeakReport;
  targetUnreachable?: boolean;
}
