// src/lib/validations/chemical.ts
import { z } from "zod";

export const chemicalApplicationSchema = z.object({
  product_id: z.string().uuid("Select a product"),
  application_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  application_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Invalid time format")
    .optional()
    .nullable(),
  zone_ids: z.array(z.string().uuid()).min(1, "Select at least one zone"),
  hole_numbers: z.array(z.number().int().min(1).max(18)).optional(),
  area_treated_sqft: z.number().int().min(1, "Area must be positive").optional().nullable(),
  application_rate: z
    .string()
    .max(100, "Rate description too long")
    .optional()
    .nullable(),
  total_amount_used: z
    .number()
    .positive("Amount must be positive")
    .optional()
    .nullable(),
  method: z.enum(["spray", "granular", "injection", "drench", "other"]).optional().nullable(),
  weather_temp_f: z
    .number()
    .int()
    .min(-20, "Temperature too low")
    .max(120, "Temperature too high")
    .optional()
    .nullable(),
  weather_wind_mph: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .nullable(),
  weather_wind_direction: z.string().max(10).optional().nullable(),
  weather_humidity: z.number().int().min(0).max(100).optional().nullable(),
  target_pest: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type ChemicalApplicationFormData = z.infer<typeof chemicalApplicationSchema>;

export function validateChemicalApplication(
  data: unknown
): { success: true; data: ChemicalApplicationFormData } | { success: false; errors: Record<string, string> } {
  const result = chemicalApplicationSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    errors[path] = issue.message;
  }

  return { success: false, errors };
}
