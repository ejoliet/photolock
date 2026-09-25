import type { OutputFormat } from "../core/types";
import { base64urlDecodeString, base64urlEncodeString } from "./b64";

export interface Recipe {
  v: 1;
  presetIds: string[];
  targetKB?: number;
  format: OutputFormat;
  quality?: number;
}

const HASH_RE = /^#?r=(.+)$/;

export function encodeRecipe(r: Recipe): string {
  return `#r=${base64urlEncodeString(JSON.stringify(r))}`;
}

export function decodeRecipe(hash: string): Recipe {
  const match = HASH_RE.exec(hash);
  if (!match || !match[1]) {
    throw new Error("Malformed recipe hash");
  }

  let json: string;
  try {
    json = base64urlDecodeString(match[1]);
  } catch {
    throw new Error("Malformed recipe hash");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Malformed recipe hash");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Malformed recipe hash");
  }
  const r = parsed as Record<string, unknown>;
  if (r.v !== 1) {
    throw new Error("Unsupported recipe version");
  }
  if (!Array.isArray(r.presetIds) || typeof r.format !== "string") {
    throw new Error("Malformed recipe hash");
  }

  return parsed as Recipe;
}

// AIDEV-NOTE: free to open, per RDD "Recipes (Pro to save, free to open)".
export function readRecipeFromLocation(): Recipe | null {
  if (typeof location === "undefined" || !location.hash) return null;
  try {
    return decodeRecipe(location.hash);
  } catch {
    return null;
  }
}

// AIDEV-NOTE: caller is responsible for gating this behind requirePro("Save recipe").
export function writeRecipeToLocation(r: Recipe): void {
  if (typeof location === "undefined") return;
  location.hash = encodeRecipe(r);
}
