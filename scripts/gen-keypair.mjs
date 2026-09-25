#!/usr/bin/env node
/* global console, process, Buffer */
// AIDEV-NOTE: eslint.config.js only declares browser globals; this comment
// declares the Node globals this plain-JS script needs, without touching
// shared eslint config owned outside Gate 3.
// Generates an Ed25519 keypair for signing photolock Pro licenses.
// Usage: node scripts/gen-keypair.mjs
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ed from "@noble/ed25519";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyDir = resolve(__dirname, "..", ".keys");
const privPath = resolve(keyDir, "private.key");

if (existsSync(privPath)) {
  console.error(`Refusing to overwrite existing key at ${privPath}`);
  process.exit(1);
}

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

const { secretKey, publicKey } = await ed.keygenAsync();

mkdirSync(keyDir, { recursive: true });
writeFileSync(privPath, base64url(secretKey), { mode: 0o600 });

console.log(`Private key written to ${privPath} (mode 0600, never commit this).`);
console.log("Public key (base64url) -- set as PHOTOLOCK_PUBLIC_KEY at build time:");
console.log(base64url(publicKey));
