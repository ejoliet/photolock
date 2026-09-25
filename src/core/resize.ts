import type { FitMode } from "./types";

export interface ResizeOptions {
  width: number;
  height?: number;
  fit: FitMode;
  allowUpscale?: boolean;
}

export interface TargetSize {
  width: number;
  height: number;
  crop?: { sx: number; sy: number; sw: number; sh: number };
}

// AIDEV-NOTE: Pure geometry only — no canvas/bitmap access — so it is unit-testable
// under Node/Vitest without a DOM.
export function computeTargetSize(srcW: number, srcH: number, opts: ResizeOptions): TargetSize {
  const { fit, allowUpscale } = opts;

  if (fit === "width-only") {
    const targetW = opts.width;
    if (!allowUpscale && targetW >= srcW) {
      return { width: srcW, height: srcH };
    }
    const scale = targetW / srcW;
    return { width: targetW, height: Math.round(srcH * scale) };
  }

  const targetH = opts.height ?? opts.width;

  // AIDEV-NOTE: omit the crop field entirely when it covers the whole source frame
  // (a no-op crop) so downstream code (resizeBitmap) can skip the sub-rect drawImage
  // call, and so tests/callers don't need to special-case an identity crop.
  function withCrop(width: number, height: number, sx: number, sy: number, sw: number, sh: number): TargetSize {
    if (sx === 0 && sy === 0 && sw === srcW && sh === srcH) {
      return { width, height };
    }
    return { width, height, crop: { sx, sy, sw, sh } };
  }

  if (fit === "contain") {
    const scale = Math.min(opts.width / srcW, targetH / srcH);
    const effectiveScale = allowUpscale ? scale : Math.min(scale, 1);
    return {
      width: Math.max(1, Math.round(srcW * effectiveScale)),
      height: Math.max(1, Math.round(srcH * effectiveScale)),
    };
  }

  // fit === "cover": scale to fill target box, then center-crop the source.
  const scale = Math.max(opts.width / srcW, targetH / srcH);
  const effectiveScale = allowUpscale ? scale : Math.min(scale, 1);

  if (!allowUpscale && scale > 1) {
    // AIDEV-NOTE: source is smaller than the target box in at least one dimension and
    // upscaling isn't allowed. Never upscale: crop the source itself to the target
    // aspect ratio at 1:1 scale instead of growing the image.
    const targetAspect = opts.width / targetH;
    const srcAspect = srcW / srcH;
    let sw = srcW;
    let sh = srcH;
    if (srcAspect > targetAspect) {
      sw = Math.round(srcH * targetAspect);
    } else {
      sh = Math.round(srcW / targetAspect);
    }
    const sx = Math.floor((srcW - sw) / 2);
    const sy = Math.floor((srcH - sh) / 2);
    return withCrop(sw, sh, sx, sy, sw, sh);
  }

  const cropW = Math.min(srcW, Math.round(opts.width / effectiveScale));
  const cropH = Math.min(srcH, Math.round(targetH / effectiveScale));
  const sx = Math.max(0, Math.floor((srcW - cropW) / 2));
  const sy = Math.max(0, Math.floor((srcH - cropH) / 2));
  return withCrop(opts.width, targetH, sx, sy, cropW, cropH);
}

// AIDEV-NOTE: OffscreenCanvas + drawImage is the simplest implementation that needs no
// WASM. @jsquash/resize (lanczos3 by default) can be swapped in later for higher-quality
// downscales without changing computeTargetSize's contract.
export async function resizeBitmap(bitmap: ImageBitmap, target: TargetSize): Promise<ImageData> {
  const canvas = new OffscreenCanvas(target.width, target.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (target.crop) {
    const { sx, sy, sw, sh } = target.crop;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, target.width, target.height);
  } else {
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  }

  return ctx.getImageData(0, 0, target.width, target.height, { colorSpace: "srgb" });
}
