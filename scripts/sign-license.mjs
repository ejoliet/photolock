#!/usr/bin/env node
/* global console, process, Buffer, TextEncoder */
// Signs a single photolock Pro license.
// Usage: PHOTOLOCK_SIGNING_KEY=<base64url priv key> node scripts/sign-license.mjs --id <buyer-id>
import * as ed from "@noble/ed25519";

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function base64urlToBytes(str) {
  return new Uint8Array(Buffer.from(str, "base64url"));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--id") args.id = argv[++i];
  }
  return args;
}

const { id } = parseArgs(process.argv.slice(2));
const signingKey = process.env.PHOTOLOCK_SIGNING_KEY;

if (!id) {
  console.error("Usage: PHOTOLOCK_SIGNING_KEY=<key> node scripts/sign-license.mjs --id <buyer-id>");
  process.exit(1);
}
if (!signingKey) {
  console.error("PHOTOLOCK_SIGNING_KEY env var is required (never commit it).");
  process.exit(1);
}

const payload = {
  v: 1,
  product: "photolock",
  tier: "pro",
  id,
  issued: new Date().toISOString().slice(0, 10),
};

const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
const priv = base64urlToBytes(signingKey);
const sig = await ed.signAsync(payloadBytes, priv);

console.log(`${base64url(payloadBytes)}.${base64url(sig)}`);
