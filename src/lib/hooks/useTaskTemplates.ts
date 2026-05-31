"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type {
  TaskTemplate,
  TaskCategory,
  TaskPriority,
} from "@/types/database";

export interface CreateTemplateData {
  name: string;
  description?: string | null;
  category: TaskCategory;
  default_priority: TaskPriority;
  estimated_minutes?: number | null;
  equipment_needed?: string[];
  materials_needed?: TaskTemplate["materials_needed"];
  checklist?: TaskTemplate["checklist"];
  requires_photo_before?: boolean;
  requires_photo_after?: boolean;
  weather_dependent?: boolean;
  weather_conditions?: TaskTemplate["weather_conditions"];
  instructions?: string | null;
}

export interface UpdateTemplateData extends Partial<CreateTemplateData> {
  is_active?: boolean;
}

export interface CreateTaskFromTemplateOverrides {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  assigned_to?: string | null;
  assigned_crew?: string | null;
  due_date: string;
  due_time?: string | null;
  zone_id?: string | null;
  hole_numbers?: number[];
  notes?: string | null;
}

interface UseTaskTemplatesReturn {
  templates: TaskTemplate[];
  loading: boolean;
  error: string | null;
  fetchTemplates: (category?: TaskCategory) => Promise<void>;
  getTemplate: (id: string) => Promise<TaskTemplate | null>;
  createTemplate: (data: CreateTemplateData) => Promise<TaskTemplate | null>;
  updateTemplate: (id: string, data: UpdateTemplateData) => Promise<TaskTemplate | null>;
  deleteTemplate: (id: string) => Promise<boolean>;
  createTaskFromTemplate: (
    templateId: string,
    overrides: CreateTaskFromTemplateOverrides
  ) => Promise<{ id: string } | null>;
}

