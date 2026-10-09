import {
  aiStages,
  type AiStage,
  type ModelChoice,
  type ModelMap,
} from "./contracts";
export type ModelInfo = { id: string; efforts: string[]; isDefault: boolean };
// Edit these defaults to change the pipeline policy. No runtime fallback.
export const stageEffort = (stage: AiStage): "high" | "medium" =>
  stage === "plan" ? "high" : "medium";
export function defaultModels(): ModelMap {
  return Object.fromEntries(
    aiStages.map((stage) => [
      stage,
      {
        model: stage === "plan" ? "gpt-6-astra" : "gpt-6-luna",
        effort: stageEffort(stage),
      },
    ]),
  ) as ModelMap;
}
export function applyEffortPolicy(models: ModelMap): ModelMap {
  return Object.fromEntries(
    aiStages.map((stage) => [
      stage,
      {
        model: models[stage].model,
        effort: stageEffort(stage),
      },
    ]),
  ) as ModelMap;
}
export function resolveModel(
  stage: AiStage,
  task: Partial<ModelMap>,
  defaults: Partial<ModelMap>,
  catalog: ModelInfo[],
): ModelChoice {
  const configured = task[stage] ?? defaults[stage] ?? defaultModels()[stage];
  const choice = { model: configured.model, effort: stageEffort(stage) };
  const model = catalog.find((m) => m.id === choice.model);
  if (!model) throw new Error(`model_unavailable: ${choice.model}`);
  if (!model.efforts.includes(choice.effort))
    throw new Error(`effort_unavailable: ${choice.effort}`);
  return { ...choice };
}

export const parentAgentModel = {model:"gpt-6-luna",effort:"medium"};
