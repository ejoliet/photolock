import { describe, expect, it } from "vitest";
import { decodeRecipe, encodeRecipe, type Recipe } from "../src/pro/recipes";

describe("recipes", () => {
  it("round-trips through encode and decode", () => {
    const recipe: Recipe = {
      v: 1,
      presetIds: ["square-1080", "og-1200x630"],
      targetKB: 500,
      format: "jpeg",
      quality: 80,
    };
    const hash = encodeRecipe(recipe);
    expect(hash.startsWith("#r=")).toBe(true);
    expect(decodeRecipe(hash)).toEqual(recipe);
  });

  it("rejects an unknown recipe version", () => {
    const badHash = encodeRecipe({ v: 2, presetIds: [], format: "jpeg" } as unknown as Recipe);
    expect(() => decodeRecipe(badHash)).toThrow("Unsupported recipe version");
  });

  it("rejects garbage input", () => {
    expect(() => decodeRecipe("#r=not-valid-json-base64!!!")).toThrow();
    expect(() => decodeRecipe("garbage")).toThrow();
  });
});
