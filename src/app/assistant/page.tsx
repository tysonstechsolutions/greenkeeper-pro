"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  ArrowLeft,
  Sparkles,
  RotateCcw,
  Camera,
  X,
  Image as ImageIcon,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAssistantChat } from "@/lib/hooks/useAssistantChat";
import { ChatMessages } from "@/components/features/ai/chat-messages";
import { canUseAssistant, getRandomPrompts } from "@/lib/ai/assistant-prompts";
import {
  isWorkspaceKey,
  WORKSPACE_LABELS,
  WORKSPACE_PROMPTS,
  type WorkspaceKey,
} from "@/lib/layout/workspace-map";

// Full-screen AI chat. The everyday entry point is the AssistantBar pinned
// under the header on every page; this page is the roomy version (reached
// from the More menu, quick actions, or the expand button on the bar's
// panel). Both share the same conversation store via useAssistantChat.

export default function AssistantPage() {
  const { profile } = useAuth();

  // Workspace context (?ws= from workspace pages / the bar's expand link).
  // Read post-hydration — this is a statically exported client page, so
  // window.location is the source of truth for query params and the one-time
  // URL→state sync has to live in an effect.
  const [workspace, setWorkspace] = useState<WorkspaceKey | null>(null);
  const [generalExamples] = useState(() => getRandomPrompts(4));
  const examples = workspace ? WORKSPACE_PROMPTS[workspace] : generalExamples;
  useEffect(() => {
    const ws = new URLSearchParams(window.location.search).get("ws");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ?ws= is only knowable post-hydration on a static export
    if (isWorkspaceKey(ws)) setWorkspace(ws);
  }, []);

  const {
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
  } = useAssistantChat(workspace);

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) selectPhoto(file);
    // Reset file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const send = (text: string) => {
    if ((!text.trim() && !pendingPhoto) || loading) return;
    sendMessage(text);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  if (!canUseAssistant(profile?.role)) {
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
            {workspace
              ? `${WORKSPACE_LABELS[workspace]} — tell me what needs to happen`
              : "Tell me what needs to happen and I'll do it"}
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

        <ChatMessages
          messages={messages}
          loading={loading}
          uploading={uploading}
          toolActivity={toolActivity}
        />
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
              aria-label="Remove photo"
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
              onClick={stopGenerating}
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
