/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "@/lib/utils/concurrency";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("mapWithConcurrency", () => {
  it("returns an empty array for empty input", async () => {
    const out = await mapWithConcurrency([], 3, async (x) => x);
    expect(out).toEqual([]);
  });

  it("preserves input order regardless of completion order", async () => {
    // Earlier items resolve LATER, so out-of-order completion is guaranteed.
    const input = [30, 20, 10, 0];
    const out = await mapWithConcurrency(input, 4, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:30", "1:20", "2:10", "3:0"]);
  });

  it("passes the index to the worker", async () => {
    const out = await mapWithConcurrency(["a", "b", "c"], 2, async (x, i) => `${i}${x}`);
    expect(out).toEqual(["0a", "1b", "2c"]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      running++;
      peak = Math.max(peak, running);
      await tick();
      await tick();
      running--;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // actually ran concurrently
  });

  it("completes all items even when there are more items than the limit", async () => {
    const out = await mapWithConcurrency(Array.from({ length: 7 }, (_, i) => i), 2, async (x) => x * 2);
    expect(out).toEqual([0, 2, 4, 6, 8, 10, 12]);
  });

  it("propagates a rejection from any task", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (x) => {
        if (x === 2) throw new Error("boom");
        return x;
      }),
    ).rejects.toThrow("boom");
  });
});
