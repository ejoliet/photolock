import { describe, expect, it, vi } from "vitest";
import { fitToSize, downscaleImageData, type PixelBuffer, type EncodeFn } from "../src/core/targetSize";
import { TargetUnreachableError } from "../src/core/errors";

function makeImage(width: number, height: number): PixelBuffer {
  return { data: new Uint8ClampedArray(width * height * 4).fill(128), width, height };
}

/** Fake encoder: size scales with pixel count and inversely-ish with ~quality. */
function makeFakeEncode(bytesPerPixelAtQ85: number): EncodeFn {
  return async (img, _format, quality) => {
    const pixelCount = img.width * img.height;
    const bytesPerPixel = bytesPerPixelAtQ85 * (quality / 85);
    const size = Math.max(1, Math.round(pixelCount * bytesPerPixel));
    return new Uint8Array(size);
  };
}

describe("fitToSize", () => {
  it("returns immediately when q=85 already fits", async () => {
    const encode = makeFakeEncode(0.5);
    const encodeSpy = vi.fn(encode);
    const img = makeImage(10, 10); // 100 px
    const result = await fitToSize(img, "jpeg", 100, { encode: encodeSpy });
    expect(result.quality).toBe(85);
    expect(encodeSpy).toHaveBeenCalledTimes(1);
  });

  it("binary-searches quality within at most 7 iterations per level", async () => {
    const encode = makeFakeEncode(50); // large enough that q=85 never fits at this size
    const encodeSpy = vi.fn(encode);
    const img = makeImage(20, 20); // 400 px
    const maxKB = (400 * 50 * (40 / 85)) / 1024 + 0.01; // fits around quality ~40
    const result = await fitToSize(img, "jpeg", maxKB, { encode: encodeSpy });
    expect(result.bytes.length).toBeLessThanOrEqual(maxKB * 1024);
    expect(result.quality).toBeLessThan(85);
    // 1 call for q=85 + at most 7 for binary search (q=30 explicit check only
    // runs when the search doesn't already find a fit).
    expect(encodeSpy.mock.calls.length).toBeLessThanOrEqual(1 + 7 + 1);
  });

  it("converges to a higher quality than the minimum that still fits", async () => {
    const encode = makeFakeEncode(20);
    const img = makeImage(30, 30); // 900 px
    const maxKB = (900 * 20 * (60 / 85)) / 1024 + 0.005;
    const result = await fitToSize(img, "jpeg", maxKB, { encode });
    expect(result.bytes.length).toBeLessThanOrEqual(maxKB * 1024);
    expect(result.quality).toBeGreaterThanOrEqual(55);
  });

  it("falls back to downscaling when q=30 doesn't fit at full size", async () => {
    // Fixed overhead-heavy encoder: size barely depends on quality, so only
    // downscaling (fewer pixels) can bring it under the target.
    const encode: EncodeFn = async (img) => {
      const pixelCount = img.width * img.height;
      return new Uint8Array(Math.round(pixelCount * 2));
    };
    const encodeSpy = vi.fn(encode);
    const img = makeImage(100, 100); // 10000 px -> 20000 bytes at any quality
    // 100 -> 85 -> 72 -> 61 -> 52 px/side across 4 downscales (round(*0.85) each
    // step); 52x52 px * 2 bytes/px = 5408 bytes fits under 6KB, 61x61 (7442B) doesn't.
    const maxKB = 6;
    const result = await fitToSize(img, "jpeg", maxKB, { encode: encodeSpy });
    expect(result.width).toBeLessThan(100);
    expect(result.bytes.length).toBeLessThanOrEqual(maxKB * 1024);
  });

  it("throws TargetUnreachableError with the smallest result attached when unreachable", async () => {
    const encode: EncodeFn = async (img) => new Uint8Array(img.width * img.height * 10);
    const img = makeImage(50, 50);
    await expect(fitToSize(img, "jpeg", 0.001, { encode })).rejects.toBeInstanceOf(
      TargetUnreachableError,
    );
    try {
      await fitToSize(img, "jpeg", 0.001, { encode });
      throw new Error("expected fitToSize to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TargetUnreachableError);
      const unreachable = err as InstanceType<typeof TargetUnreachableError>;
      expect(unreachable.best.bytes.length).toBeGreaterThan(0);
      // Smallest possible result should come from the smallest dimensions
      // (4 downscales applied) at the lowest quality.
      expect(unreachable.best.width).toBeLessThan(img.width);
    }
  });
});

describe("downscaleImageData", () => {
  it("reduces dimensions by the given factor (rounded)", () => {
    const img = makeImage(100, 100);
    const result = downscaleImageData(img, 0.85);
    expect(result.width).toBe(85);
    expect(result.height).toBe(85);
  });

  it("averages pixel values (box filter) rather than just sampling", () => {
    const width = 4;
    const height = 1;
    const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
    const result = downscaleImageData({ data, width, height }, 0.5);
    expect(result.width).toBe(2);
    // Each output pixel should be the average of two adjacent input pixels
    // (0 and 255 -> 127.5, rounded by Uint8ClampedArray to 128).
    expect(result.data[0]).toBe(128);
  });
});
