import { describe, expect, it, vi } from "vitest";
import { collectAllPages } from "@/lib/supabase/rest";

describe("complete operational pagination", () => {
  it("collects more than 100 visible records without truncation", async () => {
    const source = Array.from({ length: 237 }, (_, index) => ({ id: index + 1 }));
    const fetchPage = vi.fn(async (offset: number, pageSize: number) => (
      source.slice(offset, offset + pageSize)
    ));

    const result = await collectAllPages(fetchPage, 100);

    expect(result).toEqual(source);
    expect(fetchPage.mock.calls).toEqual([
      [0, 100],
      [100, 100],
      [200, 100],
    ]);
  });

  it("requests one final empty page when the total is an exact page multiple", async () => {
    const source = Array.from({ length: 200 }, (_, index) => index);
    const offsets: number[] = [];
    const result = await collectAllPages(async (offset, pageSize) => {
      offsets.push(offset);
      return source.slice(offset, offset + pageSize);
    }, 100);
    expect(result).toHaveLength(200);
    expect(offsets).toEqual([0, 100, 200]);
  });
});
