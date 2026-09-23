import { test, expect } from "vitest";
import { resolveModel } from "../../src/core/model-policy";
const catalog = [
  { id: "strong", efforts: ["high"], isDefault: false },
  { id: "medium", efforts: ["medium"], isDefault: true },
];
const config = {
  plan: { model: "strong", effort: "high" },
  implement: { model: "medium", effort: "medium" },
};
test("stage routing uses planner and implementer settings without silently falling back", () => {
  expect(resolveModel("plan", {}, config, catalog)).toEqual({
    model: "strong",
    effort: "high",
  });
  expect(resolveModel("implement", {}, config, catalog)).toEqual({
    model: "medium",
    effort: "medium",
  });
  expect(() => resolveModel("plan", {}, {}, catalog)).toThrow(
    "model_unconfigured",
  );
  expect(() =>
    resolveModel(
      "plan",
      { plan: { model: "missing", effort: "high" } },
      config,
      catalog,
    ),
  ).toThrow("model_unavailable");
  expect(() =>
    resolveModel(
      "implement",
      { implement: { model: "medium", effort: "high" } },
      config,
      catalog,
    ),
  ).toThrow("effort_unavailable");
});
test("task override wins and resolution returns an independent value", () => {
  const resolved = resolveModel(
    "plan",
    { plan: { model: "medium", effort: "medium" } },
    config,
    catalog,
  );
  expect(resolved.model).toBe("medium");
  resolved.model = "mutated";
  expect(config.plan.model).toBe("strong");
});
