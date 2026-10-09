import { test, expect } from "vitest";
import { z } from "zod";
import { PlanSchema } from "../../src/infrastructure/validation/contracts";
import {
  PlanOutputSchema,
  parsePlanOutput,
} from "../../src/infrastructure/context/plan-output";
import { planFixture } from "../support/task-fixture";

test("Plan Structured Outputs requires every property, including optional stories and UI evidence", () => {
  const check = (schema: Record<string, unknown>) => {
    if (schema.properties) {
      expect([...((schema.required ?? []) as string[])].sort()).toEqual(
        Object.keys(schema.properties as object).sort(),
      );
      expect(schema.additionalProperties).toBe(false);
    }
    for (const value of Object.values(schema)) {
      if (Array.isArray(value))
        value.forEach((v) => v && typeof v === "object" && check(v));
      else if (value && typeof value === "object")
        check(value as Record<string, unknown>);
    }
  };
  check(z.toJSONSchema(PlanOutputSchema));
});

test("wire nulls preserve omitted stories in persisted plans without weakening story validation", () => {
  const plan = planFixture();
  expect(
    parsePlanOutput({ ...plan, stories: null, uiVerification: null }),
  ).toEqual(PlanSchema.parse({ ...plan, uiVerification: null }));
  expect(
    PlanOutputSchema.safeParse({ ...plan, stories: [], uiVerification: null })
      .success,
  ).toBe(false);
  expect(PlanSchema.parse(plan).stories).toBeUndefined();
});
