import type { Box, Job, LeakReport, Preset, ProcessResult } from "./types";
import { decodeFile } from "./decode";
import { computeTargetSize, resizeBitmap } from "./resize";
import type { TargetSize } from "./resize";
import { encode } from "./encode";
import { scanLeaks } from "./leaks";
import { fitToSize } from "./targetSize";
import { applyRedactions } from "../pro/redact";
import { getSharedPool } from "../workers/pool";
import type { WorkerTask } from "../workers/pool";

export interface ProcessOneOptions {
  targetKB?: number;
  redactions?: Box[];
}

interface FitToSizeResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  quality: number;
}

async function fitToSizeSafe(
  imageData: ImageData,
  format: Preset["format"],
  maxKB: number,
): Promise<{ result: FitToSizeResult; targetUnreachable: boolean }> {
  try {
    const result = await fitToSize(imageData, format, maxKB);
    return { result, targetUnreachable: false };
  } catch (err) {
    const withBest = err as { name?: string; best?: FitToSizeResult };
    if (withBest?.name === "TargetUnreachableError" && withBest.best) {
      return { result: withBest.best, targetUnreachable: true };
    }
    throw err;
  }
}

async function scanLeaksSafe(file: File): Promise<LeakReport> {
  // AIDEV-NOTE: a leak-scan failure (corrupt/unsupported metadata) must never fail
  // the whole file — the encoded output is still useful without a leak report.
  try {
    return await scanLeaks(file);
  } catch {
    return { file: file.name, items: [] };
  }
}

export function mapBoxesToTarget(
  boxes: Box[],
  srcW: number,
  srcH: number,
  target: TargetSize,
): Box[] {
  const crop = target.crop ?? { sx: 0, sy: 0, sw: srcW, sh: srcH };
  const scaleX = target.width / crop.sw;
  const scaleY = target.height / crop.sh;
  return boxes.map((b) => ({
    x: Math.round((b.x - crop.sx) * scaleX),
    y: Math.round((b.y - crop.sy) * scaleY),
    w: Math.round(b.w * scaleX),
    h: Math.round(b.h * scaleY),
    source: b.source,
  }));
}

export async function processOne(
  file: File,
  preset: Preset,
  opts: ProcessOneOptions = {},
): Promise<ProcessResult> {
  const bitmap = await decodeFile(file);
  let targetUnreachable = false;

  try {
    const target = computeTargetSize(bitmap.width, bitmap.height, {
      width: preset.width,
      height: preset.height,
      fit: preset.fit,
    });

    let imageData = await resizeBitmap(bitmap, target);

    if (opts.redactions && opts.redactions.length > 0) {
      // AIDEV-NOTE: boxes come from the redaction editor in source-pixel coordinates.
      // Map them through the crop/scale so they land on the same faces after resize.
      // A redaction failure fails this file on purpose: silently shipping an
      // un-redacted image would defeat the feature.
      const boxes = mapBoxesToTarget(opts.redactions, bitmap.width, bitmap.height, target);
      imageData = applyRedactions(imageData, boxes, "block");
    }

    let bytes: Uint8Array;
    let width = imageData.width;
    let height = imageData.height;

    const maxKB = opts.targetKB ?? preset.maxKB;
    if (maxKB) {
      const fit = await fitToSizeSafe(imageData, preset.format, maxKB);
      bytes = fit.result.bytes;
      width = fit.result.width;
      height = fit.result.height;
      targetUnreachable = fit.targetUnreachable;
    } else {
      bytes = await encode(imageData, preset.format, preset.quality);
    }

    const report = await scanLeaksSafe(file);

    return {
      file: file.name,
      relPath: file.name,
      presetId: preset.id,
      bytes,
      format: preset.format,
      width,
      height,
      report,
      ...(targetUnreachable ? { targetUnreachable: true } : {}),
    };
  } finally {
    bitmap.close();
  }
}

export interface JobTaskOpts {
  redactions?: Box[];
  targetKB?: number;
}

export async function runJob(
  job: Job,
  presets: Preset[],
  onResult: (r: ProcessResult) => void,
  onProgress: (done: number, total: number, failed: { file: string; error: Error }[]) => void,
): Promise<void> {
  const presetById = new Map(presets.map((p) => [p.id, p]));
  const tasks: { file: File; preset: Preset }[] = [];
  for (const file of job.files) {
    for (const presetId of job.presetIds) {
      const preset = presetById.get(presetId);
      if (preset) tasks.push({ file, preset });
    }
  }

  const total = tasks.length;
  let done = 0;
  const failed: { file: string; error: Error }[] = [];
  const pool = getSharedPool();

  await Promise.all(
    tasks.map(async ({ file, preset }) => {
      const task: WorkerTask = {
        id: `${file.name}::${preset.id}`,
        file,
        preset,
        opts: {
          targetKB: job.targetKB,
          redactions: job.redactions?.[file.name],
        },
      };
      try {
        const result = await pool.submit<ProcessResult>(task);
        onResult(result);
      } catch (err) {
        failed.push({ file: file.name, error: err instanceof Error ? err : new Error(String(err)) });
      } finally {
        done += 1;
        onProgress(done, total, failed);
      }
    }),
  );
}
