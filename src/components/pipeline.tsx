import type { StageNode } from "../core/pipeline-progress";
import { stageLabel } from "./api";
export function Pipeline({
  nodes,
  compact = false,
}: {
  nodes: StageNode[];
  compact?: boolean;
}) {
  return (
    <ol
      className={`pipeline${compact ? " pipeline-compact" : ""}`}
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
        >
          <span className="stage-circle" aria-hidden="true">
            {node.state === "done"
              ? "✓"
              : node.state === "attention"
                ? "!"
                : node.state === "stopped"
                  ? "×"
                  : node.state === "skipped"
                    ? "–"
                    : String(index + 1).padStart(2, "0")}
          </span>
          <span className="stage-name">{stageLabel[node.stage]}</span>
          <span className="stage-status">{node.label}</span>
        </li>
      ))}
    </ol>
  );
}
