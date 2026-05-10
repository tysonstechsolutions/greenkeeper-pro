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
  EquipmentStatus,
} from "@/types/database";

export type ReportLocale = "en" | "es";

export const SUPPORTED_LOCALES: ReportLocale[] = ["en", "es"];

// ── Top-level UI strings rendered in the PDF ────────────────────────────────

export interface ReportLabels {
  /** Cover page title. */
  title: string;
  /** Cover page subtitle. */
  subtitle: string;
  /** "Prepared by:" prefix on the cover. */
  preparedBy: string;
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

  /** Equipment / inventory summary box. */
  inventoryHeading: string;
  inventoryUsedByNote: string;
  inventoryAllOk: (count: number) => string;
  /** Severity tags in the inventory roll-up table. */
  notInInventory: string;
  needsReplacement: string;
  repairOrService: string;
  /** Inventory table column headers. */
  invSeverity: string;
  invTool: string;
  invDetail: string;
  invUsedBy: string;

  /** Action item index table. */
  indexHeading: string;
  /** Index table columns. */
  idxNum: string;
  idxWhere: string;
  idxIssue: string;
  idxPriority: string;
  idxSource: string;
  /** "Auto" / "Logged" tags in the index source column. */
  sourceAuto: string;
  sourceLogged: string;

  /** Per-item ribbon text. */
  resolvedRibbon: string;
  /** Status labels (open / in_progress / resolved / monitoring). */
  statusOpen: string;
  statusInProgress: string;
  statusResolved: string;
  statusMonitoring: string;
  /** Auto-included sub-line. */
  autoIncluded: string;

  /** Per-item section headings. */
  procedureHeading: (title: string) => string;
  bestWindow: string;
  crew: string;
  duration: string;
  toolsAndMaterials: string;
  toolsNeedAttention: (n: number) => string;
  stepByStep: string;
  chemicalApplications: string;
  precautionsFor: (productType: string) => string;
  followUp: string;
  monitorBoxHeading: string;
  documentTheFix: string;
  documentTheFixBody: string;

  /** Step table column headers. */
  stepNum: string;
  stepAction: string;
  stepDetail: string;

  /** Chemical table column headers. */
  chemProductType: string;
  chemExamples: string;
  chemRate: string;
  chemMethod: string;
  chemTiming: string;
  chemREI: string;
  chemREIShort: string;
  chemREINone: string;

  /** Tool inventory annotation tags. */
  toolNotInInventory: string;
  toolNeedsReplacement: string;
  toolConditionNeedsRepair: string;
  toolConditionBeyondRepair: string;
  toolConditionPrefix: string;
  /** Empty/no-data message. */
  noOpenIssues: string;
  /** Footer left text. */
  footer: (date: string, time: string) => string;
  pageOfTotal: (page: number, total: number) => string;
  /** Filename prefix. */
  filenamePrefix: string;
  /** Equipment status labels for tool annotations (uppercase variants). */
  equipmentStatus: Record<EquipmentStatus, string>;
}

// ── English labels ──────────────────────────────────────────────────────────

