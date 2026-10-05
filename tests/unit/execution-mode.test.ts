import { test, expect } from "vitest";
import { SettingsSchema } from "../../src/server/http";
import { TaskSchema, ControlCommandSchema } from "../../src/core/contracts";
import { taskFixture } from "../support/task-fixture";
test("old settings and tasks remain manual; modes and feedback command kinds are validated", () => {
  expect(SettingsSchema.parse({}).executionMode).toBe("manual");
  expect(SettingsSchema.parse({ executionMode: "auto" }).executionMode).toBe(
    "auto",
  );
  expect(() =>
    SettingsSchema.parse({ executionMode: "full-access" }),
  ).toThrow();
  expect(TaskSchema.parse(taskFixture()).executionMode ?? "manual").toBe(
    "manual",
  );
  expect(
    TaskSchema.parse(taskFixture({ executionMode: "auto" })).executionMode,
  ).toBe("auto");
  for (const kind of ["comment", "revise"])
    expect(
      ControlCommandSchema.parse({
        id: kind,
        taskId: "task",
        expectedRevision: 0,
        kind,
        payload: {},
      }).kind,
    ).toBe(kind);
});
