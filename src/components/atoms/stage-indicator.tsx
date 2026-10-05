import type { StageNode } from "@/core/pipeline-progress";
import { cn } from "@/lib/utils";
export function StageIndicator({
  state,
  index,
  compact,
}: {
  state: StageNode["state"];
  index: number;
  compact?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative z-10 mx-auto grid place-items-center rounded-full border-2 bg-background text-xs font-semibold text-muted-foreground",
        compact ? "mb-2 size-7" : "mb-3 size-9",
        state === "done" &&
          "border-emerald-500 bg-emerald-950 text-emerald-200",
        ["current", "attention"].includes(state) &&
          "border-amber-400 bg-amber-950 text-amber-100",
        state === "stopped" && "border-destructive/50 text-destructive",
      )}
    >
      {state === "done"
        ? "✓"
        : state === "attention"
          ? "!"
          : state === "stopped"
            ? "×"
            : state === "skipped"
              ? "–"
              : String(index + 1).padStart(2, "0")}
    </span>
  );
}
