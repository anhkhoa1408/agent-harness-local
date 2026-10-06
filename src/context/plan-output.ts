import { PlanSchema } from "../core/contracts";

// Structured Outputs requires every key; null represents an inapplicable section.
// Defaults keep legacy fixtures/outputs readable, while the emitted schema is required.
export const PlanOutputSchema = PlanSchema.extend({
  stories: PlanSchema.shape.stories.unwrap().nullable().default(null),
  uiVerification: PlanSchema.shape.uiVerification.unwrap().default(null),
});

export function parsePlanOutput(value: unknown) {
  const plan = PlanOutputSchema.parse(value);
  return PlanSchema.parse({ ...plan, stories: plan.stories ?? undefined });
}