export function useTaskTemplates(): UseTaskTemplatesReturn {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { profile } = useAuth();

  const supabase = createClient();

  // Fetch all active templates, optionally filtered by category
  const fetchTemplates = useCallback(
    async (category?: TaskCategory) => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from("task_templates")
          .select("*")
          .eq("is_active", true)
          .order("category", { ascending: true })
          .order("name", { ascending: true });

        if (category) {
          query = query.eq("category", category);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error("Error fetching templates:", fetchError);
          setError(fetchError.message);
          return;
        }

        setTemplates((data as TaskTemplate[]) || []);
      } catch (err) {
        console.error("Unexpected error fetching templates:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  // Get a single template by ID
  const getTemplate = useCallback(
    async (id: string): Promise<TaskTemplate | null> => {
      try {
        const { data, error: fetchError } = await supabase
          .from("task_templates")
          .select("*")
          .eq("id", id)
          .single();

        if (fetchError) {
          console.error("Error fetching template:", fetchError);
          return null;
        }

        return data as TaskTemplate;
      } catch (err) {
        console.error("Unexpected error fetching template:", err);
        return null;
      }
    },
    [supabase]
  );

  // Create a new template
  const createTemplate = useCallback(
    async (data: CreateTemplateData): Promise<TaskTemplate | null> => {
      if (!profile) {
        setError("You must be logged in to create templates");
        return null;
      }

      try {
        const insertData = {
          name: data.name,
          description: data.description ?? null,
          category: data.category,
          default_priority: data.default_priority,
          estimated_minutes: data.estimated_minutes ?? null,
          equipment_needed: data.equipment_needed ?? [],
          materials_needed: data.materials_needed ?? [],
          checklist: data.checklist ?? [],
          requires_photo_before: data.requires_photo_before ?? false,
          requires_photo_after: data.requires_photo_after ?? false,
          weather_dependent: data.weather_dependent ?? false,
          weather_conditions: data.weather_conditions ?? null,
          instructions: data.instructions ?? null,
          created_by: profile.id,
          is_active: true,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newTemplate, error: insertError } = await (supabase as any)
          .from("task_templates")
          .insert(insertData)
          .select()
          .single() as { data: TaskTemplate | null; error: Error | null };

        if (insertError || !newTemplate) {
          console.error("Error creating template:", insertError);
          setError(insertError?.message || "Failed to create template");
          return null;
        }

        // Add to local state
        setTemplates((prev) => [...prev, newTemplate]);

        return newTemplate;
      } catch (err) {
        console.error("Unexpected error creating template:", err);
        setError("Failed to create template");
        return null;
      }
    },
    [profile, supabase]
  );

  // Update a template
  const updateTemplate = useCallback(
    async (id: string, data: UpdateTemplateData): Promise<TaskTemplate | null> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updated, error: updateError } = await (supabase as any)
          .from("task_templates")
          .update(data)
          .eq("id", id)
          .select()
          .single() as { data: TaskTemplate | null; error: Error | null };

        if (updateError) {
          console.error("Error updating template:", updateError);
          setError(updateError.message);
          return null;
        }

        // Update local state
        if (updated) {
          setTemplates((prev) =>
            prev.map((t) => (t.id === id ? updated : t))
          );
        }

        return updated;
      } catch (err) {
        console.error("Unexpected error updating template:", err);
        setError("Failed to update template");
        return null;
      }
    },
    [supabase]
  );

  // Delete (soft delete by setting is_active = false)
  const deleteTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("task_templates")
          .update({ is_active: false })
          .eq("id", id) as { error: Error | null };

        if (updateError) {
          console.error("Error deleting template:", updateError);
          setError(updateError.message);
          return false;
        }

        // Remove from local state
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        return true;
      } catch (err) {
        console.error("Unexpected error deleting template:", err);
        setError("Failed to delete template");
        return false;
      }
    },
    [supabase]
  );

  // Create a new task from a template
  const createTaskFromTemplate = useCallback(
    async (
      templateId: string,
      overrides: CreateTaskFromTemplateOverrides
    ): Promise<{ id: string } | null> => {
      if (!profile) {
        setError("You must be logged in to create tasks");
        return null;
      }

      try {
        // Fetch the template
        const template = await getTemplate(templateId);
        if (!template) {
          setError("Template not found");
          return null;
        }

        // Create the task with template data + overrides
        const taskData = {
          title: overrides.title || template.name,
          description: overrides.description ?? template.description,
          category: template.category,
          priority: overrides.priority || template.default_priority,
          status: "pending",
          assigned_to: overrides.assigned_to ?? null,
          assigned_crew: overrides.assigned_crew ?? null,
          assigned_by: profile.id,
          due_date: overrides.due_date,
          due_time: overrides.due_time ?? null,
          estimated_minutes: template.estimated_minutes,
          zone_id: overrides.zone_id ?? null,
          hole_numbers: overrides.hole_numbers ?? [],
          equipment_needed: template.equipment_needed,
          materials_needed: template.materials_needed,
          checklist: template.checklist.map((item) => ({
            ...item,
            checked: false, // Reset all checklist items
          })),
          requires_photo_before: template.requires_photo_before,
          requires_photo_after: template.requires_photo_after,
          weather_dependent: template.weather_dependent,
          weather_conditions: template.weather_conditions,
          recurring_rule: null,
          template_id: templateId,
          plan_goal_id: null,
          parent_task_id: null,
          notes: overrides.notes ?? null,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newTask, error: insertError } = await (supabase as any)
          .from("tasks")
          .insert(taskData)
          .select("id")
          .single() as { data: { id: string } | null; error: Error | null };

        if (insertError || !newTask) {
          console.error("Error creating task from template:", insertError);
          setError(insertError?.message || "Failed to create task");
          return null;
        }

        return { id: newTask.id };
      } catch (err) {
        console.error("Unexpected error creating task from template:", err);
        setError("Failed to create task from template");
        return null;
      }
    },
    [profile, supabase, getTemplate]
  );

  // Initial fetch
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    error,
    fetchTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    createTaskFromTemplate,
  };
}
