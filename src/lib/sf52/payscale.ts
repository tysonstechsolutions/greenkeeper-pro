/**
 * Great Lakes NAF Crafts & Trades wage schedule (AC-145, Wage Schedule #053,
 * Lake, Illinois (CHI) wage area — issued 5 Dec 2025, "GREAT LAKES PAY SCALE
 * 2026"). Values transcribed from the official schedule PDF.
 *
 * Rows are grades, columns are steps 1–5; rates are hourly.
 * Cross-checked against the office's filled SF-52s: NA grade 7 step 1 =
 * $22.50 (Maintenance Worker NA-4749-07).
 */

export type PayPlan = "NA" | "NL" | "NS";

export const PAY_SCALE_YEAR = "2026";

const NA: number[][] = [
  [17.31, 18.04, 18.76, 19.49, 20.2],
  [18.19, 18.94, 19.7, 20.46, 21.21],
  [19.05, 19.84, 20.63, 21.43, 22.21],
  [19.91, 20.73, 21.57, 22.39, 23.22],
  [20.77, 21.64, 22.5, 23.37, 24.24],
  [21.64, 22.55, 23.44, 24.33, 25.24],
  [22.5, 23.44, 24.36, 25.3, 26.25],
  [23.37, 24.33, 25.3, 26.28, 27.25],
  [24.24, 25.24, 26.24, 27.25, 28.25],
  [25.09, 26.13, 27.18, 28.22, 29.26],
  [25.96, 27.03, 28.12, 29.19, 30.27],
  [26.81, 27.94, 29.05, 30.17, 31.28],
  [27.69, 28.82, 29.99, 31.14, 32.28],
  [28.59, 29.78, 30.97, 32.16, 33.35],
  [29.46, 30.68, 31.92, 33.14, 34.38],
];

const NL: number[][] = [
  [19.05, 19.84, 20.63, 21.43, 22.21],
  [20.0, 20.83, 21.66, 22.49, 23.32],
  [20.95, 21.82, 22.69, 23.57, 24.44],
  [21.9, 22.81, 23.71, 24.64, 25.55],
  [22.84, 23.81, 24.76, 25.71, 26.66],
  [23.8, 24.79, 25.77, 26.76, 27.76],
  [24.75, 25.77, 26.8, 27.83, 28.85],
  [25.69, 26.76, 27.83, 28.91, 29.98],
  [26.65, 27.76, 28.85, 29.98, 31.09],
  [27.59, 28.75, 29.91, 31.04, 32.19],
  [28.55, 29.72, 30.92, 32.11, 33.3],
  [29.49, 30.72, 31.95, 33.17, 34.41],
  [30.45, 31.71, 32.98, 34.24, 35.53],
  [31.46, 32.76, 34.07, 35.39, 36.69],
  [32.41, 33.75, 35.12, 36.46, 37.81],
];

const NS: number[][] = [
  [21.99, 22.89, 23.82, 24.74, 25.65],
  [22.84, 23.81, 24.76, 25.71, 26.66],
  [23.7, 24.7, 25.69, 26.67, 27.68],
  [24.57, 25.6, 26.62, 27.64, 28.67],
  [25.44, 26.51, 27.56, 28.62, 29.68],
  [26.3, 27.4, 28.49, 29.59, 30.69],
  [27.16, 28.3, 29.44, 30.55, 31.69],
  [28.03, 29.2, 30.38, 31.52, 32.7],
  [29.06, 30.27, 31.48, 32.69, 33.91],
  [30.09, 31.35, 32.61, 33.85, 35.12],
  [31.15, 32.45, 33.73, 35.04, 36.32],
  [32.17, 33.51, 34.84, 36.18, 37.53],
  [33.2, 34.6, 35.99, 37.36, 38.74],
  [34.31, 35.74, 37.16, 38.58, 40.02],
  [35.36, 36.82, 38.29, 39.76, 41.23],
  [36.82, 38.36, 39.91, 41.43, 42.95],
  [38.3, 39.91, 41.49, 43.09, 44.68],
  [39.76, 41.42, 43.08, 44.73, 46.39],
  [41.23, 42.95, 44.68, 46.39, 48.1],
];

const TABLES: Record<PayPlan, number[][]> = { NA, NL, NS };

export const PAY_PLANS: PayPlan[] = ["NA", "NL", "NS"];

export function payScaleGrades(plan: PayPlan): number[] {
  return TABLES[plan].map((_, i) => i + 1);
}

export const PAY_SCALE_STEPS = [1, 2, 3, 4, 5];

/** Hourly rate for plan/grade/step, or null when out of range. */
export function lookupPayRate(plan: string, grade: number, step: number): number | null {
  const table = TABLES[plan as PayPlan];
  if (!table) return null;
  const rate = table[grade - 1]?.[step - 1];
  return rate ?? null;
}

/** "22.50" — how rates are written on the SF-52. */
export function formatPayRate(rate: number): string {
  return rate.toFixed(2);
}
