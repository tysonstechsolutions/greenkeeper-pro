import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveWorkOrderPhotoDataUrls,
  workOrderPhotoUrl,
} from "@/lib/work-orders/photos";

// 1×1 transparent PNG.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const PNG_BYTES = Uint8Array.from(atob(TINY_PNG.split(",")[1]), (c) =>
  c.charCodeAt(0),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workOrderPhotoUrl", () => {
  it("passes data: and absolute URLs through untouched", () => {
    expect(workOrderPhotoUrl(TINY_PNG)).toBe(TINY_PNG);
    expect(workOrderPhotoUrl("https://cdn.example/photos/a.jpg")).toBe(
      "https://cdn.example/photos/a.jpg",
    );
  });

  it("builds a public storage URL for a bare path", () => {
    expect(workOrderPhotoUrl("uid/2026/08/a.jpg")).toContain(
      "/storage/v1/object/public/photos/uid/2026/08/a.jpg",
    );
  });

  it("returns empty string for a missing ref", () => {
    expect(workOrderPhotoUrl("")).toBe("");
  });
});

describe("resolveWorkOrderPhotoDataUrls", () => {
  it("returns [] for null/empty input without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await resolveWorkOrderPhotoDataUrls(null)).toEqual([]);
    expect(await resolveWorkOrderPhotoDataUrls([])).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes inline data URLs through without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await resolveWorkOrderPhotoDataUrls([TINY_PNG])).toEqual([TINY_PNG]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("downloads a stored path and returns it as an embeddable data URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob([PNG_BYTES], { type: "image/png" }),
      })),
    );

    const [dataUrl] = await resolveWorkOrderPhotoDataUrls(["uid/2026/08/a.png"]);
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(dataUrl).toBe(TINY_PNG);
  });

  it("drops a photo it cannot fetch instead of failing the whole download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("missing")
          ? { ok: false, status: 404, text: async () => "not found" }
          : { ok: true, blob: async () => new Blob([PNG_BYTES], { type: "image/png" }) },
      ),
    );

    const out = await resolveWorkOrderPhotoDataUrls([
      "uid/2026/08/missing.png",
      "uid/2026/08/a.png",
    ]);
    expect(out).toEqual([TINY_PNG]);
  });
});
