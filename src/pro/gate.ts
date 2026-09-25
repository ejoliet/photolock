import { LicenseInvalidError } from "../core/errors";
import { loadStoredLicense, verifyLicense } from "./license";

export const PRO_PRICE_USD = 9;

// AIDEV-NOTE: Emmanuel sets the real Lemon Squeezy checkout URL before launch (Q6 default: $9).
export const CHECKOUT_URL = "https://photolock.lemonsqueezy.com/checkout";

let proVerified = false;

export function isPro(): boolean {
  return proVerified;
}

export async function initPro(): Promise<boolean> {
  const key = loadStoredLicense();
  if (!key) {
    proVerified = false;
    return false;
  }
  try {
    await verifyLicense(key);
    proVerified = true;
  } catch {
    proVerified = false;
  }
  return proVerified;
}

export function requirePro(feature: string): void {
  if (!isPro()) {
    throw new LicenseInvalidError(`${feature} requires Photolock Pro`);
  }
}
