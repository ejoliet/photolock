import type { OutputFormat } from "./types";
import { EncodeError } from "./errors";

const DEFAULT_QUALITY = 85;

export function mimeFor(format: OutputFormat): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "png":
      return "image/png";
  }
}

export function extFor(format: OutputFormat): string {
  switch (format) {
    case "jpeg":
      return "jpg";
    case "webp":
      return "webp";
    case "avif":
      return "avif";
    case "png":
      return "png";
  }
}

// AIDEV-NOTE: jsquash encoders never write metadata (no EXIF/ICC passthrough), so the
// "output carries no metadata" constraint is satisfied simply by using them exclusively.
// Codecs are dynamically imported so a batch that only needs JPEG never pulls in the
// webp/avif/png WASM.
export async function encode(
  imageData: ImageData,
  format: OutputFormat,
  quality: number = DEFAULT_QUALITY,
): Promise<Uint8Array> {
  const attempt = async (): Promise<Uint8Array> => {
    const buffer = await encodeOnce(imageData, format, quality);
    return new Uint8Array(buffer);
  };

  try {
    return await attempt();
  } catch {
    try {
      return await attempt();
    } catch {
      throw new EncodeError();
    }
  }
}

async function encodeOnce(
  imageData: ImageData,
  format: OutputFormat,
  quality: number,
): Promise<ArrayBuffer> {
  switch (format) {
    case "jpeg": {
      const { default: encodeJpeg } = await import("@jsquash/jpeg/encode");
      return encodeJpeg(imageData, { quality });
    }
    case "webp": {
      const { default: encodeWebp } = await import("@jsquash/webp/encode");
      return encodeWebp(imageData, { quality });
    }
    case "avif": {
      const { default: encodeAvif } = await import("@jsquash/avif/encode");
      return encodeAvif(imageData, { quality });
    }
    case "png": {
      const { default: encodePng } = await import("@jsquash/png/encode");
      return encodePng(imageData);
    }
  }
}
