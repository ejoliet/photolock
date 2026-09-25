import { zipSync } from "fflate";

export interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

// AIDEV-NOTE: level 0 (store, no compression) because the contents are already
// compressed image bytes (jpeg/webp/avif/png) — re-compressing wastes CPU for no size
// benefit.
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const entry of entries) {
    files[entry.path] = [entry.bytes, { level: 0 }];
  }
  return zipSync(files);
}

export function downloadBlob(bytes: Uint8Array, name: string): void {
  // AIDEV-NOTE: TS's Uint8Array is generic over ArrayBufferLike (which includes
  // SharedArrayBuffer) as of TS 5.7+; BlobPart only accepts the ArrayBuffer-backed
  // form. Our bytes are always plain ArrayBuffer-backed, so this cast is safe.
  const blob = new Blob([bytes as unknown as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
