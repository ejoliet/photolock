import type { Box } from "../core/types";

// AIDEV-NOTE: RDD requires block or coarse mosaic + noise, never Gaussian blur
// (blur is partially reversible; noise-salted mosaic is not).
const MOSAIC_CELL_PX = 16;
const NOISE_RANGE = 24; // +/- 24 per channel

interface ClampedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function applyRedactions(
  imageData: ImageData,
  boxes: Box[],
  mode: "block" | "mosaic",
): ImageData {
  const { width, height } = imageData;
  const data = new Uint8ClampedArray(imageData.data);

  for (const box of boxes) {
    const clamped = clampBox(box, width, height);
    if (clamped.w <= 0 || clamped.h <= 0) continue;
    if (mode === "block") {
      applyBlock(data, width, clamped);
    } else {
      applyMosaic(data, width, clamped);
    }
  }

  return toImageData(data, width, height);
}

function clampBox(box: Box, width: number, height: number): ClampedBox {
  const x0 = Math.max(0, Math.min(box.x, width));
  const y0 = Math.max(0, Math.min(box.y, height));
  const x1 = Math.max(0, Math.min(box.x + box.w, width));
  const y1 = Math.max(0, Math.min(box.y + box.h, height));
  return {
    x: Math.round(x0),
    y: Math.round(y0),
    w: Math.round(x1 - x0),
    h: Math.round(y1 - y0),
  };
}

function applyBlock(data: Uint8ClampedArray, width: number, box: ClampedBox): void {
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * width + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
}

function applyMosaic(data: Uint8ClampedArray, width: number, box: ClampedBox): void {
  for (let cy = box.y; cy < box.y + box.h; cy += MOSAIC_CELL_PX) {
    for (let cx = box.x; cx < box.x + box.w; cx += MOSAIC_CELL_PX) {
      const cellW = Math.min(MOSAIC_CELL_PX, box.x + box.w - cx);
      const cellH = Math.min(MOSAIC_CELL_PX, box.y + box.h - cy);
      averageCell(data, width, cx, cy, cellW, cellH);
    }
  }
}

function averageCell(
  data: Uint8ClampedArray,
  width: number,
  cx: number,
  cy: number,
  cellW: number,
  cellH: number,
): void {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = cy; y < cy + cellH; y++) {
    for (let x = cx; x < cx + cellW; x++) {
      const i = (y * width + x) * 4;
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
      count++;
    }
  }
  if (count === 0) return;
  r /= count;
  g /= count;
  b /= count;

  for (let y = cy; y < cy + cellH; y++) {
    for (let x = cx; x < cx + cellW; x++) {
      const i = (y * width + x) * 4;
      data[i] = clampByte(r + noise());
      data[i + 1] = clampByte(g + noise());
      data[i + 2] = clampByte(b + noise());
      data[i + 3] = 255;
    }
  }
}

function noise(): number {
  return (randomUnit() * 2 - 1) * NOISE_RANGE;
}

function randomUnit(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return (arr[0] ?? 0) / 0xffffffff;
  }
  return Math.random();
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function toImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  if (typeof ImageData !== "undefined") {
    // AIDEV-NOTE: lib.dom types ImageData's backing store as Uint8ClampedArray<ArrayBuffer>;
    // the copy above is always a plain ArrayBuffer at runtime, so this cast is safe.
    return new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height);
  }
  // AIDEV-NOTE: Vitest runs in Node without a DOM, so tests exercise this
  // structural fallback instead of the real ImageData constructor.
  return { data, width, height } as unknown as ImageData;
}
