/**
 * Tool inventory matcher for the Action Plan report.
 *
 * Each procedure in fix-procedures.ts lists the tools needed for the work.
 * For powered/specialized equipment, this module looks the tool up against
 * the live equipment list (the same data the Asset/Equipment page shows) and
 * annotates the tool with availability status:
 *
 *   - Found + operational  →  "Backpack blower (Stihl BR 600)"
 *   - Found + has issue    →  "Backpack blower — Stihl BR 600: IN REPAIR"
 *   - Not found            →  "Backpack blower — NOT IN INVENTORY"
 *
 * Basic hand tools and consumable materials (shovels, rakes, hose, sand,
 * seed, etc.) are passed through unchanged — those are assumed to be on
 * hand and don't need to be checked against the asset list.
 */

import type {
  Equipment,
  EquipmentStatus,
  EquipmentType,
} from "@/types/database";
import { equipmentStatusLabels } from "@/lib/hooks/useEquipment";
import { getReportLabels, type ReportLocale } from "./action-plan-i18n";

interface PoweredPattern {
  /** Regex matched case-insensitively against the raw tool string. */
  regex: RegExp;
  /** Equipment types that count as a match. */
  types: EquipmentType[];
}

/**
 * Patterns are checked in order — first match wins. List specific tools
 * before generic ones (e.g. "core aerator" before bare "aerator").
 */
const POWERED_PATTERNS: PoweredPattern[] = [
  // Mowers (specific → generic)
  { regex: /\bgreens? mower\b|\breel mower\b|\bwalk[- ]?behind (greens? )?mower\b|\bwalk mower\b/i, types: ["mower_reel"] },
  { regex: /\bfairway mower\b|\brotary mower\b/i, types: ["mower_rotary"] },
  { regex: /\brough mower\b/i, types: ["mower_rough"] },
  { regex: /\bmower\b/i, types: ["mower_reel", "mower_rotary", "mower_rough"] },

  // Aerators (cultivation)
  { regex: /\bcore aerator\b/i, types: ["aerator"] },
  { regex: /\bdeep[- ]?tine aerator\b/i, types: ["aerator"] },
  { regex: /\bsolid[- ]?tine aerator\b|\bpencil aerator\b/i, types: ["aerator"] },
  { regex: /\baerator\b/i, types: ["aerator"] },

  // Topdresser
  { regex: /\btopdresser\b/i, types: ["topdresser"] },

  // Sprayers
  { regex: /\btank sprayer\b|\bspray rig\b|\bgreens spray rig\b|\bsprayer\b/i, types: ["sprayer"] },

  // Verticut / dethatch / groomer (treated as seeders or "other")
  { regex: /\bverticutter\b|\bdethatcher\b|\bvertical mower\b|\bgreens? groomer\b|\bverticut\b/i, types: ["seeder", "other"] },

  // Seeders
  { regex: /\bslit[- ]?seeder\b|\boverseeder\b|\bseeder\b/i, types: ["seeder"] },

  // Blowers / trimmers / chainsaws
  { regex: /\b(backpack )?blower\b/i, types: ["blower"] },
  { regex: /\btrimmer\b/i, types: ["trimmer"] },
  { regex: /\bchainsaw\b/i, types: ["chainsaw"] },

  // Roller (excludes basic "drag mat or steel mat" — the bare word "roller" can be powered or hand)
  { regex: /\b(walk[- ]?behind |power |light )?roller\b/i, types: ["roller"] },

  // Wood chipper, sod cutter, fan, pole saw — typically "other" type
  { regex: /\b(wood )?chipper\b/i, types: ["other"] },
  { regex: /\bsod cutter\b/i, types: ["other", "hand_tool"] },
  { regex: /\bportable fan\b|\bfan\b/i, types: ["other"] },
  { regex: /\bpole saw\b|\bpole-saw\b|\bpole pruner\b/i, types: ["hand_tool", "other"] },

  // Tractor / utility vehicle
  { regex: /\btractor\b/i, types: ["tractor"] },
  { regex: /\butility vehicle\b|\butility cart\b|\bUTV\b/i, types: ["utility_vehicle"] },

  // Pumps
  { regex: /\bpump\b/i, types: ["pump"] },
];

