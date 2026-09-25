import { describe, expect, it } from "vitest";
import { outputName } from "../src/io/naming";

describe("outputName", () => {
  it("appends the preset id and format extension to the basename", () => {
    const taken = new Set<string>();
    expect(outputName("photo.jpg", "square-1080", "jpeg", taken)).toBe("photo-square-1080.jpg");
  });

  it("keeps folder structure from relPath", () => {
    const taken = new Set<string>();
    expect(outputName("vacation/beach.png", "web-1920w", "webp", taken)).toBe(
      "vacation/beach-web-1920w.webp",
    );
  });

  it("adds a collision suffix on repeated names", () => {
    const taken = new Set<string>();
    const first = outputName("photo.jpg", "square-1080", "jpeg", taken);
    const second = outputName("photo.jpg", "square-1080", "jpeg", taken);
    const third = outputName("photo.jpg", "square-1080", "jpeg", taken);
    expect(first).toBe("photo-square-1080.jpg");
    expect(second).toBe("photo-square-1080 (2).jpg");
    expect(third).toBe("photo-square-1080 (3).jpg");
  });

  it("keeps collisions scoped per folder", () => {
    const taken = new Set<string>();
    const a = outputName("a/photo.jpg", "square-1080", "jpeg", taken);
    const b = outputName("b/photo.jpg", "square-1080", "jpeg", taken);
    expect(a).toBe("a/photo-square-1080.jpg");
    expect(b).toBe("b/photo-square-1080.jpg");
  });

  it("handles a basename with no extension", () => {
    const taken = new Set<string>();
    expect(outputName("IMG_0001", "og-1200x630", "avif", taken)).toBe("IMG_0001-og-1200x630.avif");
  });

  it("mutates the taken set so a shared set dedupes across calls", () => {
    const taken = new Set<string>();
    outputName("photo.jpg", "square-1080", "jpeg", taken);
    expect(taken.has("photo-square-1080.jpg")).toBe(true);
  });
});
