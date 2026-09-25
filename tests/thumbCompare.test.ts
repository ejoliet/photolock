import { describe, expect, it } from "vitest";
import { dHash, hamming, type PixelBuffer } from "../src/core/thumbCompare";

// AIDEV-NOTE: a plain linear ramp is a poor dHash fixture: cropping it in half
// still ramps monotonically left-to-right, so the (adjacent-column > ) bit
// pattern is unchanged and the hash collides. A multi-period sine "gradient"
// changes shape under a crop, which is what dHash is meant to detect.
function makeGradient(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const value = Math.round(128 + 100 * Math.sin((x / width) * 4 * Math.PI));
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
      data[idx + 3] = 255;
    }
  }
  return { data, width, height };
}

function cropLeftHalf(pixels: PixelBuffer): PixelBuffer {
  const halfWidth = Math.floor(pixels.width / 2);
  const data = new Uint8ClampedArray(halfWidth * pixels.height * 4);
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < halfWidth; x++) {
      const srcIdx = (y * pixels.width + x) * 4;
      const dstIdx = (y * halfWidth + x) * 4;
      data[dstIdx] = pixels.data[srcIdx] ?? 0;
      data[dstIdx + 1] = pixels.data[srcIdx + 1] ?? 0;
      data[dstIdx + 2] = pixels.data[srcIdx + 2] ?? 0;
      data[dstIdx + 3] = pixels.data[srcIdx + 3] ?? 0;
    }
  }
  return { data, width: halfWidth, height: pixels.height };
}

describe("hamming", () => {
  it("is 0 for identical hashes", () => {
    expect(hamming(0b1010n, 0b1010n)).toBe(0);
  });

  it("counts differing bits", () => {
    expect(hamming(0b1111n, 0b0000n)).toBe(4);
    expect(hamming(0b1010n, 0b0101n)).toBe(4);
  });
});

describe("dHash", () => {
  it("gives distance 0 for a gradient vs an identical copy", () => {
    const original = makeGradient(64, 64);
    const copy = makeGradient(64, 64);
    const distance = hamming(dHash(original), dHash(copy));
    expect(distance).toBe(0);
  });

  it("gives a large distance for a gradient vs a left-half crop", () => {
    const original = makeGradient(64, 64);
    const cropped = cropLeftHalf(original);
    const distance = hamming(dHash(original), dHash(cropped));
    expect(distance).toBeGreaterThan(10);
  });
});
