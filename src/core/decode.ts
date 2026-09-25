// AIDEV-NOTE: Native createImageBitmap with imageOrientation:'from-image' applies EXIF
// orientation as part of decode, so downstream pixels are already upright before any
// metadata is stripped. HEIC/HEIF falls back to libheif-js, which applies orientation
// per the file's ISO transform properties (irot/imir) internally during decode() —
// there is no separate orientation flag to pass for the HEIC path.
import { DecodeError, TooLargeError, UnsupportedFormatError } from "./errors";

const MAX_PIXELS = 100_000_000;

const HEIC_EXTENSIONS = [".heic", ".heif"];
const HEIC_MIME_TYPES = ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];

export function isHeic(file: File | Blob): boolean {
  const type = file.type?.toLowerCase() ?? "";
  if (HEIC_MIME_TYPES.includes(type)) return true;
  const name = "name" in file ? (file as File).name.toLowerCase() : "";
  return HEIC_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export async function decodeFile(file: File | Blob): Promise<ImageBitmap> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
      colorSpaceConversion: "default",
      premultiplyAlpha: "none",
    });
    if (bitmap.width * bitmap.height > MAX_PIXELS) {
      bitmap.close();
      throw new TooLargeError();
    }
    return bitmap;
  } catch (nativeErr) {
    if (nativeErr instanceof TooLargeError) throw nativeErr;
    if (isHeic(file)) {
      return decodeHeic(file);
    }
    throw new UnsupportedFormatError();
  }
}

async function decodeHeic(file: File | Blob): Promise<ImageBitmap> {
  // AIDEV-NOTE: Q2 default — no HEIC support in the offline single-file build.
  // libheif-js is LGPL-3.0 and its wasm is fetched by URL, which the single-file
  // build's `connect-src 'none'` CSP forbids; vite.singlefile.config.ts also
  // externalizes this module so it's never bundled into photolock.html.
  if (import.meta.env.PHOTOLOCK_SINGLEFILE === "true") {
    throw new UnsupportedFormatError("HEIC not supported in offline build");
  }

  let heifModule: HeifModule;
  try {
    // AIDEV-NOTE: libheif-js has no "exports" map, so the wasm-bundle subpath resolves
    // as a plain file. Its module.exports is set (at require-time) to the *result* of
    // invoking the Emscripten factory with no args, which may already be a Promise<Module>
    // rather than a callable factory, depending on build. Handle both shapes defensively:
    // if the default export is callable, call it; otherwise await it directly.
    const mod = (await import("libheif-js/wasm-bundle")) as {
      default: unknown;
    };
    const factoryOrModule = mod.default;
    heifModule =
      typeof factoryOrModule === "function"
        ? await (factoryOrModule as () => Promise<HeifModule> | HeifModule)()
        : ((await factoryOrModule) as HeifModule);
  } catch {
    throw new UnsupportedFormatError();
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  let decoder: HeifDecoder;
  let images: HeifImage[];
  try {
    decoder = new heifModule.HeifDecoder();
    images = decoder.decode(buffer);
  } catch {
    throw new DecodeError();
  }

  const image = images[0];
  if (!image) throw new DecodeError();

  const width = image.get_width();
  const height = image.get_height();
  if (width * height > MAX_PIXELS) {
    throw new TooLargeError();
  }

  const data = new Uint8ClampedArray(width * height * 4);
  const displayData = await new Promise<{ data: Uint8ClampedArray; width: number; height: number } | undefined>(
    (resolve, reject) => {
      image.display({ data, width, height }, (result) => {
        if (!result) reject(new DecodeError("HEIF processing error"));
        else resolve(result);
      });
    },
  );
  if (!displayData) throw new DecodeError();

  const imageData = new ImageData(
    displayData.data as unknown as Uint8ClampedArray<ArrayBuffer>,
    displayData.width,
    displayData.height,
    { colorSpace: "srgb" },
  );
  return createImageBitmap(imageData);
}

// AIDEV-NOTE: minimal typing for the parts of the libheif-js embind API this module
// touches; the full .d.ts is generated Emscripten boilerplate and not worth importing.
interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    cb: (result: { data: Uint8ClampedArray; width: number; height: number } | undefined) => void,
  ): void;
}

interface HeifDecoder {
  decode(buffer: Uint8Array): HeifImage[];
}

interface HeifModule {
  HeifDecoder: new () => HeifDecoder;
}
