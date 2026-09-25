import { describe, expect, it } from "vitest";
import type { Preset, LeakReport, Job, Box, ProcessResult } from "../src/core/types";

describe("core types smoke test", () => {
  it("compiles and shapes a Preset", () => {
    const preset: Preset = {
      id: "square-1080",
      platform: "generic",
      label: "Square 1080",
      width: 1080,
      height: 1080,
      fit: "cover",
      format: "jpeg",
      lastVerified: null,
      sourceUrl: null,
    };
    expect(preset.width).toBe(1080);
  });

  it("shapes a LeakReport, Job, Box, and ProcessResult", () => {
    const box: Box = { x: 0, y: 0, w: 10, h: 10, source: "manual" };
    const report: LeakReport = { file: "a.jpg", items: [] };
    const job: Job = { files: [], presetIds: ["square-1080"], output: "zip" };
    const result: ProcessResult = {
      file: "a.jpg",
      relPath: "a.jpg",
      presetId: "square-1080",
      bytes: new Uint8Array(),
      format: "jpeg",
      width: 1080,
      height: 1080,
      report,
    };

    expect(box.source).toBe("manual");
    expect(job.output).toBe("zip");
    expect(result.format).toBe("jpeg");
  });
});
