// AIDEV-NOTE: @noble/ed25519 v3's verifyAsync/signAsync default to hashing sha512
// via globalThis.crypto.subtle (see node_modules/@noble/ed25519/index.js), which is
// present in both Node 20+ and browsers. No @noble/hashes dependency needed.
import { signAsync, verifyAsync } from "@noble/ed25519";
import { LicenseInvalidError } from "../core/errors";
import { base64urlDecode, base64urlEncode } from "./b64";

export interface LicensePayload {
  v: 1;
  product: "photolock";
  tier: "pro";
  id: string;
  issued: string;
}

const STORAGE_KEY = "photolock.license";

function isLicensePayloadShape(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export async function verifyLicense(
  key: string,
  publicKeyB64url: string = import.meta.env.PHOTOLOCK_PUBLIC_KEY,
): Promise<LicensePayload> {
  const parts = key.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new LicenseInvalidError("Malformed license key");
  }
  const [payloadPart, sigPart] = parts;

  let payloadBytes: Uint8Array;
  let sig: Uint8Array;
  let pub: Uint8Array;
  let payloadJson: string;
  try {
    payloadBytes = base64urlDecode(payloadPart);
    sig = base64urlDecode(sigPart);
    pub = base64urlDecode(publicKeyB64url);
    payloadJson = new TextDecoder().decode(payloadBytes);
  } catch {
    throw new LicenseInvalidError("Malformed license key");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    throw new LicenseInvalidError("Malformed license payload");
  }

  // AIDEV-NOTE: verify the signature over the bytes as received, before any
  // shape/field checks, so tampering with either part is caught as a bad
  // signature rather than a shape mismatch.
  let valid: boolean;
  try {
    valid = await verifyAsync(sig, payloadBytes, pub);
  } catch {
    throw new LicenseInvalidError("Bad signature");
  }
  if (!valid) {
    throw new LicenseInvalidError("Bad signature");
  }

  if (!isLicensePayloadShape(parsed)) {
    throw new LicenseInvalidError("Malformed license payload");
  }
  if (
    parsed.v !== 1 ||
    parsed.product !== "photolock" ||
    parsed.tier !== "pro" ||
    typeof parsed.id !== "string" ||
    typeof parsed.issued !== "string"
  ) {
    throw new LicenseInvalidError("Wrong product, tier, or version");
  }

  return parsed as unknown as LicensePayload;
}

export async function signLicense(
  payload: LicensePayload,
  privKeyB64url: string,
): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const priv = base64urlDecode(privKeyB64url);
  const sig = await signAsync(payloadBytes, priv);
  return `${base64urlEncode(payloadBytes)}.${base64urlEncode(sig)}`;
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function loadStoredLicense(): string | null {
  if (!hasLocalStorage()) return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function storeLicense(key: string): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearLicense(): void {
  if (!hasLocalStorage()) return;
  localStorage.removeItem(STORAGE_KEY);
}
