import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  classifyTurfImage,
  loadLabels,
  _resetLabelsCache,
} from "@/lib/ai/ondevice-classifier";
import type { TurfLabelsManifest } from "@/lib/ai/classifier-types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_LABELS: TurfLabelsManifest = {
  version: "1.0.0",
  classes: [
    { id: 0, name: "dollar_spot", display: "Dollar Spot", description: "Small, round bleached spots on turf blades" },
    { id: 1, name: "brown_patch", display: "Brown Patch", description: "Circular brown/tan patches with smoke ring border" },
    { id: 2, name: "anthracnose", display: "Anthracnose", description: "Yellowing turf with dark lesions on stems" },
    { id: 3, name: "pythium", display: "Pythium Blight", description: "Greasy, water-soaked patches that mat down" },
    { id: 4, name: "dry_spot", display: "Dry Spot / LDS", description: "Hydrophobic soil causing localized dry areas" },
    { id: 5, name: "insect_damage", display: "Insect Damage", description: "Irregular browning from grubs, armyworms, or other pests" },
    { id: 6, name: "chemical_burn", display: "Chemical Burn", description: "Uniform browning following spray pattern" },
    { id: 7, name: "traffic_wear", display: "Traffic Wear", description: "Compaction and thinning from foot/cart traffic" },
    { id: 8, name: "scalping", display: "Scalping", description: "Yellowing from mower cutting too low" },
    { id: 9, name: "healthy", display: "Healthy Turf", description: "No significant issues detected" },
  ],
  model_file: "model.onnx",
  input_size: [224, 224],
  model_status: "placeholder",
};

const FAKE_IMAGE = "data:image/jpeg;base64,/9j/fakebase64data==";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockFetchSequence(responses: Array<{ ok: boolean; json?: () => Promise<unknown>; status?: number }>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return resp;
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ondevice-classifier", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    _resetLabelsCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("loads labels correctly from JSON", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => MOCK_LABELS,
    })) as unknown as typeof fetch;

    const labels = await loadLabels();

    expect(labels.version).toBe("1.0.0");
    expect(labels.classes).toHaveLength(10);
    expect(labels.classes[0].name).toBe("dollar_spot");
    expect(labels.model_status).toBe("placeholder");
  });

  it("caches labels after first load", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => MOCK_LABELS,
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await loadLabels();
    await loadLabels();

    // Only one fetch call — second load uses cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("calls cloud fallback when model_status is placeholder", async () => {
    // First call: labels fetch; Second call: cloud API
    const cloudResponse = {
      title: "Dollar Spot Detected",
      description: "Small bleached lesions visible on bentgrass",
      issue_type: "dollar_spot",
    };

    globalThis.fetch = mockFetchSequence([
      { ok: true, json: async () => MOCK_LABELS },
      { ok: true, json: async () => cloudResponse },
    ]) as unknown as typeof fetch;

    const result = await classifyTurfImage(FAKE_IMAGE);

    expect(result.source).toBe("cloud");
    expect(result.predictions.length).toBeGreaterThan(0);
    expect(result.predictions[0].className).toBe("dollar_spot");
    expect(result.predictions[0].displayName).toBe("Dollar Spot");
  });

  it("returns valid ClassificationResult with correct source from cloud", async () => {
    const cloudResponse = {
      title: "Brown Patch Infection",
      description: "Large circular patch with smoke ring",
      issue_type: "brown_patch",
    };

    globalThis.fetch = mockFetchSequence([
      { ok: true, json: async () => MOCK_LABELS },
      { ok: true, json: async () => cloudResponse },
    ]) as unknown as typeof fetch;

    const result = await classifyTurfImage(FAKE_IMAGE);

    expect(result.source).toBe("cloud");
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.predictions[0]).toEqual(
      expect.objectContaining({
        classId: 1,
        className: "brown_patch",
        displayName: "Brown Patch",
        confidence: expect.any(Number),
        description: expect.any(String),
      })
    );
  });

  it("triggers offline fallback when cloud API fails", async () => {
    globalThis.fetch = mockFetchSequence([
      { ok: true, json: async () => MOCK_LABELS },
      { ok: false, status: 500 },
    ]) as unknown as typeof fetch;

    const result = await classifyTurfImage(FAKE_IMAGE);

    expect(result.source).toBe("fallback");
    expect(result.predictions).toHaveLength(1);
    expect(result.predictions[0].className).toBe("unknown");
    expect(result.predictions[0].displayName).toBe("Unable to classify");
    expect(result.predictions[0].confidence).toBe(0);
  });

  it("triggers offline fallback when network is unavailable", async () => {
    globalThis.fetch = mockFetchSequence([
      { ok: true, json: async () => MOCK_LABELS },
    ]) as unknown as typeof fetch;

    // Override fetch to succeed for labels but throw for cloud
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, json: async () => MOCK_LABELS };
      }
      throw new Error("Network unavailable");
    }) as unknown as typeof fetch;

    const result = await classifyTurfImage(FAKE_IMAGE);

    expect(result.source).toBe("fallback");
    expect(result.predictions[0].description).toContain("No network");
  });

  it("returns offline fallback when labels cannot be loaded", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
    })) as unknown as typeof fetch;

    const result = await classifyTurfImage(FAKE_IMAGE);

    expect(result.source).toBe("fallback");
    expect(result.predictions[0].className).toBe("unknown");
  });

  it("maps unrecognized cloud issue_type to unclassified result", async () => {
    const cloudResponse = {
      title: "Some Rare Condition",
      description: "An unusual pattern",
      issue_type: "rare_condition_xyz",
    };

    globalThis.fetch = mockFetchSequence([
      { ok: true, json: async () => MOCK_LABELS },
      { ok: true, json: async () => cloudResponse },
    ]) as unknown as typeof fetch;

    const result = await classifyTurfImage(FAKE_IMAGE);

    expect(result.source).toBe("cloud");
    expect(result.predictions[0].classId).toBe(-1);
    expect(result.predictions[0].className).toBe("rare_condition_xyz");
    expect(result.predictions[0].displayName).toBe("Some Rare Condition");
  });

  it("does not attempt on-device inference when model_status is placeholder", async () => {
    // We verify this implicitly: with placeholder status, the cloud endpoint
    // is the second fetch call (not a HEAD request for model.onnx)
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);

      if (url.includes("labels.json")) {
        return { ok: true, json: async () => MOCK_LABELS };
      }
      // Cloud API
      return {
        ok: true,
        json: async () => ({
          title: "Test",
          description: "Test desc",
          issue_type: "healthy",
        }),
      };
    }) as unknown as typeof fetch;

    await classifyTurfImage(FAKE_IMAGE);

    // Should NOT have fetched model.onnx
    expect(calls.some((c) => c.includes("model.onnx"))).toBe(false);
    // Should have fetched labels then cloud
    expect(calls[0]).toContain("labels.json");
    expect(calls[1]).toContain("analyze-observation-photo");
  });

  it("predictions include confidence as a number between 0 and 1", async () => {
    const cloudResponse = {
      title: "Pythium Blight",
      description: "Greasy water-soaked patches",
      issue_type: "pythium",
    };

    globalThis.fetch = mockFetchSequence([
      { ok: true, json: async () => MOCK_LABELS },
      { ok: true, json: async () => cloudResponse },
    ]) as unknown as typeof fetch;

    const result = await classifyTurfImage(FAKE_IMAGE);

    for (const pred of result.predictions) {
      expect(pred.confidence).toBeGreaterThanOrEqual(0);
      expect(pred.confidence).toBeLessThanOrEqual(1);
    }
  });
});
