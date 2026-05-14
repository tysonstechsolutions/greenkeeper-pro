import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateMorningRoute, type GenerateMorningRouteInput } from "@/lib/ai/morning-router";

// ─── Test fixtures ───────────────────────────────────────────────────────────

const DATE = "2026-04-12";

const baseCrew = [
  { id: "crew-1", name: "Alice Smith", role: "foreman", skills: ["mowing", "irrigation", "bunkers"] },
  { id: "crew-2", name: "Bob Jones", role: "technician", skills: ["mowing", "bunkers", "spraying"] },
];

const baseTasks = [
  { id: "t1", title: "Mow Greens 1-9", zone: "Holes 1-9 Greens", estimatedMinutes: 60, requiredSkill: "mowing", priority: "critical" as const },
  { id: "t2", title: "Rake Bunkers Front 9", zone: "Holes 1-9 Bunkers", estimatedMinutes: 45, priority: "high" as const },
  { id: "t3", title: "Spray Fairway 5", zone: "Fairway 5", estimatedMinutes: 30, requiredSkill: "spraying", priority: "normal" as const },
  { id: "t4", title: "Fix Irrigation Head #12", zone: "Hole 12", estimatedMinutes: 20, requiredSkill: "irrigation", priority: "high" as const },
];

const baseConditions = {
  frostDelayUntil: null,
  dewBurnoffTime: `${DATE}T07:30:00.000Z`,
  firstTeeTime: `${DATE}T07:00:00.000Z`,
  sunrise: `${DATE}T06:00:00.000Z`,
  temperature_f: 55,
  wind_mph: 5,
};

function makeInput(overrides?: Partial<GenerateMorningRouteInput>): GenerateMorningRouteInput {
  return {
    date: DATE,
    tasks: baseTasks,
    crew: baseCrew,
    conditions: baseConditions,
    ...overrides,
  };
}

// ─── Mock fetch ──────────────────────────────────────────────────────────────

function mockClaudeResponse(routes: unknown[], summary: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ routes, summary }),
        },
      ],
    }),
    text: async () => "",
  } as unknown as Response;
}

function makeRoutedTasks() {
  return [
    {
      crewMemberId: "crew-1",
      crewMemberName: "Alice Smith",
      taskId: "t1",
      taskTitle: "Mow Greens 1-9",
      zone: "Holes 1-9 Greens",
      startTime: `${DATE}T07:30:00.000Z`,
      endTime: `${DATE}T08:30:00.000Z`,
      notes: "After dew burnoff",
    },
    {
      crewMemberId: "crew-1",
      crewMemberName: "Alice Smith",
      taskId: "t4",
      taskTitle: "Fix Irrigation Head #12",
      zone: "Hole 12",
      startTime: `${DATE}T08:35:00.000Z`,
      endTime: `${DATE}T08:55:00.000Z`,
      notes: "After greens mowing",
    },
    {
      crewMemberId: "crew-2",
      crewMemberName: "Bob Jones",
      taskId: "t2",
      taskTitle: "Rake Bunkers Front 9",
      zone: "Holes 1-9 Bunkers",
      startTime: `${DATE}T06:00:00.000Z`,
      endTime: `${DATE}T06:45:00.000Z`,
      notes: "Before first tee",
    },
    {
      crewMemberId: "crew-2",
      crewMemberName: "Bob Jones",
      taskId: "t3",
      taskTitle: "Spray Fairway 5",
      zone: "Fairway 5",
      startTime: `${DATE}T06:50:00.000Z`,
      endTime: `${DATE}T07:20:00.000Z`,
      notes: "Licensed applicator",
    },
  ];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("generateMorningRoute", () => {
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

  it("returns routes for all tasks assigned to crew members", async () => {
    const routes = makeRoutedTasks();
    global.fetch = vi.fn().mockResolvedValue(
      mockClaudeResponse(routes, "4 tasks assigned to 2 crew members.")
    );

    const result = await generateMorningRoute(makeInput());

    expect(result.routes).toHaveLength(4);
    expect(result.summary).toContain("4 tasks");
    expect(result.date).toBe(DATE);
    expect(result.conditions).toEqual(baseConditions);

    // Every task should be assigned
    const taskIds = result.routes.map((r) => r.taskId).sort();
    expect(taskIds).toEqual(["t1", "t2", "t3", "t4"]);

    // Every route should have a crew member
    for (const r of result.routes) {
      expect(r.crewMemberId).toBeTruthy();
      expect(r.crewMemberName).toBeTruthy();
    }
  });

  it("sorts routes by crew member then start time", async () => {
    // Provide routes in scrambled order
    const routes = [
      makeRoutedTasks()[3], // crew-2, later
      makeRoutedTasks()[0], // crew-1, earlier
      makeRoutedTasks()[2], // crew-2, earlier
      makeRoutedTasks()[1], // crew-1, later
    ];
    global.fetch = vi.fn().mockResolvedValue(
      mockClaudeResponse(routes, "Sorted test")
    );

    const result = await generateMorningRoute(makeInput());

    // crew-1 tasks should come before crew-2 (alphabetical by ID)
    expect(result.routes[0].crewMemberId).toBe("crew-1");
    expect(result.routes[1].crewMemberId).toBe("crew-1");
    expect(result.routes[2].crewMemberId).toBe("crew-2");
    expect(result.routes[3].crewMemberId).toBe("crew-2");

    // Within crew-1, sorted by start time
    const crew1Times = result.routes
      .filter((r) => r.crewMemberId === "crew-1")
      .map((r) => new Date(r.startTime).getTime());
    expect(crew1Times[0]).toBeLessThan(crew1Times[1]);
  });

  it("returns fallback route on Claude API error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as unknown as Response);

    const result = await generateMorningRoute(makeInput());

    // Fallback should still assign all tasks
    expect(result.routes).toHaveLength(4);
    expect(result.summary).toContain("Fallback");
    // All routes should have the fallback note
    for (const r of result.routes) {
      expect(r.notes).toContain("Fallback");
    }
  });

  it("returns fallback route when API key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await generateMorningRoute(makeInput());

    expect(result.routes).toHaveLength(4);
    expect(result.summary).toContain("Fallback");
  });

  it("returns empty routes when no tasks provided", async () => {
    const result = await generateMorningRoute(makeInput({ tasks: [] }));

    expect(result.routes).toHaveLength(0);
    expect(result.summary).toContain("No tasks");
  });

  it("returns empty routes when no crew provided", async () => {
    const result = await generateMorningRoute(makeInput({ crew: [] }));

    expect(result.routes).toHaveLength(0);
    expect(result.summary).toContain("No crew");
  });

  it("handles malformed JSON from Claude gracefully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "Not valid JSON {{{" }],
      }),
      text: async () => "",
    } as unknown as Response);

    const result = await generateMorningRoute(makeInput());

    // Should fall back to round-robin
    expect(result.routes).toHaveLength(4);
    expect(result.summary).toContain("Fallback");
  });
});
