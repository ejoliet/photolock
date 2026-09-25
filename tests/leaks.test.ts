import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanLeaks, severityFor } from "../src/core/leaks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function u16le(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function asciiZ(s: string): Buffer {
  return Buffer.from(`${s}\0`, "ascii");
}

// AIDEV-NOTE: TS's stricter ArrayBuffer/ArrayBufferLike typing (TS 6) rejects a
// Node Buffer as a BlobPart; copy into a concrete ArrayBuffer first.
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer;
}

function inlineValue(bytes: Buffer): Buffer {
  const padded = Buffer.alloc(4);
  bytes.copy(padded, 0, 0, Math.min(4, bytes.length));
  return padded;
}

function ifdEntry(tag: number, type: number, count: number, valueField: Buffer): Buffer {
  return Buffer.concat([u16le(tag), u16le(type), u32le(count), valueField]);
}

function rational(num: number, den: number): Buffer {
  return Buffer.concat([u32le(num), u32le(den)]);
}

/**
 * Builds a minimal little-endian TIFF/EXIF structure by hand: IFD0 (Make +
 * pointers), an EXIF sub-IFD (SerialNumber), and a GPS sub-IFD (lat/lon).
 * Offsets below are computed for this exact fixed layout.
 */
function buildMinimalExifTiff(): Buffer {
  const make = asciiZ("TestCam"); // 8 bytes
  const serial = asciiZ("TEST123"); // 8 bytes
  const gpsLatRef = asciiZ("N"); // 2 bytes
  const gpsLonRef = asciiZ("W"); // 2 bytes
  const gpsLat = Buffer.concat([rational(34, 1), rational(3, 1), rational(792, 100)]);
  const gpsLon = Buffer.concat([rational(118, 1), rational(14, 1), rational(3732, 100)]);

  const ifd0Offset = 8;
  const ifd0Count = 3;
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const makeOffset = ifd0Offset + ifd0Size; // 50

  const exifIfdOffset = makeOffset + make.length; // 58
  const exifCount = 1;
  const exifSize = 2 + exifCount * 12 + 4;
  const serialOffset = exifIfdOffset + exifSize; // 76

  const gpsIfdOffset = serialOffset + serial.length; // 84
  const gpsCount = 4;
  const gpsSize = 2 + gpsCount * 12 + 4;
  const gpsLatOffset = gpsIfdOffset + gpsSize; // 138
  const gpsLonOffset = gpsLatOffset + gpsLat.length; // 162

  const ifd0 = Buffer.concat([
    u16le(ifd0Count),
    ifdEntry(0x010f, 2, make.length, inlineValue(u32le(makeOffset))), // Make
    ifdEntry(0x8769, 4, 1, inlineValue(u32le(exifIfdOffset))), // Exif IFD pointer
    ifdEntry(0x8825, 4, 1, inlineValue(u32le(gpsIfdOffset))), // GPS IFD pointer
    u32le(0),
  ]);

  const exifIfd = Buffer.concat([
    u16le(exifCount),
    ifdEntry(0xfde9, 2, serial.length, inlineValue(u32le(serialOffset))), // SerialNumber
    u32le(0),
  ]);

  const gpsIfd = Buffer.concat([
    u16le(gpsCount),
    ifdEntry(1, 2, gpsLatRef.length, inlineValue(gpsLatRef)), // GPSLatitudeRef
    ifdEntry(2, 5, 3, inlineValue(u32le(gpsLatOffset))), // GPSLatitude
    ifdEntry(3, 2, gpsLonRef.length, inlineValue(gpsLonRef)), // GPSLongitudeRef
    ifdEntry(4, 5, 3, inlineValue(u32le(gpsLonOffset))), // GPSLongitude
    u32le(0),
  ]);

  const header = Buffer.concat([Buffer.from("II", "ascii"), u16le(42), u32le(ifd0Offset)]);

  return Buffer.concat([header, ifd0, make, exifIfd, serial, gpsIfd, gpsLat, gpsLon]);
}

function buildJpegWithExif(): Buffer {
  const tiff = buildMinimalExifTiff();
  const app1Payload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const app1Length = Buffer.alloc(2);
  app1Length.writeUInt16BE(app1Payload.length + 2, 0);

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe1]), // APP1
    app1Length,
    app1Payload,
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

function buildPngWithText(): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0); // width
  ihdrData.writeUInt32BE(1, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 0; // color type: grayscale
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = pngChunk("IHDR", ihdrData);

  const textData = Buffer.concat([Buffer.from("Comment\0", "ascii"), Buffer.from("hello secret", "ascii")]);
  const text = pngChunk("tEXt", textData);
  const iend = pngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, text, iend]);
}

describe("severityFor", () => {
  it("classifies GPS and known high-risk keys as high", () => {
    expect(severityFor("EXIF", "GPSLatitude")).toBe("high");
    expect(severityFor("EXIF", "SerialNumber")).toBe("high");
    expect(severityFor("EXIF", "Artist")).toBe("high");
    expect(severityFor("XMP", "creator")).toBe("high");
  });

  it("classifies camera info as medium", () => {
    expect(severityFor("EXIF", "Make")).toBe("medium");
    expect(severityFor("EXIF", "DateTimeOriginal")).toBe("medium");
    expect(severityFor("EXIF", "LensModel")).toBe("medium");
  });

  it("defaults to low", () => {
    expect(severityFor("EXIF", "ISOSpeedRatings")).toBe("low");
  });
});

describe("scanLeaks", () => {
  it("parses a hand-built JPEG with EXIF GPS + serial number", async () => {
    const blob = new Blob([toArrayBuffer(buildJpegWithExif())]);
    const report = await scanLeaks(blob, "gps.jpg");

    expect(report.gps?.lat).toBeCloseTo(34.0522, 3);
    expect(report.gps?.lon).toBeCloseTo(-118.2437, 3); // West is negative in the signed gps.Longitude

    const serialItem = report.items.find((i) => i.key === "SerialNumber");
    expect(serialItem?.severity).toBe("high");
    expect(serialItem?.value).toContain("TEST123");

    const makeItem = report.items.find((i) => i.key === "Make");
    expect(makeItem?.severity).toBe("medium");
    expect(makeItem?.value).toContain("TestCam");
  });

  it("parses a PNG tEXt chunk", async () => {
    const blob = new Blob([toArrayBuffer(buildPngWithText())]);
    const report = await scanLeaks(blob, "test.png");

    const item = report.items.find((i) => i.block === "PNG-text" && i.key === "Comment");
    expect(item?.value).toContain("hello secret");
  });

  const fixturePath = path.join(__dirname, "..", "fixtures", "gps.jpg");
  const describeIfFixture = fs.existsSync(fixturePath) ? it : it.skip;

  describeIfFixture("parses fixtures/gps.jpg when present", async () => {
    const bytes = fs.readFileSync(fixturePath);
    const blob = new Blob([toArrayBuffer(bytes)]);
    const report = await scanLeaks(blob, "gps.jpg");
    expect(report.gps).toBeDefined();
  });
});