/** Status priority — lower index = better. Used to pick the best match. */
const STATUS_PRIORITY: Record<EquipmentStatus, number> = {
  operational: 0,
  needs_service: 1,
  in_repair: 2,
  out_of_service: 3,
  retired: 4,
};

export type ToolMatchStatus =
  | "ok"          // Basic hand tool / material, OR matched + operational
  | "issue"       // Matched but flagged (needs service / in repair)
  | "out"         // Matched but out of service / retired
  | "missing";    // Powered tool needed but not in inventory

export interface ToolMatch {
  /** Exactly the string from procedure.tools_needed[]. */
  rawText: string;
  /** Annotated text to render in the PDF. */
  displayText: string;
  /** Color/category bucket for visual styling. */
  status: ToolMatchStatus;
  /** True if the report should call out this tool as a problem in the summary. */
  isProblem: boolean;
}

/**
 * Match a tool string against the equipment inventory.
 *
 * Hand tools / materials always return status "ok" without checking the
 * inventory (the user said "other than basic tools like shovels, rakes,
 * etc." — those don't need to be in the asset list).
 *
 * Locale controls the language of the annotations (NOT IN INVENTORY,
 * needs replacement, condition: NEEDS REPAIR). The `rawText` is whatever
 * the caller passed in — if you want a Spanish raw tool name, pass it in
 * Spanish. The annotations come from action-plan-i18n.ts.
 */
export function matchTool(
  rawText: string,
  inventory: Equipment[],
  locale: ReportLocale = "en",
): ToolMatch {
  const L = getReportLabels(locale);
  // Statuses are localized via the i18n labels. equipmentStatusLabels
  // (from useEquipment.ts) is English — the i18n version is what we render.
  const localizedStatusUpper = (s: EquipmentStatus): string =>
    (L.equipmentStatus[s] || equipmentStatusLabels[s] || s).toUpperCase();

  // Find a powered-equipment pattern that matches this tool string.
  // The pattern regexes are built from English keywords, but they ALSO
  // match Spanish keywords for the same equipment so callers can pass
  // either-language text. (e.g. "Sopladora" / "blower", "Podadora" /
  // "mower"). Powered-equipment names are largely shared internationally
  // on golf courses, so the Spanish text often contains the English noun.
  let matchedPattern: PoweredPattern | null = null;
  for (const p of POWERED_PATTERNS) {
    if (p.regex.test(rawText)) {
      matchedPattern = p;
      break;
    }
  }
  // If raw English regex didn't match, try the Spanish equivalents below.
  if (!matchedPattern) {
    for (const p of SPANISH_POWERED_PATTERNS) {
      if (p.regex.test(rawText)) {
        matchedPattern = p;
        break;
      }
    }
  }

  // No powered pattern matched → it's a basic hand tool or material.
  if (!matchedPattern) {
    return {
      rawText,
      displayText: rawText,
      status: "ok",
      isProblem: false,
    };
  }

  // Find candidate equipment rows.
  const candidates = inventory.filter((e) => {
    // Type match counts.
    if (matchedPattern!.types.includes(e.equipment_type)) return true;
    // Name keyword match counts (handles cases where someone tagged the
    // equipment_type as "other" but the name is descriptive).
    return matchedPattern!.regex.test(e.name);
  });

  if (candidates.length === 0) {
    return {
      rawText,
      displayText: `${rawText} — ${L.toolNotInInventory}`,
      status: "missing",
      isProblem: true,
    };
  }

  // Prefer the best-status candidate.
  candidates.sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status],
  );
  const best = candidates[0];

  if (best.status === "operational") {
    // Operational: just append the asset name in plain parentheses.
    // If condition is degraded, still mention it so the user knows.
    if (best.condition_status === "needs_repair" || best.condition_status === "beyond_repair") {
      const condLabel =
        best.condition_status === "needs_repair"
          ? L.toolConditionNeedsRepair
          : L.toolConditionBeyondRepair;
      return {
        rawText,
        displayText: `${rawText} (${best.name} — ${L.toolConditionPrefix} ${condLabel})`,
        status: "issue",
        isProblem: true,
      };
    }
    return {
      rawText,
      displayText: `${rawText} (${best.name})`,
      status: "ok",
      isProblem: false,
    };
  }

  // Non-operational status — flag it.
  const statusUpper = localizedStatusUpper(best.status);
  if (best.status === "out_of_service" || best.status === "retired") {
    return {
      rawText,
      displayText: `${rawText} — ${best.name}: ${statusUpper} (${L.toolNeedsReplacement})`,
      status: "out",
      isProblem: true,
    };
  }

  // needs_service or in_repair
  return {
    rawText,
    displayText: `${rawText} — ${best.name}: ${statusUpper}`,
    status: "issue",
    isProblem: true,
  };
}

