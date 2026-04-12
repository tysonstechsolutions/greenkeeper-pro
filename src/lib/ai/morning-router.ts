// src/lib/ai/morning-router.ts
// AI-powered morning crew routing with frost/dew/tee-time awareness

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  skills: string[]; // e.g., ['mowing', 'spraying', 'irrigation', 'bunkers']
}

export interface MorningTask {
  id: string;
  title: string;
  zone: string; // "Hole 1 Green", "Fairway 5-7", "Practice Range"
  estimatedMinutes: number;
  requiredSkill?: string;
  priority: "critical" | "high" | "normal";
  equipment?: string; // "Triplex #3", "Walk mower #1"
}

export interface MorningConditions {
  frostDelayUntil: string | null; // ISO time — null if no frost
  dewBurnoffTime: string; // ISO time — when dew lifts
  firstTeeTime: string; // ISO time
  sunrise: string; // ISO time
  temperature_f: number;
  wind_mph: number;
}

export interface RoutedTask {
  crewMemberId: string;
  crewMemberName: string;
  taskId: string;
  taskTitle: string;
  zone: string;
  startTime: string; // ISO time
  endTime: string; // ISO time
  notes?: string; // Claude's reasoning
}

export interface MorningRoute {
  date: string;
  conditions: MorningConditions;
  routes: RoutedTask[];
  summary: string; // Claude's plain-English summary
  generatedAt: string;
}

export interface GenerateMorningRouteInput {
  date: string;
  tasks: MorningTask[];
  crew: CrewMember[];
  conditions: MorningConditions;
  existingTeeSheet?: Array<{ time: string; group: string }>;
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

function buildRoutingPrompt(input: GenerateMorningRouteInput): string {
  const { date, tasks, crew, conditions, existingTeeSheet } = input;

  const taskList = tasks
    .map(
      (t) =>
        `- [${t.id}] "${t.title}" | Zone: ${t.zone} | Est: ${t.estimatedMinutes}min | Priority: ${t.priority}${t.requiredSkill ? ` | Requires: ${t.requiredSkill}` : ""}${t.equipment ? ` | Equipment: ${t.equipment}` : ""}`
    )
    .join("\n");

  const crewList = crew
    .map(
      (c) =>
        `- [${c.id}] ${c.name} | Role: ${c.role} | Skills: ${c.skills.join(", ")}`
    )
    .join("\n");

  const teeSheetInfo = existingTeeSheet?.length
    ? `\nTee sheet:\n${existingTeeSheet.map((t) => `- ${t.time}: ${t.group}`).join("\n")}`
    : "";

  return `You are the morning crew routing AI for a golf course. Plan the optimal morning work schedule for ${date}.

CONDITIONS:
- Sunrise: ${conditions.sunrise}
- Frost delay until: ${conditions.frostDelayUntil || "NONE (no frost)"}
- Dew burnoff time: ${conditions.dewBurnoffTime}
- First tee time: ${conditions.firstTeeTime}
- Temperature: ${conditions.temperature_f}°F
- Wind: ${conditions.wind_mph} mph
${teeSheetInfo}

CREW:
${crewList}

TASKS:
${taskList}

ROUTING RULES (strict):
1. During frost delay: ONLY allow indoor work (shop maintenance, equipment prep). No outdoor tasks before frost delay lifts.
2. Do NOT mow greens or tees before dew burns off — poor cut quality and noise complaints.
3. Clear holes 1-3 area BEFORE the first tee time. This is the critical path — golfers must not see maintenance crews on the first few holes at tee time.
4. Balance workload across crew members as evenly as possible.
5. Group tasks geographically — minimize transit time between zones.
6. Match crew skills: spraying needs a licensed applicator, specialized mowing needs equipment certification.
7. All tasks must be assigned. If a crew member lacks the skill for any remaining task, assign the closest-skilled person with a note.

OUTPUT FORMAT:
Return a JSON object with exactly this structure (no markdown fencing, no extra text):
{
  "routes": [
    {
      "crewMemberId": "<crew member id>",
      "crewMemberName": "<crew member name>",
      "taskId": "<task id>",
      "taskTitle": "<task title>",
      "zone": "<zone>",
      "startTime": "<ISO 8601 datetime>",
      "endTime": "<ISO 8601 datetime>",
      "notes": "<brief reasoning for this assignment and timing>"
    }
  ],
  "summary": "<2-4 sentence plain-English summary of the plan, mentioning key constraints like frost delay, first tee, and how work is distributed>"
}

Use the date ${date} for all timestamps. Start times should be realistic — account for travel between zones (5 min between adjacent holes, 10 min across the course).`;
}

// ─── Fallback round-robin router ─────────────────────────────────────────────

function generateFallbackRoute(input: GenerateMorningRouteInput): MorningRoute {
  const { date, tasks, crew, conditions } = input;

  // Sort tasks by priority: critical first, then high, then normal
  const priorityOrder = { critical: 0, high: 1, normal: 2 };
  const sorted = [...tasks].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );

