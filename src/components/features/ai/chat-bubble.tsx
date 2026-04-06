"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  Send,
  Loader2,
  X,
  Maximize2,
  Sparkles,
  AlertCircle,
} from "lucide-react";

interface BubbleMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  rawContent?: unknown;
}

export function ChatBubble() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<BubbleMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Don't show bubble on the full assistant page or login
  if (pathname === "/assistant" || pathname === "/login" || pathname?.startsWith("/join") || pathname?.startsWith("/invite")) {
    return null;
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;

    setInput("");

    const userMsg: BubbleMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const apiMessages = [...messages, userMsg].map((m) => {
        if (m.role === "assistant" && m.rawContent) {
          return { role: "assistant" as const, content: m.rawContent };
        }
        return { role: m.role as "user" | "assistant", content: m.content };
      });

      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errData.error || `Error ${res.status}`);
      }

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.response,
          rawContent: data.rawContent,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Sorry, something went wrong. Try again or use the full assistant page.`,
          error: true,
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating bubble button — above bottom nav on mobile, bottom-right on desktop */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 200);
          }}
          className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] md:bottom-6 right-4 md:right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-green-600 text-white shadow-lg shadow-primary/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          aria-label="Open AI assistant"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel — full width on small mobile, fixed width on larger */}
      {isOpen && (
        <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] md:bottom-6 right-3 md:right-6 z-40 w-[calc(100vw-1.5rem)] sm:w-[400px] max-h-[calc(100dvh-10rem)] md:max-h-[500px] bg-card rounded-2xl border border-border shadow-2xl shadow-black/10 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-green-500/5 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-green-600 flex items-center justify-center">
                <Bot className="w-4.5 h-4.5 text-white" />
              </div>
              <span className="font-semibold text-sm">VMGC AI</span>
            </div>
            <div className="flex items-center gap-0.5">
              <Link
                href="/assistant"
                onClick={() => setIsOpen(false)}
                className="p-2.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                title="Open full page"
              >
                <Maximize2 className="w-4.5 h-4.5" />
              </Link>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <Sparkles className="w-8 h-8 text-primary/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Ask me anything about the course, or tell me to do something.
                </p>
                <div className="mt-4 space-y-2 w-full">
                  {["What tasks are due today?", "Add a new observation", "Show equipment status"].map(
                    (prompt, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(prompt)}
                        className="w-full text-left text-sm px-4 py-3 rounded-xl border border-border hover:bg-muted/50 hover:border-primary/20 active:bg-muted/70 transition-colors text-muted-foreground"
                      >
                        {prompt}
                      </button>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : msg.error
                          ? "bg-destructive/10 border border-destructive/20 rounded-bl-md"
                          : "bg-muted/60 border border-border/50 rounded-bl-md"
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted/60 border border-border/50 rounded-2xl rounded-bl-md px-3.5 py-2.5">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border px-3 py-3 shrink-0">
            <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-1">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask or command..."
                disabled={isLoading}
                className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground/50 disabled:opacity-50 py-2 min-h-[40px]"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className="p-2.5 rounded-lg text-primary hover:bg-primary/10 active:bg-primary/15 transition-colors disabled:opacity-30 shrink-0"
                aria-label="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
