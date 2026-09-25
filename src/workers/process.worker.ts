import { processOne } from "../core/pipeline";
import { encode } from "../core/encode";
import type { WarmMessage, WorkerTask } from "./pool";

async function warm(msg: WarmMessage): Promise<void> {
  try {
    const tiny = new ImageData(1, 1);
    for (const format of msg.formats) await encode(tiny, format, 85);
    self.postMessage({ id: msg.id, ok: true });
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: { name: "EncodeError", message: String(err) } });
  }
}

// AIDEV-NOTE: One task = one (file, preset) pair. Runs in its own module Worker so a
// slow/large image never blocks the main thread or sibling workers.
self.onmessage = async (event: MessageEvent<WorkerTask | WarmMessage>) => {
  const data = event.data;
  if ("kind" in data && data.kind === "warm") return warm(data);
  const { id, file, preset, opts } = data as WorkerTask;
  try {
    const result = await processOne(file, preset, opts);
    // AIDEV-NOTE: transfer the encoded bytes' buffer back instead of structured-cloning
    // them, per spec.
    self.postMessage({ id, ok: true, result }, { transfer: [result.bytes.buffer] });
  } catch (err) {
    const error = err as { name?: string; message?: string; best?: unknown };
    self.postMessage({
      id,
      ok: false,
      error: {
        name: error?.name ?? "Error",
        message: error?.message ?? String(err),
        ...(error?.best ? { best: error.best } : {}),
      },
    });
  }
};
