import { WriteDeniedError } from "../core/errors";

// AIDEV-NOTE: File System Access API (showDirectoryPicker, FileSystemDirectoryHandle)
// is Chromium-only; Pro-tier gating of this feature happens in the UI (Gate 3), this
// module just implements the mechanics.
export async function pickOutputDir(): Promise<FileSystemDirectoryHandle> {
  const picker = (
    window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
  ).showDirectoryPicker;
  if (!picker) throw new Error("File System Access API unavailable in this browser");
  return picker();
}

export async function writeResult(dir: FileSystemDirectoryHandle, path: string, bytes: Uint8Array): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error(`Invalid path: ${path}`);

  let current = dir;
  try {
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }
    const fileHandle = await current.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    // AIDEV-NOTE: see io/zip.ts downloadBlob for why this cast is needed (TS 5.7+
    // generic Uint8Array vs. FileSystemWriteChunkType's ArrayBuffer-only constraint).
    await writable.write(bytes as unknown as BufferSource);
    await writable.close();
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      throw new WriteDeniedError();
    }
    throw err;
  }
}