const enLabels: ReportLabels = {
  title: "Course Action Plan",
  subtitle: "Step-by-Step Fix Procedures (Cultural + Chemical)",
  preparedBy: "Prepared by:",
  actionItemCount: (n) => `${n} action item${n === 1 ? "" : "s"}`,

  introHeading: "How to use this plan",
  introBullets: [
    "Holes are listed first (in priority order), then Greens at the bottom (in priority order).",
    "Each item lists the cultural / mechanical work AND any recommended chemical applications (fertilizer, herbicide, fungicide, insecticide, wetting agent, moss control, etc.).",
    "Exception: GRUB DAMAGE items intentionally do not list chemicals — only address the bare spot left behind.",
    "Tools & Materials are checked against the asset/equipment page. Items flagged in red are NOT IN INVENTORY; items in orange/amber are in repair, need service, or need replacement.",
    "Coordinate every chemical application with the licensed spray contractor. Verify product labeling, REI, and PPE before each app.",
    "Take a fresh photo BEFORE work and AFTER each fix. Mark Resolved in the app and upload the after-photos — the Resolution History keeps a permanent record.",
    "Silvery-moss entries for Green 7 and Greens 10–18 are included automatically per superintendent request.",
  ],

  totalItems: "Total Items",
  critical: "Critical",
  high: "High",
  onHoles: "On Holes",
  onGreens: "On Greens",

  inventoryHeading: "Equipment & Tool Inventory Issues",
  inventoryUsedByNote:
    '"Used by" column shows how many action items below need this tool.',
  inventoryAllOk: (count) =>
    `Equipment inventory check: all powered tools needed for these items are in operational status (${count} active assets).`,
  notInInventory: "NOT IN INVENTORY",
  needsReplacement: "NEEDS REPLACEMENT",
  repairOrService: "REPAIR / SERVICE",
  invSeverity: "Severity",
  invTool: "Tool",
  invDetail: "Detail",
  invUsedBy: "Used by",

  indexHeading: "Action Item Index",
  idxNum: "#",
  idxWhere: "Where",
  idxIssue: "Issue",
  idxPriority: "Priority",
  idxSource: "Source",
  sourceAuto: "Auto",
  sourceLogged: "Logged",

  resolvedRibbon: "RESOLVED",
  statusOpen: "Open",
  statusInProgress: "In Progress",
  statusResolved: "Resolved",
  statusMonitoring: "Monitoring",
  autoIncluded: "  •  Auto-included by request",

  procedureHeading: (title) => `Procedure: ${title}`,
  bestWindow: "BEST WINDOW",
  crew: "CREW",
  duration: "DURATION",
  toolsAndMaterials: "Tools & Materials",
  toolsNeedAttention: (n) =>
    `Tools & Materials  (${n} need attention)`,
  stepByStep: "Step-by-Step Procedure",
  chemicalApplications: "Chemical Applications",
  precautionsFor: (productType) => `Precautions — ${productType}`,
  followUp: "Follow-up",
  monitorBoxHeading: "How you'll know it worked",
  documentTheFix: "Document the fix",
  documentTheFixBody:
    "Open this issue in the app, take new photos of the area, add notes, and tap Resolve. The Resolution History page keeps a permanent before/after record.",

  stepNum: "#",
  stepAction: "Action",
  stepDetail: "Detail",

  chemProductType: "Product Type",
  chemExamples: "Example Products",
  chemRate: "Rate",
  chemMethod: "Method",
  chemTiming: "Timing",
  chemREI: "REI",
  chemREIShort: "hr",
  chemREINone: "N/A",

  toolNotInInventory: "NOT IN INVENTORY",
  toolNeedsReplacement: "needs replacement",
  toolConditionNeedsRepair: "NEEDS REPAIR",
  toolConditionBeyondRepair: "BEYOND REPAIR",
  toolConditionPrefix: "condition:",
  noOpenIssues: "No open issues — course is in great shape.",
  footer: (date, time) =>
    `VMGC GreenKeeper Pro — Action Plan | Generated ${date} ${time}`,
  pageOfTotal: (p, total) => `Page ${p} of ${total}`,
  filenamePrefix: "Course-Action-Plan",
  equipmentStatus: {
    operational: "Operational",
    needs_service: "Needs Service",
    in_repair: "In Repair",
    out_of_service: "Out of Service",
    retired: "Retired",
  },
};

// ── Spanish labels ──────────────────────────────────────────────────────────

