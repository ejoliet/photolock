import { describe, expect, it } from "vitest";
import { LicenseInvalidError } from "../src/core/errors";
import { PRO_PRICE_USD, requirePro } from "../src/pro/gate";

describe("gate", () => {
  it("sets the Pro price to $9", () => {
    expect(PRO_PRICE_USD).toBe(9);
  });

  it("requirePro throws when the user is not Pro", () => {
    expect(() => requirePro("Folder write-back")).toThrow(LicenseInvalidError);
  });
});
