/**
 * Smith-Kerns Dollar Spot Probability Model
 *
 * Published, validated model from the University of Wisconsin.
 * Predicts dollar spot (Clarireedia jacksonii) occurrence probability
 * based on 5-day average temperature and relative humidity.
 *
 * Reference:
 *   Smith, D.L., J.P. Kerns, et al. (2018). "Development and validation
 *   of a weather-based warning system to advise fungicide applications
 *   to control dollar spot on turfgrass." PLoS ONE 13(3): e0194216.
 *
 * Formula:
 *   logit(p) = -11.4041 + 0.1932 * avg_temp_5d_c + 0.0894 * avg_rh_5d
 *   p = 1 / (1 + exp(-logit(p)))
 */

// Model coefficients
const INTERCEPT = -11.4041;
const TEMP_COEFF = 0.1932;
const RH_COEFF = 0.0894;

/**
 * Convert Fahrenheit to Celsius.
 */
function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

/**
 * Calculate the probability of dollar spot occurrence using the
 * Smith-Kerns logistic regression model.
 *
 * @param avgTemp5dF - Average air temperature over the last 5 days in Fahrenheit
 * @param avgRh5d   - Average relative humidity over the last 5 days (0-100%)
 * @returns Probability of dollar spot occurrence (0-1)
 */
export function calculateDollarSpotProbability({
  avgTemp5dF,
  avgRh5d,
}: {
  avgTemp5dF: number;
  avgRh5d: number;
}): number {
  const tempC = fahrenheitToCelsius(avgTemp5dF);
  const logitP = INTERCEPT + TEMP_COEFF * tempC + RH_COEFF * avgRh5d;
  const probability = 1 / (1 + Math.exp(-logitP));
  return probability;
}

/**
 * Map a dollar spot probability to a human-readable risk level.
 */
export function getDollarSpotRisk(
  probability: number
): "low" | "moderate" | "high" | "very-high" {
  if (probability < 0.2) return "low";
  if (probability < 0.4) return "moderate";
  if (probability < 0.6) return "high";
  return "very-high";
}

/**
 * Risk-level metadata for UI display.
 */
export const RISK_LEVEL_CONFIG = {
  low: { label: "Low", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", dotColor: "bg-green-500" },
  moderate: { label: "Moderate", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", dotColor: "bg-yellow-500" },
  high: { label: "High", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400", dotColor: "bg-orange-500" },
  "very-high": { label: "Very High", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", dotColor: "bg-red-500" },
} as const;
