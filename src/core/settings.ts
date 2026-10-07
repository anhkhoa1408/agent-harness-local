import { z } from "zod";
import { defaultModels, applyEffortPolicy } from "./model-policy";
import { ModelMapSchema, ExecutionModeSchema } from "./contracts";
export const SettingsSchema = z
  .object({
    models: ModelMapSchema.default(defaultModels),
    executionMode: ExecutionModeSchema.default("manual"),
  })
  .transform((settings) => ({
    ...settings,
    models: applyEffortPolicy(settings.models),
  }));
