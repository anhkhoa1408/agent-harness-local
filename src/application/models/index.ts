import {
  defaultModels,
  applyEffortPolicy,
  resolveModel,
  type ModelInfo,
} from "../../domain/model-policy";
import {
  aiStages,
  type AiStage,
  type ModelMap,
  type ModelChoice,
  type ExecutionMode,
} from "../../domain/contracts";
export type Settings = { models: ModelMap; executionMode: ExecutionMode };
export interface ModelCatalogPort {
  listModels(): Promise<ModelInfo[]>;
}
export interface SettingsRepository {
  get(): Settings | null;
  put(settings: Settings): void;
}
export class ModelService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly catalog: ModelCatalogPort,
  ) {}
  getSettings(): Settings {
    const stored = this.settings.get();
    return {
      models: stored ? applyEffortPolicy(stored.models) : defaultModels(),
      executionMode: stored?.executionMode ?? "manual",
    };
  }
  async saveSettings(value: Settings) {
    const settings = { ...value, models: applyEffortPolicy(value.models) };
    await this.validateModels(settings.models);
    this.settings.put(settings);
    return settings;
  }
  async validateModels(models: ModelMap) {
    const catalog = await this.catalog.listModels();
    for (const stage of aiStages) resolveModel(stage, models, {}, catalog);
  }
  async resolveAttempt(role: AiStage, models: ModelMap, parent: ModelChoice) {
    const catalog = await this.catalog.listModels();
    if (
      !catalog.some(
        (m) => m.id === parent.model && m.efforts.includes(parent.effort),
      )
    )
      throw new Error("parent_model_unavailable");
    return resolveModel(role, models, {}, catalog);
  }
}
