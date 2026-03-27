// src/lib/validations/task.ts
import { z } from "zod";

export const taskSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must be less than 100 characters"),
  description: z.string().max(1000, "Description too long").optional().nullable(),
  category: z.enum([
    "mowing",
    "irrigation",
    "chemical",
    "mechanical",
    "landscaping",
    "construction",
    "bunker",
    "greens",
    "admin",
    "safety",
    "other",
    "pro_shop",
    "events",
    "customer_service",
  ]),
  priority: z.enum(["critical", "high", "normal", "low"]),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  due_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Invalid time format")
    .optional()
    .nullable(),
  assigned_to: z.string().uuid("Invalid user ID").optional().nullable(),
  assigned_crew: z.string().max(50).optional().nullable(),
  zone_id: z.string().uuid("Invalid zone ID").optional().nullable(),
  estimated_minutes: z.number().int().min(1).max(1440).optional().nullable(),
  equipment_needed: z.array(z.string()).default([]),
  requires_photo_before: z.boolean().default(false),
  requires_photo_after: z.boolean().default(false),
  weather_dependent: z.boolean().default(false),
  notes: z.string().max(2000).optional().nullable(),
});

export type TaskFormData = z.infer<typeof taskSchema>;

export function validateTask(data: unknown): { success: true; data: TaskFormData } | { success: false; errors: Record<string, string> } {
  const result = taskSchema.safeParse(data);

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
