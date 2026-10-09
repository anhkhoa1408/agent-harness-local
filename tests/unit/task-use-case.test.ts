import { test, expect } from "vitest";
import { TaskService } from "../../src/application/tasks";
import { ModelService } from "../../src/application/models";
import { defaultModels } from "../../src/domain/model-policy";
import type { ApplicationStore } from "../../src/application/ports";
import type { ValidationPort } from "../../src/application/validation";
import type { Repository, NewTask } from "../../src/domain/contracts";
import { taskFixture } from "../support/task-fixture";
test("create-task snapshots settings and checks repository again after catalog I/O", async () => {
  const repo = {
    id: "repo",
    root: "/repo",
    baseBranch: "main",
    remote: null,
    head: "a".repeat(40),
    dirty: false,
  } satisfies Repository;
  let present = true;
  let created: NewTask | undefined;
  let saved = { models: defaultModels(), executionMode: "manual" as const };
  const models = new ModelService(
    {
      get: () => saved,
      put: (value) => {
        saved = value as typeof saved;
      },
    },
    {
      listModels: async () => [
        { id: "gpt-6-astra", efforts: ["high"], isDefault: false },
        { id: "gpt-6-luna", efforts: ["medium"], isDefault: true },
      ],
    },
  );
  const data: Pick<ApplicationStore, "atomic" | "repositories" | "tasks"> = {
    atomic: (work) => work(),
    repositories: {
      get: () => (present ? repo : null),
      list: () => [repo],
      put() {},
      delete() {},
    },
    tasks: {
      create: (value) => {
        created = structuredClone(value);
        return taskFixture(value);
      },
      get: () => taskFixture(),
      list: () => [],
      update: () => taskFixture(),
    },
  };
  // Fake validation passes prevalidated inputs; schema tests independently cover adapter shape errors.
  const validation = {
    repository: (value: unknown) => value as Repository,
    models: (value: unknown) => value,
    newTask: (value: unknown) => value,
  } as ValidationPort;
  const service = new TaskService(
    data,
    { resolveCommit: async () => repo.head, validateBranch: async () => {} },
    models,
    validation,
  );
  await service.createTask({
    repositoryId: "repo",
    title: "feature",
    requirement: "approved",
    deliveryMode: "local",
  });
  expect(created?.models.plan.model).toBe("gpt-6-astra");
  saved = {
    ...saved,
    models: { ...saved.models, plan: { model: "changed", effort: "high" } },
  };
  expect(created?.models.plan.model).toBe("gpt-6-astra");
  saved = { ...saved, models: defaultModels() };
  const racing = new TaskService(
    data,
    {
      resolveCommit: async () => repo.head,
      validateBranch: async () => {
        present = false;
      },
    },
    models,
    validation,
  );
  await expect(racing.createTask({ repositoryId: "repo" })).rejects.toThrow(
    "repository_not_found",
  );
});
