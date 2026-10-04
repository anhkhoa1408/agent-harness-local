import type { AiStage } from "../../core/contracts";
import { stageEffort, type ModelInfo } from "../../core/model-policy";
import { stageLabel } from "../api";
export function StageModelRow({
  stage,
  model,
  catalog,
  onSelect,
}: {
  stage: AiStage;
  model: string;
  catalog: ModelInfo[];
  onSelect: (stage: AiStage, model: string) => void;
}) {
  return (
    <div className="model-row">
      <div>
        <strong>{stageLabel[stage]}</strong>
        <p>
          {stage === "plan"
            ? "Model mạnh · plan và replan"
            : "Model tiết kiệm · medium"}
        </p>
      </div>
      <label className="sr-label">
        Model {stage}
        <select
          required
          value={model}
          onChange={(e) => onSelect(stage, e.target.value)}
        >
          <option value="">Chọn model</option>
          {catalog.map((m) => (
            <option key={m.id}>{m.id}</option>
          ))}
        </select>
      </label>
      <span className="badge">Effort {stageEffort(stage)}</span>
    </div>
  );
}
