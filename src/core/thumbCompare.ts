// AIDEV-NOTE: dHash/hamming are pure (no DOM). compareThumbnail is the only
// browser-dependent entry point (createImageBitmap + OffscreenCanvas); it is
// expected to throw in Node, which callers (leaks.ts) catch and degrade from.

export interface PixelBuffer {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;

/**
 * Perceptual difference hash (dHash): grayscale, downsample to 9x8 by area
 * averaging, then compare horizontally-adjacent pixels to produce 64 bits.
 */
export function dHash(pixels: PixelBuffer): bigint {
  const { data, width, height } = pixels;
  const gray = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const small = new Float64Array(HASH_WIDTH * HASH_HEIGHT);
  for (let y = 0; y < HASH_HEIGHT; y++) {
    const y0 = Math.floor((y * height) / HASH_HEIGHT);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / HASH_HEIGHT));
    for (let x = 0; x < HASH_WIDTH; x++) {
      const x0 = Math.floor((x * width) / HASH_WIDTH);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / HASH_WIDTH));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += gray[yy * width + xx] ?? 0;
          count++;
        }
      }
      small[y * HASH_WIDTH + x] = count > 0 ? sum / count : 0;
    }
  }

  let hash = 0n;
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH - 1; x++) {
      const left = small[y * HASH_WIDTH + x] ?? 0;
      const right = small[y * HASH_WIDTH + x + 1] ?? 0;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

/** Popcount of the XOR of two hashes. */
export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

async function decodeToPixels(blob: Blob): Promise<PixelBuffer> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context unavailable");
  }
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return imageData;
}

/**
 * Compares an embedded thumbnail against the main image via dHash distance.
 * Browser-only (createImageBitmap/OffscreenCanvas); throws in Node.
 */
export async function compareThumbnail(
  thumbBytes: Uint8Array,
  main: Blob,
  threshold = 10,
): Promise<{ distance: number; mismatch: boolean }> {
  // AIDEV-NOTE: TS's stricter ArrayBuffer/ArrayBufferLike typing (TS 6) rejects a
  // plain Uint8Array as a BlobPart when its buffer type is generic; slicing to a
  // concrete ArrayBuffer keeps this a straightforward copy either way.
  const thumbBlob = new Blob([thumbBytes.slice().buffer as ArrayBuffer]);
  const [thumbPixels, mainPixels] = await Promise.all([
    decodeToPixels(thumbBlob),
    decodeToPixels(main),
  ]);
  const distance = hamming(dHash(thumbPixels), dHash(mainPixels));
  return { distance, mismatch: distance > threshold };
}
