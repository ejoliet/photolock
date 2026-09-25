import * as ed from "@noble/ed25519";
import { describe, expect, it } from "vitest";
import { LicenseInvalidError } from "../src/core/errors";
import { signLicense, verifyLicense, type LicensePayload } from "../src/pro/license";

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function makeKeypair(): Promise<{ secretKey: string; publicKey: string }> {
  const { secretKey, publicKey } = await ed.keygenAsync();
  return { secretKey: b64urlEncode(secretKey), publicKey: b64urlEncode(publicKey) };
}

const validPayload: LicensePayload = {
  v: 1,
  product: "photolock",
  tier: "pro",
  id: "buyer-1",
  issued: "2026-09-24",
};

describe("license", () => {
  it("verifies a validly signed key", async () => {
    const { secretKey, publicKey } = await makeKeypair();
    const key = await signLicense(validPayload, secretKey);
    await expect(verifyLicense(key, publicKey)).resolves.toEqual(validPayload);
  });

  it("rejects a tampered payload", async () => {
    const { secretKey, publicKey } = await makeKeypair();
    const key = await signLicense(validPayload, secretKey);
    const [payloadPart, sigPart] = key.split(".");
    const tampered = `${payloadPart}AA.${sigPart}`;
    await expect(verifyLicense(tampered, publicKey)).rejects.toBeInstanceOf(LicenseInvalidError);
  });

  it("rejects a tampered signature", async () => {
    const { secretKey, publicKey } = await makeKeypair();
    const key = await signLicense(validPayload, secretKey);
    const [payloadPart, sigPart] = key.split(".");
    // AIDEV-NOTE: flip a byte in the middle of the decoded signature, not the
    // trailing base64 char, since the last char's unused bits can round-trip
    // to the same byte and leave the signature unchanged.
    const sigBytes = b64urlDecode(sigPart ?? "");
    const mid = Math.floor(sigBytes.length / 2);
    sigBytes[mid] = (sigBytes[mid] ?? 0) ^ 0xff;
    const tampered = `${payloadPart}.${b64urlEncode(sigBytes)}`;
    await expect(verifyLicense(tampered, publicKey)).rejects.toBeInstanceOf(LicenseInvalidError);
  });

  it("rejects a wrong product", async () => {
    const { secretKey, publicKey } = await makeKeypair();
    const wrongProduct = { ...validPayload, product: "otherapp" } as unknown as LicensePayload;
    const key = await signLicense(wrongProduct, secretKey);
    await expect(verifyLicense(key, publicKey)).rejects.toBeInstanceOf(LicenseInvalidError);
  });

  it("rejects a wrong tier", async () => {
    const { secretKey, publicKey } = await makeKeypair();
    const wrongTier = { ...validPayload, tier: "free" } as unknown as LicensePayload;
    const key = await signLicense(wrongTier, secretKey);
    await expect(verifyLicense(key, publicKey)).rejects.toBeInstanceOf(LicenseInvalidError);
  });

  it("rejects a malformed key", async () => {
    await expect(verifyLicense("not-a-license-key", "AAAA")).rejects.toBeInstanceOf(
      LicenseInvalidError,
    );
  });
});
