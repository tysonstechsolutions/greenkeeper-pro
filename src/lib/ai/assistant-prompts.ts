// Shared example prompts for the AI assistant. Used by the empty states of
// both the top-of-screen AssistantBar panel and the full /assistant page.

import type { UserRole } from "@/types/database";

export const EXAMPLE_PROMPTS = [
  "What's going on today?",
  "Give me a morning briefing",
  "Sprinkler head broken on #7 green, get that fixed",
  "We need to order more bunker sand",
  "What tasks are due today?",
  "Any fungus or disease we're tracking on the course?",
  "How many FY26 assets are MIA?",
  "Pothole on the cart path between 3 and 4",
  "Mark the mowing on #1-9 as done",
  "Show me equipment that needs service",
  "Add reel blades for triplex #2 to the order list",
  "The triplex is making a weird noise, flag it for service",
  "Who is working today?",
  "Bathroom in the clubhouse needs cleaning",
  "What's on the order list right now?",
  "Any dry spots reported this week?",
];

export function getRandomPrompts(count: number): string[] {
  const shuffled = [...EXAMPLE_PROMPTS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/** Roles allowed to use the AI assistant (bar + full page). */
export const ASSISTANT_ROLES: readonly string[] = [
  "super",
  "asst_super",
  "foreman",
  "director",
  "gm",
];

export function canUseAssistant(role: UserRole | string | null | undefined): boolean {
  return !!role && ASSISTANT_ROLES.includes(role);
}
