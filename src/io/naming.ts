import type { OutputFormat } from "../core/types";
import { extFor } from "../core/encode";

// AIDEV-NOTE: `taken` is mutated (the generated name is added before returning) so
// callers can share one Set across an entire batch and get correct collision suffixes
// without bookkeeping the result themselves.
export function outputName(
  relPath: string,
  presetId: string,
  format: OutputFormat,
  taken: Set<string>,
): string {
  const lastSlash = relPath.lastIndexOf("/");
  const dir = lastSlash >= 0 ? relPath.slice(0, lastSlash + 1) : "";
  const base = lastSlash >= 0 ? relPath.slice(lastSlash + 1) : relPath;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = extFor(format);

  let candidate = `${dir}${stem}-${presetId}.${ext}`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${dir}${stem}-${presetId} (${n}).${ext}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}
