/**
 * Localized strings for the Action Plan report.
 *
 * Crew-safety rule: we use STATIC translations (not a translation API) for
 * procedure content, equipment, and chemical labels. Mistranslated technical
 * terms can cause real harm — wrong product, wrong rate, wrong PPE.
 *
 * Spanish text uses simple Mexican Spanish, since that's the most common
 * first language of crews on US golf courses. Brand names (Daconil, Stihl,
 * Heritage, Toro, etc.) stay in English — they're proper nouns.
 */

import type {
  HoleIssueType,
  GreenIssueType,
  TaskPriority,
} from "@/types/database";

export type ReportLocale = "en" | "es";

export const SUPPORTED_LOCALES: ReportLocale[] = ["en", "es"];

// ── Top-level UI strings rendered in the PDF ────────────────────────────────

export interface ReportLabels {
  /** Cover page title. */
  title: string;
  /** Cover page subtitle. */
  subtitle: string;
  /** "{n} action item(s)" template — receives count. */
  actionItemCount: (n: number) => string;

  /** Intro box heading. */
  introHeading: string;
  /** Intro bullet lines (in order). */
  introBullets: string[];

  /** Summary stat labels (5 cards). */
  totalItems: string;
  critical: string;
  high: string;
  onHoles: string;
  onGreens: string;

  /** Status labels (open / in_progress / resolved / monitoring). */
  statusOpen: string;
  statusInProgress: string;
  statusResolved: string;
  statusMonitoring: string;
  /** Auto-included sub-line. */
  autoIncluded: string;

  /** Per-item scheduling strip. */
  bestWindow: string;
  crew: string;
  duration: string;
  toolsAndMaterials: string;
  stepByStep: string;

  /** Step table column headers. */
  stepNum: string;
  stepAction: string;
  stepDetail: string;

  /** Empty/no-data message. */
  noOpenIssues: string;
  /** Footer center text. */
  footer: (date: string, time: string) => string;
  pageOfTotal: (page: number, total: number) => string;
  /** Filename prefix. */
  filenamePrefix: string;
}

// ── English labels ──────────────────────────────────────────────────────────

const enLabels: ReportLabels = {
  title: "Course Action Plan",
  subtitle: "Step-by-Step Fix Procedures",
  actionItemCount: (n) => `${n} action item${n === 1 ? "" : "s"}`,

  introHeading: "How to use this plan",
  introBullets: [
    "Holes are listed first (in priority order), then Greens at the bottom (in priority order).",
    "Each item lists the cultural / mechanical work steps needed to address the issue.",
    "Exception: GRUB DAMAGE items focus on repairing only the bare spot left behind — grub control itself is a separate spray program.",
    "Tools & Materials for each item are listed in two columns — gather everything before the crew heads out.",
    "Coordinate every chemical application with the licensed spray contractor. Verify product labeling, REI, and PPE before each app.",
    "Take a fresh photo BEFORE work and AFTER each fix. Mark Resolved in the app and upload the after-photos — the Resolution History keeps a permanent record.",
    "Silvery-moss entries for Green 7 and Greens 10–18 are included automatically per superintendent request.",
  ],

  totalItems: "Total Items",
  critical: "Critical",
  high: "High",
  onHoles: "On Holes",
  onGreens: "On Greens",

  statusOpen: "Open",
  statusInProgress: "In Progress",
  statusResolved: "Resolved",
  statusMonitoring: "Monitoring",
  autoIncluded: "  •  Auto-included by request",

  bestWindow: "BEST WINDOW",
  crew: "CREW",
  duration: "DURATION",
  toolsAndMaterials: "Tools & Materials",
  stepByStep: "Step-by-Step Procedure",

  stepNum: "#",
  stepAction: "Action",
  stepDetail: "Detail",

  noOpenIssues: "No open issues — course is in great shape.",
  footer: (date, time) =>
    `VMGC GreenKeeper Pro — Action Plan | Generated ${date} ${time}`,
  pageOfTotal: (p, total) => `Page ${p} of ${total}`,
  filenamePrefix: "Course-Action-Plan",
};

// ── Spanish labels ──────────────────────────────────────────────────────────

const esLabels: ReportLabels = {
  title: "Plan de Acción del Campo",
  subtitle: "Procedimientos de Reparación Paso a Paso",
  actionItemCount: (n) => `${n} ${n === 1 ? "elemento" : "elementos"} de acción`,

  introHeading: "Cómo usar este plan",
  introBullets: [
    "Los Hoyos se listan primero (en orden de prioridad), después los Greens al final (en orden de prioridad).",
    "Cada elemento lista los pasos de trabajo cultural / mecánico necesarios para resolver el problema.",
    "Excepción: los elementos de DAÑO POR GUSANOS (grub) se enfocan en reparar solo la zona pelada que quedó — el control de gusanos en sí es un programa de fumigación separado.",
    "Las Herramientas y Materiales para cada elemento se listan en dos columnas — reúna todo antes de que la cuadrilla salga al campo.",
    "Coordine cada aplicación química con el contratista licenciado de fumigación. Verifique la etiqueta del producto, el REI (Intervalo de Reentrada) y el EPP (Equipo de Protección Personal) antes de cada aplicación.",
    "Tome una foto NUEVA ANTES del trabajo y DESPUÉS de cada reparación. Marque Resuelto en la app y suba las fotos del después — el Historial de Resoluciones guarda un registro permanente.",
    "Las entradas de musgo plateado para el Green 7 y los Greens 10–18 se incluyen automáticamente por solicitud del superintendente.",
  ],

  totalItems: "Elementos Totales",
  critical: "Crítico",
  high: "Alto",
  onHoles: "En Hoyos",
  onGreens: "En Greens",

  statusOpen: "Abierto",
  statusInProgress: "En Progreso",
  statusResolved: "Resuelto",
  statusMonitoring: "En Monitoreo",
  autoIncluded: "  •  Incluido automáticamente por solicitud",

  bestWindow: "MEJOR MOMENTO",
  crew: "CUADRILLA",
  duration: "DURACIÓN",
  toolsAndMaterials: "Herramientas y Materiales",
  stepByStep: "Procedimiento Paso a Paso",

  stepNum: "#",
  stepAction: "Acción",
  stepDetail: "Detalle",

  noOpenIssues:
    "No hay problemas abiertos — el campo está en excelente estado.",
  footer: (date, time) =>
    `VMGC GreenKeeper Pro — Plan de Acción | Generado ${date} ${time}`,
  pageOfTotal: (p, total) => `Página ${p} de ${total}`,
  filenamePrefix: "Plan-de-Accion-del-Campo",
};