  // Determine earliest start time
  const earliest = conditions.frostDelayUntil || conditions.sunrise;

  const routes: RoutedTask[] = [];
  // Track current time per crew member
  const crewTimes: Record<string, Date> = {};
  for (const c of crew) {
    crewTimes[c.id] = new Date(earliest);
  }

  // Round-robin assignment
  let crewIndex = 0;
  for (const task of sorted) {
    const member = crew[crewIndex % crew.length];
    const start = crewTimes[member.id];
    const end = new Date(start.getTime() + task.estimatedMinutes * 60_000);

    routes.push({
      crewMemberId: member.id,
      crewMemberName: member.name,
      taskId: task.id,
      taskTitle: task.title,
      zone: task.zone,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      notes: "Fallback assignment (AI unavailable) — round-robin by priority",
    });

    crewTimes[member.id] = end;
    crewIndex++;
  }

  return {
    date,
    conditions,
    routes,
    summary: `Fallback route: ${sorted.length} tasks assigned round-robin to ${crew.length} crew members. AI routing was unavailable — review and adjust manually.`,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Main generator ──────────────────────────────────────────────────────────

export async function generateMorningRoute(
  input: GenerateMorningRouteInput
): Promise<MorningRoute> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set — using fallback router");
    return generateFallbackRoute(input);
  }

  if (input.tasks.length === 0) {
    return {
      date: input.date,
      conditions: input.conditions,
      routes: [],
      summary: "No tasks scheduled for this date.",
      generatedAt: new Date().toISOString(),
    };
  }

  if (input.crew.length === 0) {
    return {
      date: input.date,
      conditions: input.conditions,
      routes: [],
      summary: "No crew members available for routing.",
      generatedAt: new Date().toISOString(),
    };
  }

  const prompt = buildRoutingPrompt(input);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    let res: Response;
    try {
      res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Claude API error ${res.status}: ${errBody}`);
      return generateFallbackRoute(input);
    }

    const data = await res.json();
    const textContent = data.content
      ?.filter((b: { type: string }) => b.type === "text")
      ?.map((b: { text: string }) => b.text)
      ?.join("") || "";

    // Parse JSON from Claude's response — strip markdown fencing if present
    const jsonStr = textContent
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();

    const parsed = JSON.parse(jsonStr);

    if (!parsed.routes || !Array.isArray(parsed.routes)) {
      console.error("Claude response missing routes array");
      return generateFallbackRoute(input);
    }

    // Sort routes by crew member, then by start time
    const routes: RoutedTask[] = parsed.routes
      .map((r: RoutedTask) => ({
        crewMemberId: r.crewMemberId,
        crewMemberName: r.crewMemberName,
        taskId: r.taskId,
        taskTitle: r.taskTitle,
        zone: r.zone,
        startTime: r.startTime,
        endTime: r.endTime,
        notes: r.notes,
      }))
      .sort((a: RoutedTask, b: RoutedTask) => {
        const crewCompare = a.crewMemberId.localeCompare(b.crewMemberId);
        if (crewCompare !== 0) return crewCompare;
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      });

    return {
      date: input.date,
      conditions: input.conditions,
      routes,
      summary: parsed.summary || "Morning route generated successfully.",
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Morning route generation failed:", err);
    return generateFallbackRoute(input);
  }
}
