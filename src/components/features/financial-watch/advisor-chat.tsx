"use client";

import { useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import type { FinancialWatch } from "@/lib/financial-watch/types";
import {
  askFinancialAdvisor,
  type AdvisorMessage,
} from "@/lib/financial-watch/advisor";

const SUGGESTIONS = [
  "How can I increase revenue?",
  "Where can I cut spending?",
  "What's my biggest financial risk right now?",
  "What should I focus on this month?",
];

/**
 * "Ask the analyst" — a chat that reasons over the computed FinancialWatch.
 * The snapshot is serialized client-side and sent to the financial-advisor
 * edge function, so answers stay grounded in the real numbers shown above.
 */
export function AdvisorChat({ watch }: { watch: FinancialWatch }) {
  const [messages, setMessages] = useState<AdvisorMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setError(null);
    setInput("");
    const next: AdvisorMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setBusy(true);
    try {
      const reply = await askFinancialAdvisor(question, watch, next);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      console.error("[financial-advisor] ask failed:", err);
      setError("The analyst isn't available right now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gk-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Bot className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-sm">Ask the analyst</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Grounded in the numbers above — ask for trends, risks, or ways to grow
        revenue and cut spend.
      </p>

      {messages.length > 0 && (
        <div className="space-y-2.5 mb-3">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={`inline-block max-w-[88%] text-left rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && <p className="text-xs text-muted-foreground">Analyzing…</p>}
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={busy}
              className="text-xs px-2.5 py-1.5 rounded-full border border-border bg-muted/40 hover:border-primary/40 disabled:opacity-50 flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-primary" />
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="Ask about the finances…"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 shrink-0"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </section>
  );
}
