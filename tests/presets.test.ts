import { describe, expect, it } from "vitest";
import presets from "../src/presets/presets.json";
import type { Preset } from "../src/core/types";

const EXPECTED_IDS = [
  "square-1080",
  "portrait-1080x1350",
  "story-1080x1920",
  "og-1200x630",
  "web-1920w",
];

describe("presets.json", () => {
  it("is a plain array of exactly the 5 seed presets", () => {
    expect(Array.isArray(presets)).toBe(true);
    expect(presets).toHaveLength(5);
    expect(presets.map((p) => p.id)).toEqual(EXPECTED_IDS);
  });

  it("matches the Preset shape for every entry", () => {
    for (const preset of presets as Preset[]) {
      expect(typeof preset.id).toBe("string");
      expect(preset.platform).toBe("generic");
      expect(typeof preset.label).toBe("string");
      expect(typeof preset.width).toBe("number");
      expect(["contain", "cover", "width-only"]).toContain(preset.fit);
      expect(preset.format).toBe("jpeg");
      expect(preset.quality).toBe(85);
      expect(preset.lastVerified).toBeNull();
      expect(preset.sourceUrl).toBeNull();
    }
  });

  it("only web-1920w omits height (width-only fit)", () => {
    for (const preset of presets as Preset[]) {
      if (preset.id === "web-1920w") {
        expect(preset.height).toBeUndefined();
        expect(preset.fit).toBe("width-only");
      } else {
        expect(typeof preset.height).toBe("number");
        expect(preset.fit).toBe("cover");
      }
    }
  });
});
