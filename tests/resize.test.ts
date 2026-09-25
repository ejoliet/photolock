import { describe, expect, it } from "vitest";
import { computeTargetSize } from "../src/core/resize";

describe("computeTargetSize", () => {
  describe("contain", () => {
    it("fits a landscape source inside a square box without cropping", () => {
      const result = computeTargetSize(2000, 1000, { width: 1000, height: 1000, fit: "contain" });
      expect(result).toEqual({ width: 1000, height: 500 });
    });

    it("fits a portrait source inside a wider-than-tall box without cropping", () => {
      const result = computeTargetSize(1000, 2000, { width: 1200, height: 630, fit: "contain" });
      expect(result).toEqual({ width: 315, height: 630 });
    });

    it("never upscales a small source", () => {
      const result = computeTargetSize(100, 100, { width: 1080, height: 1080, fit: "contain" });
      expect(result).toEqual({ width: 100, height: 100 });
    });

    it("upscales when allowUpscale is set", () => {
      const result = computeTargetSize(100, 100, {
        width: 200,
        height: 200,
        fit: "contain",
        allowUpscale: true,
      });
      expect(result).toEqual({ width: 200, height: 200 });
    });
  });

  describe("cover", () => {
    it("center-crops a landscape source to a square box (source already covers the target)", () => {
      const result = computeTargetSize(4000, 3000, { width: 1080, height: 1080, fit: "cover" });
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
      expect(result.crop).toBeDefined();
      // Landscape source cropped to a square: crop width should be less than source
      // width, full source height used, centered horizontally.
      expect(result.crop?.sh).toBe(3000);
      expect(result.crop?.sw).toBeLessThan(4000);
      expect(result.crop?.sx).toBeGreaterThan(0);
      expect(result.crop?.sy).toBe(0);
    });

    it("center-crops a portrait source to a landscape box (source already covers the target)", () => {
      const result = computeTargetSize(4000, 8000, { width: 1200, height: 630, fit: "cover" });
      expect(result.width).toBe(1200);
      expect(result.height).toBe(630);
      expect(result.crop?.sw).toBe(4000);
      expect(result.crop?.sh).toBeLessThan(8000);
      expect(result.crop?.sy).toBeGreaterThan(0);
    });

    it("never upscales: crops the source to the target aspect ratio at 1:1 scale instead", () => {
      const result = computeTargetSize(200, 200, { width: 1080, height: 1080, fit: "cover" });
      // Source already matches the target aspect ratio (1:1), so the identity crop is
      // omitted and no upscale happens.
      expect(result).toEqual({ width: 200, height: 200 });
    });

    it("never upscales a small non-matching-aspect source: crops instead of growing it", () => {
      const result = computeTargetSize(200, 100, { width: 1080, height: 1080, fit: "cover" });
      expect(result.width).toBeLessThanOrEqual(200);
      expect(result.height).toBeLessThanOrEqual(100);
      expect(result.width).toBe(result.height);
    });
  });

  describe("width-only", () => {
    it("scales height proportionally to the requested width", () => {
      const result = computeTargetSize(3840, 2160, { width: 1920, fit: "width-only" });
      expect(result).toEqual({ width: 1920, height: 1080 });
    });

    it("never upscales a source narrower than the requested width", () => {
      const result = computeTargetSize(800, 600, { width: 1920, fit: "width-only" });
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it("upscales when allowUpscale is set", () => {
      const result = computeTargetSize(800, 600, { width: 1920, fit: "width-only", allowUpscale: true });
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1440);
    });

    it("handles a portrait source", () => {
      const result = computeTargetSize(1080, 1920, { width: 540, fit: "width-only" });
      expect(result).toEqual({ width: 540, height: 960 });
    });
  });
});
