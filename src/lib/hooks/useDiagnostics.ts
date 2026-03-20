"use client";

/**
 * Diagnostics SQL Schema
 *
 * CREATE TABLE diagnostics (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
 *   created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
 *   zone_id UUID REFERENCES course_zones(id) ON DELETE SET NULL,
 *   photo_url TEXT NOT NULL,
 *   description TEXT,
 *   category TEXT DEFAULT 'auto',
 *   status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'diagnosed', 'treating', 'resolved', 'monitoring')),
 *   full_response JSONB,
 *   conversation JSONB DEFAULT '[]'::jsonb,
 *   resolution_notes TEXT,
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * -- RLS Policies
 * ALTER TABLE diagnostics ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Users can view diagnostics for their course"
 *   ON diagnostics FOR SELECT
 *   USING (
 *     course_id IN (
 *       SELECT course_id FROM course_members WHERE user_id = auth.uid()
 *     )
 *   );
 *
 * CREATE POLICY "Users can insert diagnostics for their course"
 *   ON diagnostics FOR INSERT
 *   WITH CHECK (
 *     course_id IN (
 *       SELECT course_id FROM course_members WHERE user_id = auth.uid()
 *     )
 *   );
 *
 * CREATE POLICY "Users can update diagnostics for their course"
 *   ON diagnostics FOR UPDATE
 *   USING (
 *     course_id IN (
 *       SELECT course_id FROM course_members WHERE user_id = auth.uid()
 *     )
 *   );
 *
 * -- Indexes
 * CREATE INDEX idx_diagnostics_course_id ON diagnostics(course_id);
 * CREATE INDEX idx_diagnostics_status ON diagnostics(status);
 * CREATE INDEX idx_diagnostics_created_at ON diagnostics(created_at DESC);
 */

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCourse } from "./useCourse";

