import type { AiStage } from "@/core/contracts";
import type { ModelInfo } from "@/core/model-policy";
import { stageLabel } from "@/lib/api";
import { FormField } from "@/components/molecules/form-field";
import { ModelSelector } from "@/components/molecules/model-selector";
export function StageModelRow({
  stage,
  model,
  catalog,
  onSelect,
  disabled,
}: {
  stage: AiStage;
  model: string;
  catalog: ModelInfo[];
  onSelect: (stage: AiStage, model: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid items-center gap-4 border-t py-5 sm:grid-cols-[1fr_1.5fr]">
      <div>
        <strong className="text-sm">{stageLabel[stage]}</strong>
        <p className="mt-1 text-xs text-muted-foreground">
          {stage === "plan"
            ? "Model mạnh · plan và replan"
            : "Model tiết kiệm · medium"}
        </p>
      </div>
      <FormField id={`model-${stage}`} label={`Model ${stage}`}>
        <ModelSelector
          id={`model-${stage}`}
          value={model}
          catalog={catalog}
          onSelect={(value) => onSelect(stage, value)}
          disabled={disabled}
        />
      </FormField>
    </div>
  );
}
