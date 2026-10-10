import { expect, test } from "vitest";
import { ModelService, type Settings } from "../../src/application/models";
import { defaultModels } from "../../src/domain/model-policy";
function fixture(initial: Settings | null = null) {
  let saved = initial;
  const service = new ModelService(
    {
      get: () => saved,
      put: (value) => {
        saved = value;
      },
    },
    {
      listModels: async () => [
        { id: "gpt-6-astra", efforts: ["high"], isDefault: false },
        { id: "gpt-6-luna", efforts: ["medium"], isDefault: true },
      ],
    },
  );
  return { service, read: () => saved };
}
test("missing settings receive defaults without requiring a live agent", () => {
  const f = fixture();
  expect(f.service.getSettings().models.plan).toEqual({
    model: "gpt-6-astra",
    effort: "high",
  });
  expect(f.service.getSettings().executionMode).toBe("manual");
});
test("saving settings normalizes effort and cannot silently change existing snapshots", async () => {
  const f = fixture();
  const original = { models: defaultModels(), executionMode: "auto" as const };
  original.models.plan.effort = "low";
  const snapshot = structuredClone(original);
  const saved = await f.service.saveSettings(original);
  expect(saved.models.plan.effort).toBe("high");
  expect(original).toEqual(snapshot);
  expect(f.read()?.models.plan.effort).toBe("high");
});
test("unsupported model leaves previous settings untouched", async () => {
  const initial = { models: defaultModels(), executionMode: "manual" as const };
  const f = fixture(initial);
  await expect(
    f.service.saveSettings({
      ...initial,
      models: { ...initial.models, plan: { model: "missing", effort: "high" } },
    }),
  ).rejects.toThrow("model_unavailable");
  expect(f.read()).toEqual(initial);
});
