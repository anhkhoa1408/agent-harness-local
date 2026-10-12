import { ExecutionMode } from "../../domain/constants/execution-mode";
import { z } from "zod";
import { defaultModels, applyEffortPolicy } from "../../domain/model-policy";
import { ModelMapSchema, ExecutionModeSchema } from "./contracts";
export const SettingsSchema = z
  .object({
    models: ModelMapSchema.default(defaultModels),
    executionMode: ExecutionModeSchema.default(ExecutionMode.MANUAL),
  })
  .transform((settings) => ({
    ...settings,
    models: applyEffortPolicy(settings.models),
  }));
