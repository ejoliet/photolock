// AIDEV-NOTE: atob/btoa are global in both browsers and Node 16+, so this needs
// no new dependency and no Buffer usage (keeps it isomorphic).

export function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64urlEncodeString(s: string): string {
  return base64urlEncode(new TextEncoder().encode(s));
}

export function base64urlDecodeString(s: string): string {
  return new TextDecoder().decode(base64urlDecode(s));
}
