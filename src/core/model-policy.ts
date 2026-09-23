import type { AiStage, ModelChoice, ModelMap } from "./contracts";
export type ModelInfo = { id: string; efforts: string[]; isDefault: boolean };
export function resolveModel(
  stage: AiStage,
  task: Partial<ModelMap>,
  defaults: Partial<ModelMap>,
  catalog: ModelInfo[],
): ModelChoice {
  const choice = task[stage] ?? defaults[stage];
  if (!choice) throw new Error(`model_unconfigured: ${stage}`);
  const model = catalog.find((m) => m.id === choice.model);
  if (!model) throw new Error(`model_unavailable: ${choice.model}`);
  if (!model.efforts.includes(choice.effort))
    throw new Error(`effort_unavailable: ${choice.effort}`);
  return { ...choice };
}
