import { describe, expect, it } from "vitest";
import type { Box } from "../src/core/types";
import { applyRedactions } from "../src/pro/redact";

// AIDEV-NOTE: vitest runs with environment "node", so there is no global
// ImageData; build the structural {data,width,height} shape redact.ts expects.
function makeImage(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height } as unknown as ImageData;
}

describe("applyRedactions", () => {
  it("block mode: solid black inside the box, untouched outside", () => {
    const width = 8;
    const height = 8;
    const img = makeImage(width, height, () => [200, 150, 100, 255]);
    const box: Box = { x: 2, y: 2, w: 3, h: 3, source: "manual" };
    const out = applyRedactions(img, [box], "block");

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const inside = x >= 2 && x < 5 && y >= 2 && y < 5;
        if (inside) {
          expect([out.data[i], out.data[i + 1], out.data[i + 2]]).toEqual([0, 0, 0]);
        } else {
          expect([out.data[i], out.data[i + 1], out.data[i + 2]]).toEqual([200, 150, 100]);
        }
      }
    }
  });

  it("mosaic mode: pixels change inside the box, untouched outside", () => {
    const width = 32;
    const height = 32;
    const img = makeImage(width, height, (x, y) => {
      // AIDEV-NOTE: checkerboard so the cell average always differs from
      // some source pixels, regardless of the per-pixel noise draw.
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      return on ? [255, 255, 255, 255] : [0, 0, 0, 255];
    });
    const box: Box = { x: 0, y: 0, w: 16, h: 16, source: "auto" };
    const out = applyRedactions(img, [box], "mosaic");

    let changedInside = false;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (y * width + x) * 4;
        if (
          out.data[i] !== img.data[i] ||
          out.data[i + 1] !== img.data[i + 1] ||
          out.data[i + 2] !== img.data[i + 2]
        ) {
          changedInside = true;
        }
      }
    }
    expect(changedInside).toBe(true);

    for (let y = 16; y < height; y++) {
      for (let x = 16; x < width; x++) {
        const i = (y * width + x) * 4;
        expect(out.data[i]).toBe(img.data[i]);
        expect(out.data[i + 1]).toBe(img.data[i + 1]);
        expect(out.data[i + 2]).toBe(img.data[i + 2]);
      }
    }
  });

  it("clamps out-of-bounds boxes without throwing", () => {
    const width = 4;
    const height = 4;
    const img = makeImage(width, height, () => [10, 20, 30, 255]);
    const box: Box = { x: -5, y: -5, w: 100, h: 100, source: "manual" };
    const out = applyRedactions(img, [box], "block");
    expect(out.width).toBe(width);
    expect(out.height).toBe(height);
    for (let i = 0; i < out.data.length; i += 4) {
      expect([out.data[i], out.data[i + 1], out.data[i + 2]]).toEqual([0, 0, 0]);
    }
  });
});
