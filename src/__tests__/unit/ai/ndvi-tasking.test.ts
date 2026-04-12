import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  analyzeNDVIForTasks,
  parseAnalysisResponse,
  generateTaskTitle,
  severityToPriority,
} from "@/lib/ai/ndvi-tasking";
import type { StressZone } from "@/lib/ai/ndvi-tasking";

// ─── Mock helpers ───────────────────────────────────────────────────────────

function mockImageFetch() {
  // Simulate a tiny 1x1 PNG as base64
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "image/png" }),
    arrayBuffer: async () => pngBytes.buffer,
  } as unknown as Response;
}

function mockClaudeResponse(zones: unknown[], summary: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ stressZones: zones, summary }),
        },
      ],
    }),
    text: async () => "",
  } as unknown as Response;
}

function makeStressZones(count: number): unknown[] {
  const zones = [];
  for (let i = 1; i <= count; i++) {
    zones.push({
      description: `Stress area near hole ${i} fairway showing discoloration`,
      estimatedHole: i,
      severity: i === 1 ? "severe" : i === 2 ? "moderate" : "minor",
      suggestedAction: `Scout hole ${i} for potential dry spot`,
    });
  }
  return zones;
}

const baseParams = {
  imageUrl: "https://example.supabase.co/storage/v1/object/sign/drone-flights/preview.png?token=abc",
  flightDate: "2026-04-10",
  band: "ndvi",
  courseContext: "18-hole course, holes 1-9 east side, holes 10-18 west side.",
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("analyzeNDVIForTasks", () => {
  let originalFetch: typeof global.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalEnv = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-123";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ANTHROPIC_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns 3 stress zones from a successful Claude response", async () => {
    const zones = makeStressZones(3);
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      // First call = image fetch, second call = Claude API
      if (callCount === 1) return Promise.resolve(mockImageFetch());
      return Promise.resolve(
        mockClaudeResponse(zones, "Found 3 areas of turf stress.")
      );
    });

    const result = await analyzeNDVIForTasks(baseParams);

    expect(result.stressZones).toHaveLength(3);
    expect(result.summary).toContain("3");
    expect(result.tasksGenerated).toBe(3);

    // Verify zone details
    expect(result.stressZones[0].severity).toBe("severe");
    expect(result.stressZones[0].estimatedHole).toBe(1);
    expect(result.stressZones[1].severity).toBe("moderate");
    expect(result.stressZones[2].severity).toBe("minor");
  });

  it("returns empty analysis when Claude finds no stress", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockImageFetch());
      return Promise.resolve(
        mockClaudeResponse([], "No significant turf stress detected in this survey.")
      );
    });

    const result = await analyzeNDVIForTasks(baseParams);

    expect(result.stressZones).toHaveLength(0);
    expect(result.summary).toContain("No significant");
    expect(result.tasksGenerated).toBe(0);
  });

  it("returns empty analysis on Claude API failure", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockImageFetch());
      return Promise.resolve({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as unknown as Response);
    });

    const result = await analyzeNDVIForTasks(baseParams);

    expect(result.stressZones).toHaveLength(0);
    expect(result.summary).toContain("failed");
    expect(result.tasksGenerated).toBe(0);
  });

  it("returns empty analysis on image fetch failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    } as unknown as Response);

    const result = await analyzeNDVIForTasks(baseParams);

    expect(result.stressZones).toHaveLength(0);
    expect(result.summary).toContain("Failed to fetch");
    expect(result.tasksGenerated).toBe(0);
  });

  it("returns empty analysis when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await analyzeNDVIForTasks(baseParams);

    expect(result.stressZones).toHaveLength(0);
    expect(result.summary).toContain("ANTHROPIC_API_KEY");
    expect(result.tasksGenerated).toBe(0);
  });
});

describe("parseAnalysisResponse", () => {
  it("handles malformed JSON gracefully", () => {
    const result = parseAnalysisResponse("This is not JSON at all");

    expect(result.stressZones).toHaveLength(0);
    expect(result.summary).toContain("parse");
    expect(result.tasksGenerated).toBe(0);
  });

  it("handles JSON with markdown code fences", () => {
    const text = '```json\n{"stressZones": [{"description": "Test zone", "estimatedHole": 5, "severity": "moderate", "suggestedAction": "Scout area"}], "summary": "One zone found"}\n```';

    const result = parseAnalysisResponse(text);

    expect(result.stressZones).toHaveLength(1);
    expect(result.stressZones[0].estimatedHole).toBe(5);
    expect(result.stressZones[0].severity).toBe("moderate");
  });

  it("clamps estimatedHole to 1-18 range", () => {
    const text = JSON.stringify({
      stressZones: [
        { description: "Zone A", estimatedHole: 0, severity: "minor", suggestedAction: "Scout" },
        { description: "Zone B", estimatedHole: 25, severity: "minor", suggestedAction: "Scout" },
        { description: "Zone C", estimatedHole: 9, severity: "minor", suggestedAction: "Scout" },
      ],
      summary: "Test",
    });

    const result = parseAnalysisResponse(text);

    expect(result.stressZones[0].estimatedHole).toBeNull();
    expect(result.stressZones[1].estimatedHole).toBeNull();
    expect(result.stressZones[2].estimatedHole).toBe(9);
  });
});

describe("generateTaskTitle", () => {
  it("generates a title with hole number and severity", () => {
    const zone: StressZone = {
      description: "Northwest quadrant stress pattern",
      estimatedHole: 4,
      severity: "moderate",
      suggestedAction: "Scout for dollar spot",
    };

    const title = generateTaskTitle(zone);

    expect(title).toContain("Hole 4");
    expect(title).toContain("moderate");
    expect(title).toContain("Scout:");
  });

  it("uses 'Course area' when no hole is estimated", () => {
    const zone: StressZone = {
      description: "General stress area",
      estimatedHole: null,
      severity: "severe",
      suggestedAction: "Scout area",
    };

    const title = generateTaskTitle(zone);

    expect(title).toContain("Course area");
    expect(title).toContain("severe");
  });
});

describe("severityToPriority", () => {
  it("maps minor to normal", () => {
    expect(severityToPriority("minor")).toBe("normal");
  });

  it("maps moderate to high", () => {
    expect(severityToPriority("moderate")).toBe("high");
  });

  it("maps severe to critical", () => {
    expect(severityToPriority("severe")).toBe("critical");
  });
});