export function getReportLabels(locale: ReportLocale): ReportLabels {
  return locale === "es" ? esLabels : enLabels;
}

// ── Issue type labels (Hole + Green) ────────────────────────────────────────

const holeIssueLabelsEs: Record<HoleIssueType, string> = {
  fungus_disease: "Hongos / Enfermedad",
  dry_spot: "Zona Seca",
  wet_area: "Zona Húmeda",
  bare_spot: "Zona Pelada",
  weed_pressure: "Presión de Maleza",
  pest_damage: "Daño por Plagas",
  grub_damage: "Daño por Gusanos (Grub)",
  mulch_pile: "Pila de Mantillo",
  sticks_around_tree: "Ramas alrededor del Árbol",
  sticks_on_ground: "Ramas en el Suelo",
  felled_tree: "Árbol Caído",
  mechanical_damage: "Daño Mecánico",
  drainage: "Problema de Drenaje",
  bunker_issue: "Problema de Bunker",
  tree_issue: "Problema de Árbol",
  irrigation_issue: "Problema de Riego",
  turf_thin: "Césped Ralo",
  algae: "Algas",
  frost_damage: "Daño por Helada",
  other: "Otro",
};

const greenIssueLabelsEs: Record<GreenIssueType, string> = {
  fungus_disease: "Hongos / Enfermedad",
  dry_spot: "Zona Seca",
  wet_area: "Zona Húmeda",
  bare_spot: "Zona Pelada",
  weed_pressure: "Presión de Maleza",
  pest_damage: "Daño por Plagas",
  grub_damage: "Daño por Gusanos (Grub)",
  mechanical_damage: "Daño Mecánico",
  irrigation_issue: "Problema de Riego",
  algae: "Algas",
  frost_damage: "Daño por Helada",
  ball_marks: "Marcas de Pelota",
  scalping: "Rasurado (Scalp)",
  compaction: "Compactación",
  thatch_buildup: "Acumulación de Paja (Thatch)",
  aeration_needed: "Aireación Necesaria",
  topdressing_needed: "Topdressing Necesario",
  moss: "Musgo",
  shade_stress: "Estrés por Sombra",
  traffic_wear: "Desgaste por Tráfico",
  chemical_burn: "Quemadura Química",
  poor_drainage: "Drenaje Deficiente",
  uneven_surface: "Superficie Despareja",
  other: "Otro",
};

export function getHoleIssueLabel(
  type: HoleIssueType,
  locale: ReportLocale,
): string {
  if (locale === "es") return holeIssueLabelsEs[type] || type;
  // English fallback comes from hole-constants.ts via the report.
  return type;
}

export function getGreenIssueLabel(
  type: GreenIssueType,
  locale: ReportLocale,
): string {
  if (locale === "es") return greenIssueLabelsEs[type] || type;
  return type;
}

// ── Priority labels ────────────────────────────────────────────────────────

const priorityLabelsEs: Record<TaskPriority, string> = {
  critical: "CRÍTICO",
  high: "ALTO",
  normal: "NORMAL",
  low: "BAJO",
};

const priorityLabelsEn: Record<TaskPriority, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  normal: "NORMAL",
  low: "LOW",
};

export function getPriorityLabel(
  p: TaskPriority,
  locale: ReportLocale,
): string {
  return locale === "es" ? priorityLabelsEs[p] : priorityLabelsEn[p];
}

// ── Surface labels ─────────────────────────────────────────────────────────

export function getSurfaceLabel(
  surface: "Hole" | "Green",
  locale: ReportLocale,
): string {
  if (locale === "es") return surface === "Hole" ? "Hoyo" : "Green";
  return surface;
}

// ── Status labels (observation) ────────────────────────────────────────────

export function getStatusLabel(
  status: string,
  locale: ReportLocale,
): string {
  const labels = getReportLabels(locale);
  switch (status) {
    case "open":
      return labels.statusOpen;
    case "in_progress":
      return labels.statusInProgress;
    case "resolved":
      return labels.statusResolved;
    case "monitoring":
      return labels.statusMonitoring;
    default:
      return status;
  }
}

// ── Auto-included silvery moss item content ────────────────────────────────

export function getMossAutoTitle(locale: ReportLocale): string {
  return locale === "es"
    ? "Musgo Plateado — Superficie de Putting"
    : "Silvery Moss — Putting Surface";
}

export function getMossAutoDescription(locale: ReportLocale): string {
  return locale === "es"
    ? "Parches de musgo plateado en la superficie de putting. Tratar con prácticas mecánicas, culturales y químicas autorizadas."
    : "Silvery moss patches on the putting surface. Treat with mechanical, cultural, and authorized chemical practices.";
}
