import { describe, expect, it } from "vitest";
import { mapBoxesToTarget } from "../src/core/pipeline";

describe("mapBoxesToTarget", () => {
  it("scales boxes when the image is downsized without crop", () => {
    const out = mapBoxesToTarget(
      [{ x: 100, y: 200, w: 50, h: 40, source: "manual" }],
      2000,
      1000,
      { width: 1000, height: 500 },
    );
    expect(out[0]).toEqual({ x: 50, y: 100, w: 25, h: 20, source: "manual" });
  });

  it("offsets boxes by the cover crop origin", () => {
    const out = mapBoxesToTarget(
      [{ x: 600, y: 100, w: 100, h: 100, source: "auto" }],
      2000,
      1000,
      { width: 1000, height: 1000, crop: { sx: 500, sy: 0, sw: 1000, sh: 1000 } },
    );
    expect(out[0]).toEqual({ x: 100, y: 100, w: 100, h: 100, source: "auto" });
  });
});