const esLabels: ReportLabels = {
  title: "Plan de Acción del Campo",
  subtitle: "Procedimientos de Reparación Paso a Paso (Cultural + Químico)",
  preparedBy: "Preparado por:",
  actionItemCount: (n) => `${n} ${n === 1 ? "elemento" : "elementos"} de acción`,

  introHeading: "Cómo usar este plan",
  introBullets: [
    "Los Hoyos se listan primero (en orden de prioridad), después los Greens al final (en orden de prioridad).",
    "Cada elemento lista el trabajo cultural / mecánico Y las aplicaciones químicas recomendadas (fertilizante, herbicida, fungicida, insecticida, agente humectante, control de musgo, etc.).",
    "Excepción: los elementos de DAÑO POR GUSANOS (grub) intencionalmente no listan químicos — solo se atiende la zona pelada que quedó.",
    "Las Herramientas y Materiales se verifican contra la página de equipos/activos. Los artículos marcados en rojo NO ESTÁN EN INVENTARIO; los marcados en naranja/ámbar están en reparación, necesitan servicio, o necesitan reemplazo.",
    "Coordine cada aplicación química con el contratista licenciado de fumigación. Verifique la etiqueta del producto, el REI (Intervalo de Reentrada) y el EPP (Equipo de Protección Personal) antes de cada aplicación.",
    "Tome una foto NUEVA ANTES del trabajo y DESPUÉS de cada reparación. Marque Resuelto en la app y suba las fotos del después — el Historial de Resoluciones guarda un registro permanente.",
    "Las entradas de musgo plateado para el Green 7 y los Greens 10–18 se incluyen automáticamente por solicitud del superintendente.",
  ],

  totalItems: "Elementos Totales",
  critical: "Crítico",
  high: "Alto",
  onHoles: "En Hoyos",
  onGreens: "En Greens",

  inventoryHeading: "Problemas de Inventario de Equipos y Herramientas",
  inventoryUsedByNote:
    'La columna "Usado en" muestra cuántos elementos de acción de abajo necesitan esta herramienta.',
  inventoryAllOk: (count) =>
    `Verificación de inventario de equipos: todas las herramientas eléctricas necesarias para estos elementos están en estado operacional (${count} activos en servicio).`,
  notInInventory: "NO EN INVENTARIO",
  needsReplacement: "NECESITA REEMPLAZO",
  repairOrService: "REPARACIÓN / SERVICIO",
  invSeverity: "Severidad",
  invTool: "Herramienta",
  invDetail: "Detalle",
  invUsedBy: "Usado en",

  indexHeading: "Índice de Elementos de Acción",
  idxNum: "#",
  idxWhere: "Dónde",
  idxIssue: "Problema",
  idxPriority: "Prioridad",
  idxSource: "Origen",
  sourceAuto: "Auto",
  sourceLogged: "Reportado",

  resolvedRibbon: "RESUELTO",
  statusOpen: "Abierto",
  statusInProgress: "En Progreso",
  statusResolved: "Resuelto",
  statusMonitoring: "En Monitoreo",
  autoIncluded: "  •  Incluido automáticamente por solicitud",

  procedureHeading: (title) => `Procedimiento: ${title}`,
  bestWindow: "MEJOR MOMENTO",
  crew: "CUADRILLA",
  duration: "DURACIÓN",
  toolsAndMaterials: "Herramientas y Materiales",
  toolsNeedAttention: (n) =>
    `Herramientas y Materiales  (${n} ${n === 1 ? "necesita" : "necesitan"} atención)`,
  stepByStep: "Procedimiento Paso a Paso",
  chemicalApplications: "Aplicaciones Químicas",
  precautionsFor: (productType) => `Precauciones — ${productType}`,
  followUp: "Seguimiento",
  monitorBoxHeading: "Cómo saber si funcionó",
  documentTheFix: "Documente la reparación",
  documentTheFixBody:
    "Abra este problema en la app, tome fotos nuevas del área, agregue notas, y presione Resolver. La página de Historial de Resoluciones guarda un registro permanente del antes/después.",

  stepNum: "#",
  stepAction: "Acción",
  stepDetail: "Detalle",

  chemProductType: "Tipo de Producto",
  chemExamples: "Productos de Ejemplo",
  chemRate: "Dosis",
  chemMethod: "Método",
  chemTiming: "Cuándo Aplicar",
  chemREI: "REI",
  chemREIShort: "hr",
  chemREINone: "N/A",

  toolNotInInventory: "NO EN INVENTARIO",
  toolNeedsReplacement: "necesita reemplazo",
  toolConditionNeedsRepair: "NECESITA REPARACIÓN",
  toolConditionBeyondRepair: "MÁS ALLÁ DE REPARACIÓN",
  toolConditionPrefix: "condición:",
  noOpenIssues:
    "No hay problemas abiertos — el campo está en excelente estado.",
  footer: (date, time) =>
    `VMGC GreenKeeper Pro — Plan de Acción | Generado ${date} ${time}`,
  pageOfTotal: (p, total) => `Página ${p} de ${total}`,
  filenamePrefix: "Plan-de-Accion-del-Campo",
  equipmentStatus: {
    operational: "Operacional",
    needs_service: "Necesita Servicio",
    in_repair: "En Reparación",
    out_of_service: "Fuera de Servicio",
    retired: "Retirado",
  },
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
