import { z } from "zod";
import * as schemas from "./contracts";
import { SettingsSchema } from "./settings";
import { PlanOutputSchema, parsePlanOutput } from "../context/plan-output";
import { mutationSchema } from "./mutation";
import type { ValidationPort } from "../../application/validation";
import type { OutputCodec } from "../../application/agent-execution";
const codec = <T>(schema: z.ZodType<T>): OutputCodec<T> => ({
  parse: (value) => schema.parse(value),
  jsonSchema: () => z.toJSONSchema(schema),
});
export const validation: ValidationPort = {
  command: (value) => schemas.ControlCommandSchema.parse(value),
  plan: (value) => schemas.PlanSchema.parse(value),
  repository: (value) => schemas.RepositorySchema.parse(value),
  settings: (value) => SettingsSchema.parse(value),
  newTask: (value) => schemas.NewTaskSchema.parse(value),
  models: (value) => schemas.ModelMapSchema.parse(value),
  comment: (value) => schemas.PlanCommentInputSchema.parse(value),
  revision: (value) =>
    z.object({ version: z.number().int().positive() }).parse(value),
  storySelection: (value) => schemas.StorySelectionSchema.parse(value),
  executionMode: (value) => schemas.ExecutionModeSchema.parse(value),
  planOutput: parsePlanOutput,
  outputs: {
    profile: codec(schemas.RepoProfileSchema),
    analysis: codec(schemas.AnalysisSchema),
    plan: codec(PlanOutputSchema),
    review: codec(schemas.ReviewSchema),
    visual: codec(schemas.VisualReviewSchema),
    mutation: codec(mutationSchema),
  },
};
