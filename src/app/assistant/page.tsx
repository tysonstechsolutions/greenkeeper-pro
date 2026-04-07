"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  Send,
  Loader2,
  User,
  Sparkles,
  Trash2,
  RotateCcw,
  AlertCircle,
  Camera,
  X,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  error?: boolean;
  rawContent?: unknown;
  imagePreview?: string;
}

const EXAMPLE_PROMPTS = [
  "What equipment do we have and what needs service?",
  "What's the weather look like? Good day to spray?",
  "Show me all pending tasks for this week",
  "What's our chemical inventory looking like?",
  "Create a task to aerate greens on holes 1-9 tomorrow",
  "How much have we spent this month?",
  "Show me the staff schedule for this week",
  "Add an observation: bunker sand is thin on hole 7",
  "Give me a summary of recent golfer feedback",
  "What time-off requests are pending?",
];

export default function AssistantPage() {
  const pathname = usePathname();
  const { profile, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) return; // 10MB max

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPendingImage(base64);
      setPendingImagePreview(base64);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearPendingImage = () => {
    setPendingImage(null);
    setPendingImagePreview(null);
  };

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if ((!text && !pendingImage) || isLoading) return;

    const finalText = text || (pendingImage ? "Analyze this photo" : "");
    setInput("");
    setError(null);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: finalText,
      timestamp: new Date(),
      imagePreview: pendingImagePreview || undefined,
    };

    const imageToSend = pendingImage;
    clearPendingImage();

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const apiMessages = [...messages, userMessage].map((msg) => {
        if (msg.role === "assistant" && msg.rawContent) {
          return { role: "assistant" as const, content: msg.rawContent };
        }
        return { role: msg.role as "user" | "assistant", content: msg.content };
      });

      // 90-second timeout — AI tool-use loops can take a while
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);

      let res: Response;
      try {
        res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            currentPage: pathname,
            imageData: imageToSend || undefined,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errData.error || `Error ${res.status}`);
      }

      const data = await res.json();

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        rawContent: data.rawContent,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      const errMsg = isTimeout
        ? "The request timed out. Try a simpler question or try again."
        : err instanceof Error ? err.message : "Something went wrong";
      setError(errMsg);

      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Sorry, I ran into an issue: ${errMsg}`,
        timestamp: new Date(),
        error: true,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    clearPendingImage();
  };

  const retryLast = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      setMessages((prev) => {
        const newMsgs = [...prev];
        if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === "assistant") {
          newMsgs.pop();
        }
        if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === "user") {
          newMsgs.pop();
        }
        return newMsgs;
      });
      sendMessage(lastUserMsg.content);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] max-w-4xl mx-auto">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleImageSelect}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-green-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">VMGC AI</h1>
            <p className="text-xs text-muted-foreground">
              Ask me anything, attach photos for diagnosis
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="gap-1.5 text-xs">
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-1">VMGC AI Assistant</h2>
            <p className="text-sm text-muted-foreground text-center mb-2">
              I can manage equipment, tasks, staff, expenses, chemicals, and more. I know the current weather and can analyze photos of turf problems.
            </p>
            <p className="text-xs text-muted-foreground text-center mb-6">
              Tap the camera icon to snap a photo for instant diagnosis.
            </p>

            <div className="w-full space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Try asking...
              </p>
              <div className="grid gap-2">
                {EXAMPLE_PROMPTS.slice(0, 6).map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    className="text-left px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-colors text-sm text-muted-foreground hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${
                    msg.error
                      ? "bg-destructive/10"
                      : "bg-gradient-to-br from-primary to-green-600"
                  }`}>
                    {msg.error ? (
                      <AlertCircle className="w-4 h-4 text-destructive" />
                    ) : (
                      <Bot className="w-4 h-4 text-white" />
                    )}
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : msg.error
                      ? "bg-destructive/10 border border-destructive/20 rounded-bl-md"
                      : "bg-muted/60 border border-border/50 rounded-bl-md"
                  }`}
                >
                  {/* Image thumbnail */}
                  {msg.imagePreview && (
                    <div className="mb-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.imagePreview}
                        alt="Attached photo"
                        className="max-w-[240px] rounded-lg"
                      />
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  <div
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
                  </div>
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full shrink-0 bg-foreground/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-foreground/70" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-br from-primary to-green-600 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-muted/60 border border-border/50 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            {!isLoading && messages.length > 0 && messages[messages.length - 1].error && (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={retryLast} className="gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry
                </Button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Pending image preview */}
      {pendingImagePreview && (
        <div className="px-4 py-2 border-t border-border/50">
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImagePreview}
              alt="Pending upload"
              className="h-20 rounded-lg border border-border"
            />
            <button
              onClick={clearPendingImage}
              className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-white rounded-full flex items-center justify-center"
              aria-label="Remove image"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Photo attached — add details or just hit send
          </p>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          {/* Camera button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="h-11 w-11 rounded-xl shrink-0"
            title="Attach a photo for diagnosis"
          >
            <Camera className="w-5 h-5" />
          </Button>

          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={pendingImage ? "Describe what you see (optional)..." : "Ask anything or tell me what to do..."}
              rows={1}
              disabled={isLoading}
              className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 pr-12 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 placeholder:text-muted-foreground/60"
              style={{ maxHeight: "150px" }}
            />
          </div>
          <Button
            onClick={() => sendMessage()}
            disabled={(!input.trim() && !pendingImage) || isLoading}
            size="icon"
            className="h-11 w-11 rounded-xl shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
