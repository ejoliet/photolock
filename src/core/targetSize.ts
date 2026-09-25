import type { OutputFormat } from "./types";
import { TargetUnreachableError } from "./errors";

// AIDEV-NOTE: ImageData isn't guaranteed to exist outside a DOM/worker
// context (and never in Node, where this is unit-tested), so a minimal
// structural type is used instead. A real ImageData satisfies it.
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type EncodeFn = (
  img: PixelBuffer,
  format: OutputFormat,
  quality: number,
) => Promise<Uint8Array>;

export type DownscaleFn = (img: PixelBuffer, factor: number) => PixelBuffer;

export interface FitToSizeDeps {
  encode: EncodeFn;
  downscale?: DownscaleFn;
}

export interface FitResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  quality: number;
}

const MAX_BINARY_SEARCH_ITERATIONS = 7;
const MAX_DOWNSCALES = 4;
const DOWNSCALE_FACTOR = 0.85;
const MIN_QUALITY = 30;
const MAX_QUALITY = 85;

/** Box-filter downsample of a PixelBuffer by `factor` (rounded dimensions). */
export function downscaleImageData(img: PixelBuffer, factor: number): PixelBuffer {
  const newWidth = Math.max(1, Math.round(img.width * factor));
  const newHeight = Math.max(1, Math.round(img.height * factor));
  const data = new Uint8ClampedArray(newWidth * newHeight * 4);

  for (let y = 0; y < newHeight; y++) {
    const sy0 = Math.floor((y * img.height) / newHeight);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.height) / newHeight));
    for (let x = 0; x < newWidth; x++) {
      const sx0 = Math.floor((x * img.width) / newWidth);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.width) / newWidth));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let yy = sy0; yy < sy1; yy++) {
        for (let xx = sx0; xx < sx1; xx++) {
          const idx = (yy * img.width + xx) * 4;
          r += img.data[idx] ?? 0;
          g += img.data[idx + 1] ?? 0;
          b += img.data[idx + 2] ?? 0;
          a += img.data[idx + 3] ?? 0;
          count++;
        }
      }
      const outIdx = (y * newWidth + x) * 4;
      data[outIdx] = count > 0 ? r / count : 0;
      data[outIdx + 1] = count > 0 ? g / count : 0;
      data[outIdx + 2] = count > 0 ? b / count : 0;
      data[outIdx + 3] = count > 0 ? a / count : 0;
    }
  }
  return { data, width: newWidth, height: newHeight };
}

async function loadDefaultEncode(): Promise<EncodeFn> {
  const mod = await import("./encode");
  return mod.encode as unknown as EncodeFn;
}

function smaller(a: FitResult | undefined, b: FitResult): FitResult {
  if (!a) return b;
  return b.bytes.length < a.bytes.length ? b : a;
}

/**
 * Implements the RDD target-size algorithm: encode at q=85, binary-search
 * quality in [30, 85] (max 7 iterations) if that doesn't fit, then downscale
 * by 0.85 and repeat (max 4 downscales). Throws TargetUnreachableError with
 * the smallest result found if the target is never reached.
 */
export async function fitToSize(
  imageData: PixelBuffer,
  format: OutputFormat,
  maxKB: number,
  deps?: FitToSizeDeps,
): Promise<FitResult> {
  const encode = deps?.encode ?? (await loadDefaultEncode());
  const downscale = deps?.downscale ?? downscaleImageData;
  const maxBytes = maxKB * 1024;

  let best: FitResult | undefined;
  let current = imageData;

  for (let level = 0; level <= MAX_DOWNSCALES; level++) {
    const q85Bytes = await encode(current, format, MAX_QUALITY);
    const q85Result: FitResult = {
      bytes: q85Bytes,
      width: current.width,
      height: current.height,
      quality: MAX_QUALITY,
    };
    best = smaller(best, q85Result);
    if (q85Bytes.length <= maxBytes) return q85Result;

    let lo = MIN_QUALITY;
    let hi = MAX_QUALITY;
    let bestFit: FitResult | undefined;
    for (let iter = 0; iter < MAX_BINARY_SEARCH_ITERATIONS && lo <= hi; iter++) {
      const mid = Math.round((lo + hi) / 2);
      const bytes = await encode(current, format, mid);
      const result: FitResult = { bytes, width: current.width, height: current.height, quality: mid };
      best = smaller(best, result);
      if (bytes.length <= maxBytes) {
        bestFit = bestFit && bestFit.quality > mid ? bestFit : result;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (bestFit) return bestFit;

    // AIDEV-NOTE: binary search above will usually have already probed
    // q=30, but the RDD algorithm calls it out explicitly as the gate for
    // moving to the downscale fallback, so it's checked directly too.
    const q30Bytes = await encode(current, format, MIN_QUALITY);
    const q30Result: FitResult = {
      bytes: q30Bytes,
      width: current.width,
      height: current.height,
      quality: MIN_QUALITY,
    };
    best = smaller(best, q30Result);
    if (q30Bytes.length <= maxBytes) return q30Result;

    if (level < MAX_DOWNSCALES) {
      current = downscale(current, DOWNSCALE_FACTOR);
    }
  }

  throw new TargetUnreachableError(best as FitResult);
}
