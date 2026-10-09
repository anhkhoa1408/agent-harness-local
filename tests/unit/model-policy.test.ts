import { test, expect } from "vitest";
import {
  resolveModel,
  defaultModels,
  applyEffortPolicy,
} from "../../src/domain/model-policy";
import { aiStages } from "../../src/domain/contracts";
const catalog = [
  { id: "strong", efforts: ["high"], isDefault: false },
  { id: "economy", efforts: ["medium"], isDefault: true },
];
test("code policy uses high planning and medium elsewhere, retaining model choices", () => {
  const defaults = defaultModels();
  expect(defaults.plan).toEqual({ model: "gpt-6-astra", effort: "high" });
  for (const stage of aiStages.filter((s) => s !== "plan"))
    expect(defaults[stage]).toEqual({ model: "gpt-6-luna", effort: "medium" });
  const choices = { ...defaults, plan: { model: "strong", effort: "low" } };
  expect(applyEffortPolicy(choices).plan).toEqual({
    model: "strong",
    effort: "high",
  });
  expect(choices.plan.effort).toBe("low");
  expect(resolveModel("plan", choices, {}, catalog)).toEqual({
    model: "strong",
    effort: "high",
  });
  expect(
    resolveModel(
      "repair",
      { repair: { model: "economy", effort: "high" } },
      {},
      catalog,
    ),
  ).toEqual({ model: "economy", effort: "medium" });
});
test("model overrides never fall back and unsupported fixed effort blocks", () => {
  expect(() =>
    resolveModel(
      "plan",
      { plan: { model: "missing", effort: "high" } },
      {},
      catalog,
    ),
  ).toThrow("model_unavailable");
  expect(() =>
    resolveModel(
      "plan",
      { plan: { model: "economy", effort: "medium" } },
      {},
      catalog,
    ),
  ).toThrow("effort_unavailable");
  const copy = defaultModels();
  copy.plan.model = "changed";
  expect(defaultModels().plan.model).toBe("gpt-6-astra");
});