/** Match every tool in the list at once. */
export function matchTools(
  rawTools: string[],
  inventory: Equipment[],
  locale: ReportLocale = "en",
): ToolMatch[] {
  return rawTools.map((t) => matchTool(t, inventory, locale));
}

// ── Spanish equipment-keyword patterns ─────────────────────────────────────
// These mirror the English POWERED_PATTERNS so Spanish tool strings (like
// "Podadora caminante" or "Sopladora de mochila") still resolve to the same
// equipment types in the asset list.
const SPANISH_POWERED_PATTERNS: PoweredPattern[] = [
  // Mowers
  { regex: /\bpodadora caminante\b|\bpodadora de greens?\b|\bpodadora reel\b/i, types: ["mower_reel"] },
  { regex: /\bpodadora rotativa\b|\bpodadora de fairway\b/i, types: ["mower_rotary"] },
  { regex: /\bpodadora de rough\b/i, types: ["mower_rough"] },
  { regex: /\bpodadora\b/i, types: ["mower_reel", "mower_rotary", "mower_rough"] },

  // Aerators
  { regex: /\baireador (con )?tines huecos\b/i, types: ["aerator"] },
  { regex: /\baireador (con )?tines? sólidos? profundos?\b/i, types: ["aerator"] },
  { regex: /\baireador (tipo |de )?pencil\b|\baireador pencil-tine\b/i, types: ["aerator"] },
  { regex: /\baireador\b/i, types: ["aerator"] },

  // Topdresser
  { regex: /\btopdresser\b/i, types: ["topdresser"] },

  // Sprayers
  { regex: /\bsprayer (de tanque|tanque)\b|\bsprayer\b|\bequipo de fumigación\b/i, types: ["sprayer"] },

  // Verticut/groomer
  { regex: /\bverticutter\b|\bdethatcher\b|\bvertical mower\b|\bgreens? groomer\b|\bverticut\b/i, types: ["seeder", "other"] },

  // Seeders
  { regex: /\bslit[- ]?seeder\b|\boverseeder\b|\bsembrador\b/i, types: ["seeder"] },

  // Blower / trimmer / chainsaw
  { regex: /\bsopladora( de mochila)?\b/i, types: ["blower"] },
  { regex: /\bdesbrozadora\b|\btrimmer\b/i, types: ["trimmer"] },
  { regex: /\bmotosierra\b/i, types: ["chainsaw"] },

  // Roller
  { regex: /\brodillo (caminante|eléctrico|de potencia|ligero)?\b/i, types: ["roller"] },

  // Wood chipper, sod cutter, fan, pole saw
  { regex: /\bastilladora\b|\bchipper\b/i, types: ["other"] },
  { regex: /\bsod cutter\b|\bcortadora de césped\b/i, types: ["other", "hand_tool"] },
  { regex: /\bventilador (portátil)?\b/i, types: ["other"] },
  { regex: /\btijera de pértiga\b|\btijeras de pértiga\b/i, types: ["hand_tool", "other"] },

  // Tractor / utility vehicle
  { regex: /\btractor\b/i, types: ["tractor"] },
  { regex: /\bvehículo utilitario\b|\bcarrito utilitario\b/i, types: ["utility_vehicle"] },

  // Pumps
  { regex: /\bbomba\b/i, types: ["pump"] },
];
