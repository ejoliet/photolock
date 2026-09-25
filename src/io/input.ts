const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "heic", "heif", "tif", "tiff", "gif", "bmp"];

export interface CollectedFile {
  file: File;
  relPath: string;
}

function hasImageExtension(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.includes(ext);
}

// AIDEV-NOTE: DataTransfer (drag-drop) and FileList (<input webkitdirectory>) both
// need folder recursion, but only DataTransfer exposes webkitGetAsEntry(); FileList
// items from a directory input instead carry a flat webkitRelativePath per File.
export async function collectFiles(source: DataTransfer | FileList): Promise<CollectedFile[]> {
  if (isDataTransfer(source)) {
    return collectFromDataTransfer(source);
  }
  return collectFromFileList(source);
}

function isDataTransfer(source: DataTransfer | FileList): source is DataTransfer {
  return typeof DataTransfer !== "undefined" && source instanceof DataTransfer;
}

function collectFromFileList(fileList: FileList): CollectedFile[] {
  const out: CollectedFile[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList.item(i);
    if (!file) continue;
    if (!hasImageExtension(file.name)) continue;
    const withRelPath = file as File & { webkitRelativePath?: string };
    const relPath = withRelPath.webkitRelativePath || file.name;
    out.push({ file, relPath });
  }
  return out;
}

async function collectFromDataTransfer(dataTransfer: DataTransfer): Promise<CollectedFile[]> {
  const items = dataTransfer.items;
  const out: CollectedFile[] = [];

  if (items && items.length > 0 && typeof items[0]?.webkitGetAsEntry === "function") {
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i]?.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    for (const entry of entries) {
      await walkEntry(entry, "", out);
    }
    return out;
  }

  // Fallback: plain file drop with no folder support.
  const files = dataTransfer.files;
  for (let i = 0; i < files.length; i++) {
    const file = files.item(i);
    if (file && hasImageExtension(file.name)) {
      out.push({ file, relPath: file.name });
    }
  }
  return out;
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: CollectedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    if (hasImageExtension(file.name)) {
      out.push({ file, relPath: prefix + file.name });
    }
    return;
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const childEntries: FileSystemEntry[] = [];
    // AIDEV-NOTE: readEntries only returns a batch at a time per the spec; keep calling
    // until it returns an empty array.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (batch.length === 0) break;
      childEntries.push(...batch);
    }
    for (const child of childEntries) {
      await walkEntry(child, `${prefix}${entry.name}/`, out);
    }
  }
}