interface DiagnosisResult {
  diagnosis: {
    condition: string;
    scientific_name?: string;
    confidence: "high" | "medium" | "low";
    confidence_reason: string;
    severity: number;
    severity_label: string;
    category: string;
    description: string;
    differential: string[];
  };
  treatment: {
    immediate_actions: string[];
    products: Array<{
      name: string;
      active_ingredient: string;
      type: string;
      application_rate: string;
      rate_per_acre: string;
      water_volume: string;
      method: string;
      timing: string;
      rei_hours: number;
      precautions: string[];
      in_inventory: boolean;
      alternative_products: string[];
    }>;
    application_window: {
      best_date: string;
      best_time: string;
      ideal_temp_range: string;
      max_wind: string;
      rain_buffer: string;
      avoid: string;
    };
    follow_up: Array<{
      days_after: number;
      action: string;
      what_to_look_for: string;
      if_no_improvement: string;
    }>;
  };
  prevention: string[];
  additional_notes: string;
  lab_test_recommended: boolean;
  extension_contact?: string;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Diagnostic {
  id: string;
  course_id: string;
  created_by: string | null;
  zone_id: string | null;
  photo_url: string;
  description: string | null;
  category: string;
  status: "pending" | "diagnosed" | "treating" | "resolved" | "monitoring";
  full_response: DiagnosisResult | null;
  conversation: ConversationMessage[];
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  zone?: {
    id: string;
    name: string;
    zone_type: string;
    hole_number: number | null;
  };
  created_by_profile?: {
    full_name: string | null;
  };
}

interface DiagnosticsFilters {
  status?: string;
  category?: string;
  zoneId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export function useDiagnostics() {
  const { activeCourse } = useCourse();
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const supabase = createClient();

  // Fetch diagnostics with optional filters
  const fetchDiagnostics = useCallback(
    async (filters?: DiagnosticsFilters) => {
      if (!activeCourse?.id) return;

      setLoading(true);
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = (supabase.from("diagnostics") as any)
          .select(
            `
            *,
            zone:course_zones(id, name, zone_type, hole_number),
            created_by_profile:profiles!diagnostics_created_by_fkey(full_name)
          `
          )
          .eq("course_id", activeCourse.id)
          .order("created_at", { ascending: false });

        if (filters?.status) {
          query = query.eq("status", filters.status);
        }
        if (filters?.category && filters.category !== "all") {
          query = query.eq("category", filters.category);
        }
        if (filters?.zoneId) {
          query = query.eq("zone_id", filters.zoneId);
        }
        if (filters?.startDate) {
          query = query.gte("created_at", filters.startDate);
        }
        if (filters?.endDate) {
          query = query.lte("created_at", filters.endDate);
        }
        // Always apply a limit to prevent loading too many records
        const limit = filters?.limit || 50;
        query = query.limit(limit);

        if (filters?.offset) {
          query = query.range(
            filters.offset,
            filters.offset + limit - 1
          );
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        setDiagnostics((data as unknown as Diagnostic[]) || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch diagnostics";
        setError(message);
        console.error("Error fetching diagnostics:", err);
      } finally {
        setLoading(false);
      }
    },
    [activeCourse?.id, supabase]
  );

  // Fetch a single diagnosis by ID
  const fetchDiagnosis = useCallback(
    async (id: string): Promise<Diagnostic | null> => {
      setLoading(true);
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: fetchError } = await (supabase.from("diagnostics") as any)
          .select(
            `
            *,
            zone:course_zones(id, name, zone_type, hole_number),
            created_by_profile:profiles!diagnostics_created_by_fkey(full_name)
          `
          )
          .eq("id", id)
          .single();

        if (fetchError) throw fetchError;

        return data as unknown as Diagnostic;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch diagnosis";
        setError(message);
        console.error("Error fetching diagnosis:", err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  // Submit a new diagnosis
  const submitDiagnosis = useCallback(
    async (
      imageFile: File,
      description?: string,
      category?: string,
      zoneId?: string
    ): Promise<Diagnostic | null> => {
      if (!activeCourse?.id) {
        setError("No active course selected");
        return null;
      }

      setDiagnosing(true);
      setError(null);

      try {
        // 1. Upload image to Supabase storage
        const fileName = `${activeCourse.id}/${Date.now()}-${imageFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("diagnostics")
          .upload(fileName, imageFile);

        if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("diagnostics")
          .getPublicUrl(fileName);

        const photoUrl = urlData.publicUrl;

        // 2. Convert image to base64 for API
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(imageFile);
        });

        // 3. Call the diagnostics API
        const response = await fetch("/api/diagnostics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: base64,
            description,
            category,
            zoneId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Diagnosis failed");
        }

        const { data: diagnosisResult } = await response.json();

        // 4. Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // 5. Save to diagnostics table
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: record, error: insertError } = await (supabase.from("diagnostics") as any)
          .insert({
            course_id: activeCourse.id,
            created_by: user?.id,
            zone_id: zoneId || null,
            photo_url: photoUrl,
            description,
            category: category || "auto",
            status: "diagnosed",
            full_response: diagnosisResult,
            conversation: [],
          })
          .select(
            `
            *,
            zone:course_zones(id, name, zone_type, hole_number),
            created_by_profile:profiles!diagnostics_created_by_fkey(full_name)
          `
          )
          .single();

        if (insertError) throw insertError;

        // Update local state
        setDiagnostics((prev) => [record as unknown as Diagnostic, ...prev]);

        return record as unknown as Diagnostic;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to submit diagnosis";
        setError(message);
        console.error("Error submitting diagnosis:", err);
        return null;
      } finally {
        setDiagnosing(false);
      }
    },
    [activeCourse?.id, supabase]
  );

  // Ask a follow-up question
  const askFollowUp = useCallback(
    async (
      diagnosticId: string,
      question: string
    ): Promise<ConversationMessage[] | null> => {
      setLoading(true);
      setError(null);

      try {
        // 1. Fetch current diagnostic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: diagnostic, error: fetchError } = await (supabase.from("diagnostics") as any)
          .select("*")
          .eq("id", diagnosticId)
          .single();

        if (fetchError) throw fetchError;

        // 2. Build conversation history
        const existingConversation = (diagnostic.conversation as ConversationMessage[]) || [];
        const conversationHistory = existingConversation.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        // 3. Get image from storage for context
        // We need to refetch to include in API call
        const imageResponse = await fetch(diagnostic.photo_url);
        const imageBlob = await imageResponse.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(imageBlob);
        });

        // 4. Call API with follow-up
        const response = await fetch("/api/diagnostics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: base64,
            zoneId: diagnostic.zone_id,
            conversationHistory,
            followUpQuestion: question,
            originalDiagnosis: diagnostic.full_response,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Follow-up failed");
        }

        const { data: followUpResult } = await response.json();

        // 5. Update conversation in database
        const now = new Date().toISOString();
        const newMessages: ConversationMessage[] = [
          ...existingConversation,
          { role: "user", content: question, timestamp: now },
          {
            role: "assistant",
            content: followUpResult.follow_up_response,
            timestamp: now,
          },
        ];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase.from("diagnostics") as any)
          .update({
            conversation: newMessages,
            updated_at: now,
          })
          .eq("id", diagnosticId);

        if (updateError) throw updateError;

        // Update local state
        setDiagnostics((prev) =>
          prev.map((d) =>
            d.id === diagnosticId
              ? { ...d, conversation: newMessages, updated_at: now }
              : d
          )
        );

        return newMessages;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to ask follow-up";
        setError(message);
        console.error("Error asking follow-up:", err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  // Update diagnosis status
  const updateStatus = useCallback(
    async (
      id: string,
      status: Diagnostic["status"],
      resolutionNotes?: string
    ): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const updateData: { status: string; resolution_notes?: string; updated_at: string } = {
          status,
          updated_at: new Date().toISOString(),
        };

        if (resolutionNotes !== undefined) {
          updateData.resolution_notes = resolutionNotes;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase.from("diagnostics") as any)
          .update(updateData)
          .eq("id", id);

        if (updateError) throw updateError;

        // Update local state
        setDiagnostics((prev) =>
          prev.map((d) =>
            d.id === id
              ? { ...d, status, resolution_notes: resolutionNotes ?? d.resolution_notes }
              : d
          )
        );

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update status";
        setError(message);
        console.error("Error updating status:", err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  // Create a task from diagnosis
  const createTaskFromDiagnosis = useCallback(
    async (diagnosticId: string): Promise<string | null> => {
      if (!activeCourse?.id) {
        setError("No active course selected");
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        // 1. Fetch the diagnosis
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: diagnostic, error: fetchError } = await (supabase.from("diagnostics") as any)
          .select("*, zone:course_zones(name)")
          .eq("id", diagnosticId)
          .single();

        if (fetchError) throw fetchError;

        const result = diagnostic.full_response as DiagnosisResult;
        if (!result?.diagnosis || !result?.treatment) {
          throw new Error("Diagnosis data incomplete");
        }

        // 2. Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // 3. Build task details
        const zoneName = diagnostic.zone?.name || "Course";
        const condition = result.diagnosis.condition;
        const severity = result.diagnosis.severity;

        // Map severity to priority
        const priorityMap: Record<number, string> = {
          1: "low",
          2: "low",
          3: "medium",
          4: "high",
          5: "urgent",
        };
        const priority = priorityMap[severity] || "medium";

        // Build description from treatment
        let description = `**Condition:** ${condition}\n`;
        description += `**Severity:** ${result.diagnosis.severity_label} (${severity}/5)\n\n`;
        description += `**Immediate Actions:**\n`;
        result.treatment.immediate_actions.forEach((action, i) => {
          description += `${i + 1}. ${action}\n`;
        });

        if (result.treatment.products.length > 0) {
          description += `\n**Products Needed:**\n`;
          result.treatment.products.forEach((product) => {
            description += `- ${product.name} (${product.application_rate})\n`;
          });
        }

        description += `\n**Application Window:** ${result.treatment.application_window.best_date} at ${result.treatment.application_window.best_time}`;
        description += `\n\n*Created from Course Doctor diagnosis*`;

        // 4. Create the task
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: task, error: taskError } = await (supabase.from("tasks") as any)
          .insert({
            course_id: activeCourse.id,
            title: `Treat ${condition} - ${zoneName}`,
            description,
            priority,
            status: "pending",
            category: "treatment",
            zone_id: diagnostic.zone_id,
            created_by: user?.id,
            due_date: result.treatment.application_window.best_date || null,
          })
          .select()
          .single();

        if (taskError) throw taskError;

        // 5. Update diagnostic to link to task and set to treating
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("diagnostics") as any)
          .update({
            status: "treating",
            updated_at: new Date().toISOString(),
          })
          .eq("id", diagnosticId);

        // Update local state
        setDiagnostics((prev) =>
          prev.map((d) =>
            d.id === diagnosticId ? { ...d, status: "treating" } : d
          )
        );

        return task.id;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create task";
        setError(message);
        console.error("Error creating task from diagnosis:", err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [activeCourse?.id, supabase]
  );

  // Get count of active diagnoses
  const getActiveDiagnosesCount = useCallback(async (): Promise<number> => {
    if (!activeCourse?.id) return 0;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase.from("diagnostics") as any)
        .select("*", { count: "exact", head: true })
        .eq("course_id", activeCourse.id)
        .in("status", ["diagnosed", "treating", "monitoring"]);

      if (error) throw error;

      return count || 0;
    } catch (err) {
      console.error("Error getting active diagnoses count:", err);
      return 0;
    }
  }, [activeCourse?.id, supabase]);

  return {
    diagnostics,
    loading,
    error,
    diagnosing,
    fetchDiagnostics,
    fetchDiagnosis,
    submitDiagnosis,
    askFollowUp,
    updateStatus,
    createTaskFromDiagnosis,
    getActiveDiagnosesCount,
  };
}
