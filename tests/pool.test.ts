import { describe, expect, it } from "vitest";
import { createPool, type WorkerTask } from "../src/workers/pool";

function makeTask(id: string): WorkerTask {
  return {
    id,
    file: { name: id } as unknown as File,
    preset: { id: "p" } as unknown as WorkerTask["preset"],
    opts: {},
  };
}

describe("createPool (inline runTask, Worker unavailable in Node)", () => {
  it("never runs more than `size` tasks concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const pool = createPool(2, {
      runTask: async (task) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return task.id;
      },
    });

    await Promise.all([1, 2, 3, 4, 5].map((n) => pool.submit(makeTask(`t${n}`))));
    pool.terminate();

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("resolves each submission with its own task's result", async () => {
    const pool = createPool(3, {
      runTask: async (task) => `result-${task.id}`,
    });

    const results = await Promise.all([
      pool.submit<string>(makeTask("a")),
      pool.submit<string>(makeTask("b")),
      pool.submit<string>(makeTask("c")),
    ]);
    pool.terminate();

    expect(results).toEqual(["result-a", "result-b", "result-c"]);
  });

  it("isolates failures: one rejected task doesn't affect the others", async () => {
    const pool = createPool(2, {
      runTask: async (task) => {
        if (task.id === "bad") throw new Error("boom");
        return `ok-${task.id}`;
      },
    });

    const settled = await Promise.allSettled([
      pool.submit(makeTask("good1")),
      pool.submit(makeTask("bad")),
      pool.submit(makeTask("good2")),
    ]);
    pool.terminate();

    expect(settled[0]).toMatchObject({ status: "fulfilled", value: "ok-good1" });
    expect(settled[1].status).toBe("rejected");
    expect(settled[2]).toMatchObject({ status: "fulfilled", value: "ok-good2" });
  });

  it("processes queued tasks beyond the pool size once slots free up", async () => {
    const order: string[] = [];
    const pool = createPool(1, {
      runTask: async (task) => {
        order.push(task.id);
        return task.id;
      },
    });

    await Promise.all(["a", "b", "c"].map((id) => pool.submit(makeTask(id))));
    pool.terminate();

    expect(order).toEqual(["a", "b", "c"]);
  });

  it("rejects submissions after terminate", async () => {
    const pool = createPool(1, { runTask: async (task) => task.id });
    pool.terminate();
    await expect(pool.submit(makeTask("x"))).rejects.toThrow();
  });
});
