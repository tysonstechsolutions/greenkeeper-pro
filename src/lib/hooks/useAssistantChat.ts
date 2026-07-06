"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { uploadPhoto } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/client";
import { callApi } from "@/lib/api/client";
import type { WorkspaceKey } from "@/lib/layout/workspace-map";

// Shared chat state machine for the AI assistant. Drives both the
// top-of-screen AssistantBar (inline, stay-on-page) and the full
// /assistant page — one conversation store (ai_conversations/ai_messages),
// two surfaces.

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  error?: boolean;
  timestamp: Date;
}

export interface PendingPhoto {
  file: File;
  previewUrl: string;
}

/**
 * @param workspace Workspace the chat is scoped to (from the current route or
 *   the page's ?ws= param). Read at send time, so it can change as the user
 *   navigates while the hook stays mounted.
 */
export function useAssistantChat(workspace: WorkspaceKey | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Refs so the sendMessage callback always sees current values without
  // needing them in its dependency list.
  const messagesRef = useRef<AssistantMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const workspaceRef = useRef<WorkspaceKey | null>(workspace);
  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const conversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const loadingRef = useRef(false);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const pendingPhotoRef = useRef<PendingPhoto | null>(null);
  useEffect(() => {
    pendingPhotoRef.current = pendingPhoto;
  }, [pendingPhoto]);

  // Stop-generating support
  const abortControllerRef = useRef<AbortController | null>(null);

  // Set when the user clears the chat and no new exchange has started yet.
  // Blocks loadRecentConversation from resurrecting the cleared conversation
  // on the next panel-open.
  const clearedRef = useRef(false);

  // Clean up the photo preview URL on unmount
  useEffect(() => {
    return () => {
      if (pendingPhotoRef.current?.previewUrl) {
        URL.revokeObjectURL(pendingPhotoRef.current.previewUrl);
      }
    };
  }, []);

  // Load the most recent conversation from the last 24h so the chat picks up
  // where it left off (shared between the bar and the full page). Only fills
  // an EMPTY chat — never replaces local messages, which may hold exchanges
  // the store doesn't have (a failed send is displayed but never persisted).
  const loadRecentConversation = useCallback(async () => {
    if (!user?.id || loadingRef.current) return;
    if (clearedRef.current || messagesRef.current.length > 0) return;
    const supabase = createClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: conv } = await supabase
      .from("ai_conversations")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conv) return;

    const { data: rows } = await supabase
      .from("ai_messages")
      .select("id, role, content, error, image_url, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });

    // Don't clobber anything that happened while we were fetching (a send
    // that started, or a clear).
    if (loadingRef.current || clearedRef.current) return;
    if (messagesRef.current.length > 0) return;
    if (rows && rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loaded: AssistantMessage[] = rows.map((r: any) => ({
        id: r.id,
        role: r.role as "user" | "assistant",
        content: r.content,
        error: r.error || false,
        imageUrl: r.image_url || undefined,
        timestamp: new Date(r.created_at),
      }));
      setMessages(loaded);
      setConversationId(conv.id);
    }
  }, [user?.id]);

  useEffect(() => {
    loadRecentConversation();
  }, [loadRecentConversation]);

  /** Attach a photo (validated); replaces any existing pending photo. */
  const selectPhoto = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 20 * 1024 * 1024) return; // 20MB max

    // Side effects stay OUTSIDE the setState updater (updaters must be pure —
    // StrictMode double-invokes them).
    const prev = pendingPhotoRef.current;
    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
    setPendingPhoto({ file, previewUrl: URL.createObjectURL(file) });
  }, []);

  const clearPendingPhoto = useCallback(() => {
    const prev = pendingPhotoRef.current;
    if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
    setPendingPhoto(null);
  }, []);

  /**
   * Persist one user/assistant exchange, creating the conversation on the
   * first exchange. Errors are logged, never thrown — persistence is
   * best-effort.
   */
  const persistExchange = useCallback(
    async (userContent: string, assistantContent: string, photoPublicUrl?: string) => {
      if (!user?.id) return;
      const supabase = createClient();
      try {
        let convId = conversationIdRef.current;
        if (!convId) {
          const title = userContent.slice(0, 50);
          const { data: conv } = await supabase
            .from("ai_conversations")
            .insert({ user_id: user.id, title })
            .select("id")
            .single();
          if (!conv) return;
          convId = conv.id as string;
          setConversationId(convId);
        } else {
          // Touch updated_at so the 24h "recent conversation" window slides.
          await supabase
            .from("ai_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", convId);
        }
        await supabase.from("ai_messages").insert([
          {
            conversation_id: convId,
            role: "user",
            content: userContent,
            image_url: photoPublicUrl || null,
          },
          {
            conversation_id: convId,
            role: "assistant",
            content: assistantContent,
          },
        ]);
      } catch (err) {
        console.error("Failed to persist conversation:", err);
      }
    },
    [user?.id],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const photo = pendingPhotoRef.current;
      const trimmed = text.trim();
      if ((!trimmed && !photo) || loadingRef.current) return;

      let photoStoragePath: string | undefined;
      let photoPublicUrl: string | undefined;

      // Mark busy immediately so a double-send can't slip through while the
      // photo uploads, and create the AbortController up front so the Stop
      // button already works during the upload phase (the abort is honored
      // right after the upload settles, before anything reaches the AI).
      setLoading(true);
      loadingRef.current = true;
      clearedRef.current = false; // a new exchange supersedes a prior Clear
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      // Upload photo first if attached
      if (photo && user?.id) {
        setUploading(true);
        try {
          const result = await uploadPhoto(photo.file, user.id);
          photoStoragePath = result.storagePath;
          photoPublicUrl = result.publicUrl;
        } catch (err) {
          console.error("Photo upload failed:", err);
          // Continue without photo — don't block the message
        }
        setUploading(false);
      }

      const displayText = trimmed || "(Photo attached)";
      // The sent bubble prefers the durable storage URL so the blob preview
      // can be revoked instead of leaking for the session's lifetime.
      const userMsg: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: displayText,
        imageUrl: photoPublicUrl ?? photo?.previewUrl,
        timestamp: new Date(),
      };

      // Build history from PRIOR messages only (skip errors).
      const history = messagesRef.current
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMsg]);
      setPendingPhoto(null);
      if (photo && photoPublicUrl) URL.revokeObjectURL(photo.previewUrl);

      // Placeholder assistant message we'll fill in.
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", timestamp: new Date() },
      ]);

      let finalAssistantContent = "";

      const appendToAssistant = (delta: string) => {
        finalAssistantContent += delta;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m,
          ),
        );
      };

      const replaceAssistantWithError = (content: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content, error: true, timestamp: new Date() }
              : m,
          ),
        );
      };

      try {
        let messageForApi = trimmed;
        if (photoStoragePath) {
          messageForApi = trimmed
            ? `${trimmed}\n\n[Photo attached: ${photoStoragePath}]`
            : `[Photo attached: ${photoStoragePath}]`;
        }

        setToolActivity("Thinking…");

        // Abort path: wire the AbortController to a rejection we can catch.
        // If Stop was already tapped (during the photo upload), reject
        // immediately — the "abort" event has fired and won't fire again.
        const abortPromise = new Promise<never>((_, reject) => {
          if (controller.signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          controller.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });

        const reply = await Promise.race([
          callApi<{ reply?: string; error?: string }>("ai-assistant", {
            method: "POST",
            body: {
              message: messageForApi,
              history,
              photoStoragePath: photoStoragePath || undefined,
              photoPublicUrl: photoPublicUrl || undefined,
              workspace: workspaceRef.current || undefined,
            },
          }),
          abortPromise,
        ]);

        setToolActivity(null);

        const replyText = typeof reply?.reply === "string" ? reply.reply : "";
        if (!replyText) {
          replaceAssistantWithError(
            reply?.error || "I wasn't able to generate a response. Please try again.",
          );
          return;
        }

        appendToAssistant(replyText);
        await persistExchange(displayText, finalAssistantContent, photoPublicUrl);
      } catch (err: unknown) {
        setToolActivity(null);
        // If the user clicked Stop or the timeout fired, don't show an error.
        if (err instanceof DOMException && err.name === "AbortError") {
          if (finalAssistantContent) {
            appendToAssistant(" _(stopped)_");
            await persistExchange(displayText, finalAssistantContent, photoPublicUrl);
          } else {
            replaceAssistantWithError("Response was stopped.");
          }
        } else {
          console.error("Assistant error:", err);
          replaceAssistantWithError(
            "Network error — check your connection and try again.",
          );
        }
      } finally {
        clearTimeout(timeoutId);
        abortControllerRef.current = null;
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [user?.id, persistExchange],
  );

  const stopGenerating = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    clearedRef.current = true;
    setMessages([]);
    setConversationId(null);
    clearPendingPhoto();
  }, [clearPendingPhoto]);

  return {
    messages,
    loading,
    uploading,
    toolActivity,
    pendingPhoto,
    sendMessage,
    stopGenerating,
    clearChat,
    selectPhoto,
    clearPendingPhoto,
    loadRecentConversation,
  };
}
