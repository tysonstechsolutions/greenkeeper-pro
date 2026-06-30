"use client";

import { useState } from "react";
import { Upload, Loader2, X, ListPlus, RotateCcw } from "lucide-react";
import {
  extractTasksFromFile,
  extractTasksFromText,
  type ExtractedTask,
} from "@/lib/my-day/bulk-extract";

/**
 * Bulk import for My Day: upload a photo/PDF of a handwritten or printed list,
 * or paste/CSV a list. The AI reads it into tasks (text falls back to a plain
 * line parser without the edge function), you review/trim, then add them all.
 */
export function BulkImportPanel({
  onAdd,
}: {
  onAdd: (tasks: ExtractedTask[]) => Promise<number>;
}) {
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [tasks, setTasks] = useState<ExtractedTask[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNote(null);
    setExtracting(true);
    try {
      const t = await extractTasksFromFile(file);
      if (t.length === 0) setError("Couldn't find any tasks in that file.");
      else setTasks(t);
    } catch {
      setError(
        "Couldn't read that file — the AI reader may not be set up yet. Try pasting the list instead.",
      );
    } finally {
      setExtracting(false);
    }
  };

  const readText = async () => {
    if (!text.trim() || extracting) return;
    setError(null);
    setNote(null);
    setExtracting(true);
    try {
      const t = await extractTasksFromText(text);
      if (t.length === 0) setError("Couldn't find any tasks in that list.");
      else setTasks(t);
    } finally {
      setExtracting(false);
    }
  };

  const commit = async () => {
    if (!tasks || tasks.length === 0 || adding) return;
    setAdding(true);
    try {
      const n = await onAdd(tasks);
      setNote(`Added ${n} task${n === 1 ? "" : "s"}.`);
      setTasks(null);
      setText("");
    } catch {
      setError("Couldn't add those tasks. Try again.");
    } finally {
      setAdding(false);
    }
  };

  // ── Review step ────────────────────────────────────────────────────────────
  if (tasks) {
    return (
      <div className="gk-card p-3 mb-3">
        <p className="text-xs text-muted-foreground mb-2">
          Found {tasks.length} task{tasks.length === 1 ? "" : "s"} — remove any
          you don&apos;t want, then add the rest.
        </p>
        <div className="space-y-1.5 max-h-72 overflow-y-auto mb-3">
          {tasks.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-sm bg-muted/40 rounded-lg px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              {t.deadline && (
                <span className="text-[11px] text-muted-foreground shrink-0">
                  by {t.deadline}
                </span>
              )}
              <button
                type="button"
                onClick={() => setTasks((p) => (p ? p.filter((_, j) => j !== i) : p))}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Remove"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={commit}
            disabled={adding || tasks.length === 0}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
            Add {tasks.length} task{tasks.length === 1 ? "" : "s"}
          </button>
          <button
            type="button"
            onClick={() => setTasks(null)}
            className="text-xs text-muted-foreground inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Start over
          </button>
        </div>
      </div>
    );
  }

  // ── Input step ─────────────────────────────────────────────────────────────
  return (
    <div className="gk-card p-3 mb-3 space-y-2">
      <label
        className={`flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm cursor-pointer hover:border-primary/40 ${extracting ? "opacity-50 pointer-events-none" : ""}`}
      >
        {extracting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4 text-primary" />
        )}
        {extracting ? "Reading…" : "Upload a photo or PDF of your list"}
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={onFile}
          disabled={extracting}
          className="hidden"
        />
      </label>

      <p className="text-[11px] text-muted-foreground text-center">or paste a list</p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"One task per line, e.g.\nFix sprinkler on 7\nOrder bunker sand\nCall vendor about mower"}
        rows={4}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button
        type="button"
        onClick={readText}
        disabled={extracting || !text.trim()}
        className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        Read list
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
