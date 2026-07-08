"use client";

import { useEffect, useRef } from "react";
import { Bot, AlertCircle, Loader2, FileSpreadsheet } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { AssistantMessage } from "@/lib/hooks/useAssistantChat";

// Shared conversation renderer for the AI assistant — used by both the
// AssistantBar dropdown panel and the full /assistant page so the two
// surfaces stay visually identical.

interface ChatMessagesProps {
  messages: AssistantMessage[];
  loading: boolean;
  uploading: boolean;
  toolActivity: string | null;
}

export function ChatMessages({
  messages,
  loading,
  uploading,
  toolActivity,
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Activity indicator — shown only before the reply has arrived, or while
  // a photo uploads. Once text is in the bubble, the bubble is the signal.
  const last = messages[messages.length - 1];
  const streamingHasText =
    last?.role === "assistant" && !last.error && last.content.length > 0;
  const showActivity =
    (loading || uploading) && (!streamingHasText || !!toolActivity || uploading);
  const activityLabel = uploading
    ? "Uploading photo..."
    : toolActivity
      ? `${toolActivity}...`
      : "Thinking...";

  return (
    <>
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

            {/* User spreadsheet attachment */}
            {msg.attachmentName && (
              <div
                className={`mb-2 flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 ${
                  msg.role === "user"
                    ? "bg-primary-foreground/10 text-primary-foreground/90"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{msg.attachmentName}</span>
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

      {showActivity && (
        <div className="flex gap-3 items-start">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="bg-card border border-border rounded-2xl px-4 py-3">
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              <span className="text-sm text-muted-foreground">{activityLabel}</span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  );
}
