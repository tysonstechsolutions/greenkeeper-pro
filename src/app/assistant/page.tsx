"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  Send,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  RotateCcw,
  Camera,
  X,
  Image as ImageIcon,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { uploadPhoto } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/client";
import { callApi } from "@/lib/api/client";
import ReactMarkdown from "react-markdown";

// ── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  error?: boolean;
  timestamp: Date;
}

// ── Example prompts ─────────────────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
  "What's going on today?",
  "Give me a morning briefing",
  "Sprinkler head broken on #7 green, get that fixed",
  "We need to order more bunker sand",
  "What tasks are due today?",
  "Any fungus or disease we're tracking on the course?",
  "How many FY26 assets are MIA?",
  "Pothole on the cart path between 3 and 4",
  "Mark the mowing on #1-9 as done",
  "Show me equipment that needs service",
  "Add reel blades for triplex #2 to the order list",
  "The triplex is making a weird noise, flag it for service",
  "Who is working today?",
  "Bathroom in the clubhouse needs cleaning",
  "What's on the order list right now?",
  "Any dry spots reported this week?",
];

function getRandomPrompts(count: number): string[] {
  const shuffled = [...EXAMPLE_PROMPTS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// ── Component ───────────────────────────────────────────────────────────────

export default function AssistantPage() {
  const { profile, user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [examples] = useState(() => getRandomPrompts(4));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stop-generating support
  const abortControllerRef = useRef<AbortController | null>(null);

  // Conversation persistence
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  // Keep ref in sync so sendMessage callback always has latest value
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Photo attachment state
  const [pendingPhoto, setPendingPhoto] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toolActivity, setToolActivity] = useState<string | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (pendingPhoto?.previewUrl) {
        URL.revokeObjectURL(pendingPhoto.previewUrl);
      }
    };
  }, [pendingPhoto]);

  // Load most recent conversation from last 24h on mount
  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: conv } = await supabase
        .from("ai_conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
      if (!conv) return;

      const { data: rows } = await supabase
        .from("ai_messages")
        .select("id, role, content, error, image_url, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });

      if (rows && rows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loaded: Message[] = rows.map((r: any) => ({
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
    })();
  }, [user?.id]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  // Handle photo selection
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) return;
    if (file.size > 20 * 1024 * 1024) return; // 20MB max

    // Clean up previous preview
    if (pendingPhoto?.previewUrl) {
      URL.revokeObjectURL(pendingPhoto.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingPhoto({ file, previewUrl });

    // Reset file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearPendingPhoto = () => {
    if (pendingPhoto?.previewUrl) {
      URL.revokeObjectURL(pendingPhoto.previewUrl);
    }
    setPendingPhoto(null);
  };

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if ((!trimmed && !pendingPhoto) || loading) return;

      let photoStoragePath: string | undefined;
      let photoPublicUrl: string | undefined;

      // Upload photo first if attached
      if (pendingPhoto && user?.id) {
        setUploading(true);
        try {
          const result = await uploadPhoto(pendingPhoto.file, user.id);
          photoStoragePath = result.storagePath;
          photoPublicUrl = result.publicUrl;
        } catch (err) {
          console.error("Photo upload failed:", err);
          // Continue without photo — don't block the message
        }
        setUploading(false);
      }

      const displayText = trimmed || "(Photo attached)";
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: displayText,
        imageUrl: pendingPhoto?.previewUrl,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setPendingPhoto(null);
      setLoading(true);

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }

      // Create AbortController for this request
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Set a 120s timeout that aborts automatically
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 120000);

      // Create a placeholder assistant message that we'll stream into.
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
        },
      ]);

      // Track streamed content for persistence
      let finalAssistantContent = "";

      // Helper: append text to the streaming assistant message.
      const appendToAssistant = (delta: string) => {
        finalAssistantContent += delta;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m
          )
        );
      };

      // Helper: replace the assistant message with an error body.
      const replaceAssistantWithError = (content: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content, error: true, timestamp: new Date() }
              : m
          )
        );
      };

      try {
        // Build history from PRIOR messages only (skip the empty placeholder + errors).
        const history = messages
          .filter((m) => !m.error)
          .map((m) => ({ role: m.role, content: m.content }));

        // Build the message with photo context
        let messageForApi = trimmed;
        if (photoStoragePath) {
          messageForApi = trimmed
            ? `${trimmed}\n\n[Photo attached: ${photoStoragePath}]`
            : `[Photo attached: ${photoStoragePath}]`;
        }

        setToolActivity("Thinking…");

        // Abort path: wire the AbortController to a rejection we can catch below.
        const abortPromise = new Promise<never>((_, reject) => {
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
            },
          }),
          abortPromise,
        ]);

        setToolActivity(null);

        const text = typeof reply?.reply === "string" ? reply.reply : "";
        if (!text) {
          replaceAssistantWithError(
            reply?.error || "I wasn't able to generate a response. Please try again.",
          );
          return;
        }

        appendToAssistant(text);
        const gotAnyText = true;
        void gotAnyText; // retained for the persistence branch below

        // ── Persist to Supabase ──────────────────────────────────────────
        if (gotAnyText && user?.id) {
          const supabase = createClient();
          const currentConvId = conversationIdRef.current;
          try {
            if (!currentConvId) {
              // First exchange: create conversation + save both messages
              const title = displayText.slice(0, 50);
              const { data: conv } = await supabase
                .from("ai_conversations")
                .insert({ user_id: user.id, title })
                .select("id")
                .single();
              if (conv) {
                const newConvId = conv.id as string;
                setConversationId(newConvId);
                await supabase.from("ai_messages").insert([
                  {
                    conversation_id: newConvId,
                    role: "user",
                    content: displayText,
                    image_url: photoPublicUrl || null,
                  },
                  {
                    conversation_id: newConvId,
                    role: "assistant",
                    content: finalAssistantContent,
                  },
                ]);
              }
            } else {
              // Subsequent exchange: append both messages
              await supabase.from("ai_messages").insert([
                {
                  conversation_id: currentConvId,
                  role: "user",
                  content: displayText,
                  image_url: photoPublicUrl || null,
                },
                {
                  conversation_id: currentConvId,
                  role: "assistant",
                  content: finalAssistantContent,
                },
              ]);
              // Touch updated_at on the conversation
              await supabase
                .from("ai_conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", currentConvId);
            }
          } catch (err) {
            console.error("Failed to persist conversation:", err);
          }
        }
      } catch (err: unknown) {
        setToolActivity(null);
        // If user clicked Stop or timeout fired, don't replace with error
        if (err instanceof DOMException && err.name === "AbortError") {
          if (finalAssistantContent) {
            appendToAssistant(" _(stopped)_");
            // Persist the partial response
            if (user?.id) {
              const supabase = createClient();
              const currentConvId = conversationIdRef.current;
              const stoppedContent = finalAssistantContent; // already includes everything before _(stopped)_
              try {
                if (!currentConvId) {
                  const title = displayText.slice(0, 50);
                  const { data: conv } = await supabase
                    .from("ai_conversations")
                    .insert({ user_id: user.id, title })
                    .select("id")
                    .single();
                  if (conv) {
                    const newConvId = conv.id as string;
                    setConversationId(newConvId);
                    await supabase.from("ai_messages").insert([
                      {
                        conversation_id: newConvId,
                        role: "user",
                        content: displayText,
                        image_url: photoPublicUrl || null,
                      },
                      {
                        conversation_id: newConvId,
                        role: "assistant",
                        content: stoppedContent + " _(stopped)_",
                      },
                    ]);
                  }
                } else {
                  await supabase.from("ai_messages").insert([
                    {
                      conversation_id: currentConvId,
                      role: "user",
                      content: displayText,
                      image_url: photoPublicUrl || null,
                    },
                    {
                      conversation_id: currentConvId,
                      role: "assistant",
                      content: stoppedContent + " _(stopped)_",
                    },
                  ]);
                  await supabase
                    .from("ai_conversations")
                    .update({ updated_at: new Date().toISOString() })
                    .eq("id", currentConvId);
                }
              } catch (persistErr) {
                console.error("Failed to persist stopped conversation:", persistErr);
              }
            }
          } else {
            replaceAssistantWithError("Response was stopped.");
          }
        } else {
          console.error("Assistant stream error:", err);
          replaceAssistantWithError("Network error — check your connection and try again.");
        }
      } finally {
        clearTimeout(timeoutId);
        abortControllerRef.current = null;
        setLoading(false);
      }
    },
    [loading, messages, pendingPhoto, user?.id]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const clearChat = () => {
    setMessages([]);
    setConversationId(null);
    clearPendingPhoto();
  };

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "foreman" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  if (!isAllowed) {
    return (
      <div className="p-4 pb-24 max-w-2xl mx-auto text-center">
        <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <h1 className="text-xl font-bold mb-2">Access Restricted</h1>
        <p className="text-muted-foreground">
          The AI assistant is available to superintendents, assistant
          superintendents, foremen, and directors.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <Link
          href="/more"
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-muted/50 hover:bg-muted transition-colors md:hidden"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="font-semibold">GreenKeeper AI</h1>
          <p className="text-xs text-muted-foreground">
            Tell me what needs to happen and I&apos;ll do it
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-violet-500" />
            </div>
            <h2 className="text-lg font-semibold mb-1">
              Hi{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
              Tell me what needs to happen — I can create tasks, add to the
              order list, report issues, update equipment, and look up anything.
              Attach a photo with the 📷 button.
            </p>

            {/* Example prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              {examples.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="text-left p-3 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/20 active:scale-[0.98] transition-all text-sm"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  msg.error
                    ? "bg-red-500/10"
                    : "bg-gradient-to-br from-violet-500 to-purple-600"
                }`}
              >
                {msg.error ? (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : msg.error
                    ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400"
                    : "bg-card border border-border"
              }`}
            >
              {/* User photo attachment */}
              {msg.imageUrl && (
                <div className="mb-2 rounded-lg overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={msg.imageUrl}
                    alt="Attached photo"
                    className="max-h-48 w-auto rounded-lg"
                  />
                </div>
              )}

              {msg.role === "assistant" && !msg.error ? (
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ul]:pl-4 [&>ol]:mb-2 [&>ol]:pl-4 [&>li]:mb-0.5">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
              <p
                className={`text-[10px] mt-1.5 ${
                  msg.role === "user"
                    ? "text-primary-foreground/60"
                    : "text-muted-foreground"
                }`}
              >
                {msg.timestamp.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}

        {/*
         * Activity indicator — shown only before the first token has streamed,
         * or while a tool is actively running. Once text is flowing the
         * streaming message bubble itself is the visual signal.
         */}
        {(() => {
          if (!loading && !uploading) return null;
          const last = messages[messages.length - 1];
          const streamingHasText =
            last?.role === "assistant" && !last.error && last.content.length > 0;

          // If pure text is streaming and no tool is running, the bubble shows progress.
          if (streamingHasText && !toolActivity && !uploading) return null;

          const label = uploading
            ? "Uploading photo..."
            : toolActivity
              ? `${toolActivity}...`
              : "Thinking...";

          return (
            <div className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-card border border-border rounded-2xl px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                  <span className="text-sm text-muted-foreground">{label}</span>
                </div>
              </div>
            </div>
          );
        })()}

        <div ref={messagesEndRef} />
      </div>

      {/* Photo preview strip */}
      {pendingPhoto && (
        <div className="border-t border-border/50 px-4 pt-3">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-muted/50 border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingPhoto.previewUrl}
              alt="Photo to attach"
              className="w-14 h-14 rounded-lg object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                Photo attached
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {pendingPhoto.file.name}
              </p>
            </div>
            <button
              onClick={clearPendingPhoto}
              className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center shrink-0 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border/50 p-4 pb-24 md:pb-4">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoSelect}
          className="hidden"
        />

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          {/* Camera button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-11 h-11 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted/50 active:scale-95 transition-all disabled:opacity-50 shrink-0"
            aria-label="Attach photo"
          >
            <Camera className="w-5 h-5 text-muted-foreground" />
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={pendingPhoto ? "Add a note about the photo..." : "Tell me what needs to happen..."}
            rows={1}
            disabled={loading}
            className="flex-1 resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/50"
          />
          {loading ? (
            <button
              type="button"
              onClick={handleStop}
              className="w-11 h-11 rounded-xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 active:scale-95 transition-all shrink-0"
              aria-label="Stop generating"
            >
              <Square className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() && !pendingPhoto}
              className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </form>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
          Tap 📷 to attach a photo — it&apos;ll be saved with any task or issue I create
        </p>
      </div>
    </div>
  );
}
