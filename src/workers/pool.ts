import type { Box, OutputFormat, Preset, ProcessResult } from "../core/types";
// AIDEV-NOTE: see the single-file branch in createPool() below for why this exists
// alongside the hosted build's `new URL(...)` module worker.
import InlineProcessWorker from "./process.worker.ts?worker&inline";

export interface WorkerTaskOpts {
  targetKB?: number;
  redactions?: Box[];
}

export interface WorkerTask {
  id: string;
  file: File;
  preset: Preset;
  opts: WorkerTaskOpts;
}

export type RunTask = (task: WorkerTask) => Promise<unknown>;

export interface Pool {
  submit<T>(task: WorkerTask): Promise<T>;
  /** Load the given codecs in every worker. Call during boot, before markBootComplete(). */
  warm(formats: OutputFormat[]): Promise<void>;
  terminate: () => void;
  size: number;
}

export interface WarmMessage {
  id: string;
  kind: "warm";
  formats: OutputFormat[];
}

interface QueueItem {
  task: WorkerTask;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

interface WorkerMessageOk {
  id: string;
  ok: true;
  result: ProcessResult;
}

interface WorkerMessageErr {
  id: string;
  ok: false;
  error: { name: string; message: string; best?: unknown };
}

function defaultSize(): number {
  const hw = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  return Math.max(1, Math.min((hw ?? 2) - 1, 4));
}

// AIDEV-NOTE: In real browser use this spins up `size` module Workers running
// process.worker.ts and round-robins queued tasks across whichever worker is idle.
// In Node/Vitest, `Worker` is undefined, so an injectable `runTask` (options.runTask)
// takes over — the same queue/backpressure logic runs, just without postMessage, which
// lets tests exercise concurrency-limiting and failure isolation without a DOM/worker
// runtime.
export function createPool(size: number = defaultSize(), options: { runTask?: RunTask } = {}): Pool {
  const queue: QueueItem[] = [];
  const pending = new Map<string, PendingEntry>();
  let active = 0;
  let terminated = false;

  const useRealWorkers = typeof Worker !== "undefined" && !options.runTask;
  const workers: { worker: Worker; busy: boolean }[] = [];

  if (useRealWorkers) {
    for (let i = 0; i < size; i++) {
      // AIDEV-NOTE: the single-file build needs the worker's code inlined as a blob
      // (no separate .js file Vite would otherwise emit next to photolock.html), so
      // it uses the `?worker&inline` query, which vite-plugin-singlefile/Vite turns
      // into a Worker constructed from an inline blob URL. The hosted build instead
      // uses a real `new URL(...)` module worker so it's a separate, cacheable chunk.
      const worker =
        import.meta.env.PHOTOLOCK_SINGLEFILE === "true"
          ? new InlineProcessWorker()
          : new Worker(new URL("./process.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<WorkerMessageOk | WorkerMessageErr>) => {
        const msg = event.data;
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.id.startsWith("warm::")) {
          if (entry) {
            if (msg.ok) entry.resolve(undefined);
            else entry.reject(new Error(msg.error.message));
          }
          return;
        }
        active -= 1;
        const slot = workers.find((w) => w.worker === worker);
        if (slot) slot.busy = false;
        if (entry) {
          if (msg.ok) entry.resolve(msg.result);
          else {
            const err = new Error(msg.error.message);
            err.name = msg.error.name;
            if (msg.error.best) (err as unknown as { best: unknown }).best = msg.error.best;
            entry.reject(err);
          }
        }
        pump();
      };
      workers.push({ worker, busy: false });
    }
  }

  function pump(): void {
    if (terminated) return;
    while (active < size && queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      active += 1;
      runItem(item);
    }
  }

  function runItem(item: QueueItem): void {
    if (useRealWorkers) {
      const slot = workers.find((w) => !w.busy);
      if (!slot) {
        // AIDEV-NOTE: should not happen because active < size guarantees an idle worker.
        active -= 1;
        queue.unshift(item);
        return;
      }
      slot.busy = true;
      pending.set(item.task.id, { resolve: item.resolve, reject: item.reject });
      slot.worker.postMessage({ id: item.task.id, file: item.task.file, preset: item.task.preset, opts: item.task.opts });
      return;
    }

    const runTask = options.runTask;
    if (!runTask) {
      active -= 1;
      item.reject(new Error("createPool: no Worker available and no runTask provided"));
      pump();
      return;
    }
    runTask(item.task)
      .then((result) => {
        active -= 1;
        item.resolve(result);
        pump();
      })
      .catch((err: unknown) => {
        active -= 1;
        item.reject(err);
        pump();
      });
  }

  // AIDEV-NOTE: codec WASM is fetched lazily by each worker on first encode. Warming
  // every worker during boot keeps those fetches in the boot phase, so the Network tab
  // and the netguard counter stay at zero during the first real batch (M4). Netguard
  // runs on the main thread only and cannot observe worker fetches, so this is the
  // only place the guarantee can be enforced.
  function warm(formats: OutputFormat[]): Promise<void> {
    if (!useRealWorkers) return Promise.resolve();
    return Promise.all(
      workers.map(
        ({ worker }, i) =>
          new Promise<void>((resolve, reject) => {
            const id = `warm::${i}`;
            pending.set(id, { resolve: () => resolve(), reject });
            const msg: WarmMessage = { id, kind: "warm", formats };
            worker.postMessage(msg);
          }),
      ),
    ).then(() => undefined);
  }

  return {
    size,
    warm,
    submit<T>(task: WorkerTask): Promise<T> {
      if (terminated) return Promise.reject(new Error("createPool: pool terminated"));
      return new Promise<T>((resolve, reject) => {
        queue.push({ task, resolve: resolve as (value: unknown) => void, reject });
        pump();
      });
    },
    terminate(): void {
      terminated = true;
      for (const { worker } of workers) worker.terminate();
    },
  };
}

let shared: Pool | undefined;

// AIDEV-NOTE: one long-lived pool per page so the warm-up done at boot is not thrown
// away by a per-job pool; runJob() must not terminate it.
export function getSharedPool(): Pool {
  if (!shared) shared = createPool();
  return shared;
}
