"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Camera,
  Send,
  Square,
  X,
  RotateCcw,
  Maximize2,
  Image as ImageIcon,
  Sparkles,
  Paperclip,
  FileSpreadsheet,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAssistantChat } from "@/lib/hooks/useAssistantChat";
import { ChatMessages } from "./chat-messages";
import { stripTrailingSlash } from "@/lib/utils/page-title";
import {
  workspaceForPath,
  WORKSPACE_LABELS,
  WORKSPACE_PROMPTS,
} from "@/lib/layout/workspace-map";
import { canUseAssistant, getRandomPrompts } from "@/lib/ai/assistant-prompts";
import { SPREADSHEET_ACCEPT } from "@/lib/ai/spreadsheet-attachment";

/**
 * Always-visible "Ask AI" bar pinned under the app header on every screen.
 * Typing here opens an inline dropdown panel with the conversation — the
 * user never leaves the page they're on. Replaces the old floating chat
 * bubble that navigated to /assistant.
 *
 * The conversation is the same ai_conversations store the full /assistant
 * page uses, so both surfaces share history.
 */
export function AssistantBar() {
  const pathname = usePathname();
  const { user, profile } = useAuth();

  const path = stripTrailingSlash(pathname);
  const workspace = workspaceForPath(path);

  const {
    messages,
    loading,
    uploading,
    toolActivity,
    pendingPhoto,
    pendingSpreadsheet,
    attachError,
    sendMessage,
    stopGenerating,
    clearChat,
    selectPhoto,
    clearPendingPhoto,
    selectSpreadsheet,
    clearPendingSpreadsheet,
    loadRecentConversation,
  } = useAssistantChat(workspace);

  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);

  // Suggestion chips match the workspace of the page we're on; on neutral
  // pages fall back to a general set picked once per mount.
  const [generalExamples] = useState(() => getRandomPrompts(4));
  const examples = workspace ? WORKSPACE_PROMPTS[workspace] : generalExamples;

  // Navigating to another page closes the panel (the chat state survives —
  // the bar stays mounted in the shell). Adjust-state-during-render pattern,
  // per react.dev/learn/you-might-not-need-an-effect.
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }

  const openPanel = useCallback(() => {
    setOpen((was) => {
      // Re-sync with the store when (re)opening, in case the full /assistant
      // page added exchanges since. No-ops while a reply is in flight.
      if (!was) void loadRecentConversation();
      return true;
    });
  }, [loadRecentConversation]);

  // Escape closes; click/tap outside the bar+panel closes.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !pendingPhoto && !pendingSpreadsheet) || loading)
      return;
    openPanel();
    sendMessage(input);
    setInput("");
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      selectPhoto(file);
      openPanel();
      inputRef.current?.focus();
    }
    // Reset so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSpreadsheetSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void selectSpreadsheet(file);
      openPanel();
      inputRef.current?.focus();
    }
    // Reset so the same file can be re-selected
    if (sheetInputRef.current) sheetInputRef.current.value = "";
  };

  // Hidden for roles without assistant access, and on the full-screen chat
  // page itself. (All hooks above run unconditionally — keep it that way.)
  if (!user || !canUseAssistant(profile?.role)) return null;
  if (path === "/assistant") return null;

  const assistantHref = workspace ? `/assistant?ws=${workspace}` : "/assistant";

  return (
    <div ref={containerRef} className="relative z-30 shrink-0" data-assistant-bar>
      {/* Input row — always visible */}
      <div className="border-b border-border/60 bg-background/95 backdrop-blur-md px-3 py-2 md:px-4">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 max-w-3xl mx-auto"
        >
          <button
            type="button"
            onClick={() => (open ? setOpen(false) : openPanel())}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 hover:opacity-90 active:scale-95 transition-all"
            aria-label={open ? "Hide AI chat" : "Show AI chat"}
          >
            <Bot className="w-5 h-5 text-white" />
          </button>

          {/* Panel opens on click/tap or on typing — deliberately NOT on bare
              keyboard focus, so tabbing through the page doesn't drop an
              opaque overlay over the content. */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              openPanel();
            }}
            onClick={openPanel}
            placeholder={
              pendingPhoto
                ? "Add a note about the photo..."
                : pendingSpreadsheet
                  ? "Ask about the spreadsheet..."
                  : "Ask AI — tell me what needs to happen..."
            }
            className="flex-1 min-w-0 h-10 rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-muted-foreground/50"
            aria-label="Ask the AI assistant"
          />

          {/* Hidden file input for photo attach */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelect}
            className="hidden"
          />
          {/* Hidden file input for spreadsheet attach (no capture — opens
              the file picker, not the camera) */}
          <input
            ref={sheetInputRef}
            type="file"
            accept={SPREADSHEET_ACCEPT}
            onChange={handleSpreadsheetSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted/50 active:scale-95 transition-all disabled:opacity-50 shrink-0"
            aria-label="Attach photo"
          >
            <Camera className="w-[18px] h-[18px] text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => sheetInputRef.current?.click()}
            disabled={loading}
            className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted/50 active:scale-95 transition-all disabled:opacity-50 shrink-0"
            aria-label="Attach spreadsheet"
          >
            <Paperclip className="w-[18px] h-[18px] text-muted-foreground" />
          </button>

          {loading ? (
            <button
              type="button"
              onClick={stopGenerating}
              className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 active:scale-95 transition-all shrink-0"
              aria-label="Stop generating"
            >
              <Square className="w-[18px] h-[18px]" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() && !pendingPhoto && !pendingSpreadsheet}
              className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 shrink-0"
              aria-label="Send"
            >
              <Send className="w-[18px] h-[18px]" />
            </button>
          )}
        </form>
      </div>

      {/* Dropdown conversation panel — overlays the page, never navigates */}
      {open && (
        <div className="absolute top-full inset-x-0 bg-background border-b border-border shadow-xl shadow-black/10">
          <div className="max-w-3xl mx-auto flex flex-col max-h-[min(65dvh,560px)]">
            {/* Panel header */}
            <div className="flex items-center gap-2 px-3 md:px-4 py-2 border-b border-border/50 shrink-0">
              <span className="text-sm font-semibold">GreenKeeper AI</span>
              {workspace && (
                <span className="text-xs text-muted-foreground">
                  {WORKSPACE_LABELS[workspace]}
                </span>
              )}
              <div className="flex-1" />
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
              <Link
                href={assistantHref}
                className="w-9 h-9 rounded-lg hover:bg-muted/50 flex items-center justify-center transition-colors"
                aria-label="Open full-screen chat"
              >
                <Maximize2 className="w-4 h-4 text-muted-foreground" />
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-lg hover:bg-muted/50 flex items-center justify-center transition-colors"
                aria-label="Close chat panel"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Pending photo chip */}
            {pendingPhoto && (
              <div className="px-3 md:px-4 pt-2 shrink-0">
                <div className="flex items-center gap-3 p-2 rounded-xl bg-muted/50 border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingPhoto.previewUrl}
                    alt="Photo to attach"
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <p className="flex-1 min-w-0 text-sm font-medium flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="truncate">Photo attached</span>
                  </p>
                  <button
                    onClick={clearPendingPhoto}
                    className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center shrink-0 transition-colors"
                    aria-label="Remove photo"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            )}

            {/* Pending spreadsheet chip */}
            {pendingSpreadsheet && (
              <div className="px-3 md:px-4 pt-2 shrink-0">
                <div className="flex items-center gap-3 p-2 rounded-xl bg-muted/50 border border-border">
                  <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {pendingSpreadsheet.data.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pendingSpreadsheet.data.rowCount} rows
                      {pendingSpreadsheet.data.truncated
                        ? " — large file, first rows only"
                        : ""}
                    </p>
                  </div>
                  <button
                    onClick={clearPendingSpreadsheet}
                    className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center shrink-0 transition-colors"
                    aria-label="Remove spreadsheet"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            )}

            {/* Attachment problem (bad type, too big, unreadable) */}
            {attachError && (
              <p className="px-3 md:px-4 pt-2 text-xs text-red-600 dark:text-red-400 shrink-0">
                {attachError}
              </p>
            )}

            {/* Conversation */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 overscroll-contain">
              {messages.length === 0 && !loading && !uploading ? (
                <div className="flex flex-col items-center py-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center mb-2">
                    <Sparkles className="w-5 h-5 text-violet-500" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-4 max-w-sm">
                    Tell me what needs to happen — I can create tasks, add to
                    the order list, report issues, and look up anything. You
                    stay right on this page.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                    {examples.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => {
                          openPanel();
                          sendMessage(prompt);
                        }}
                        className="text-left p-2.5 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/20 active:scale-[0.98] transition-all text-sm"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <ChatMessages
                  messages={messages}
                  loading={loading}
                  uploading={uploading}
                  toolActivity={toolActivity}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
