// AIDEV-NOTE: Error classes transcribed from RDD.md "Error handling" table.

export class UnsupportedFormatError extends Error {
  constructor(message = "Format not decodable natively or by the HEIC fallback") {
    super(message);
    this.name = "UnsupportedFormatError";
  }
}

export class DecodeError extends Error {
  constructor(message = "Corrupt file") {
    super(message);
    this.name = "DecodeError";
  }
}

export class TooLargeError extends Error {
  constructor(message = "More than 100 MP decoded") {
    super(message);
    this.name = "TooLargeError";
  }
}

export class EncodeError extends Error {
  constructor(message = "Codec failure") {
    super(message);
    this.name = "EncodeError";
  }
}

export class TargetUnreachableError extends Error {
  best: { bytes: Uint8Array; width: number; height: number; quality: number };

  constructor(
    best: { bytes: Uint8Array; width: number; height: number; quality: number },
    message = "Can't reach maxKB",
  ) {
    super(message);
    this.name = "TargetUnreachableError";
    this.best = best;
  }
}

export class WriteDeniedError extends Error {
  constructor(message = "Folder permission revoked") {
    super(message);
    this.name = "WriteDeniedError";
  }
}

export class LicenseInvalidError extends Error {
  constructor(message = "Bad signature or format") {
    super(message);
    this.name = "LicenseInvalidError";
  }
}
