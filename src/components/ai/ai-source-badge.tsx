import type { AiSource } from "@/lib/ai/use-ai-generate";

/**
 * Tiny pill that tells the user where an AI answer came from:
 *  - library  → reused a past answer for free
 *  - ai       → freshly generated (paid)
 *  - fallback → offline template/old answer because the AI was unreachable
 */
export function AiSourceBadge({
  source,
  className = "",
}: {
  source: AiSource | null;
  className?: string;
}) {
  if (!source) return null;
  const map: Record<AiSource, { label: string; cls: string }> = {
    library: { label: "Reused from your library · free", cls: "bg-green-100 text-green-800" },
    ai: { label: "Generated with AI", cls: "bg-blue-100 text-blue-800" },
    fallback: { label: "Offline draft — review carefully", cls: "bg-amber-100 text-amber-800" },
  };
  const { label, cls } = map[source];
  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded-full ${cls} ${className}`}
    >
      {label}
    </span>
  );
}
