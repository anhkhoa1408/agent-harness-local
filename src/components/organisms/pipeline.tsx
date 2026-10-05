import type { StageNode } from "@/core/pipeline-progress";
import { stageLabel } from "@/lib/api";
import { StageIndicator } from "@/components/atoms/stage-indicator";
import { cn } from "@/lib/utils";
export function Pipeline({
  nodes,
  compact = false,
}: {
  nodes: StageNode[];
  compact?: boolean;
}) {
  return (
    <ol
      className={cn(
        "flex min-w-0 overflow-x-auto pb-3",
        compact ? "mt-5" : "my-5",
      )}
      aria-label="Tiến độ pipeline"
    >
      {nodes.map((node, index) => (
        <li
          key={node.stage}
          data-stage={node.stage}
          data-state={node.state}
          aria-current={node.state === "current" ? "step" : undefined}
          aria-label={`${stageLabel[node.stage]}: ${node.label}`}
          title={`${stageLabel[node.stage]}: ${node.label}`}
          className={cn(
            "relative flex-1 px-1 text-center before:absolute before:right-1/2 before:w-full before:border-t-2 before:border-border first:before:hidden",
            compact
              ? "min-w-20 text-[10px] before:top-3"
              : "min-w-24 text-xs before:top-4",
          )}
        >
          <StageIndicator state={node.state} index={index} compact={compact} />
          <span className="block text-foreground/85">
            {stageLabel[node.stage]}
          </span>
          <span
            className={cn(
              "mt-1 block text-[10px] text-muted-foreground",
              node.state === "done" && "text-emerald-300",
              ["current", "attention"].includes(node.state) && "text-amber-200",
            )}
          >
            {node.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
