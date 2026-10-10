import { createRepositories } from "../../src/infrastructure/persistence/repositories";
import { test, expect } from "vitest";
import { openStore } from "../../src/infrastructure/persistence/store";
import { restoreInterruptedTasks } from "../../src/application/pipeline/recover-state";
import { taskFixture } from "../support/task-fixture";

test.each(["running", "blocked"] as const)(
  "restart retires stale attempts for a %s task without discarding agent evidence",
  (status) => {
    const store = openStore(":memory:");
    try {
      const task = store.createTask(taskFixture());
      store.updateTask(
        task.id,
        task.revision,
        { status },
        { type: "fixture", data: {} },
      );
      store.putRecord("attempt", "old", {
        id: "old",
        taskId: task.id,
        stage: "repair",
        status: "running",
        threadId: "parent",
        child: { threadId: "child" },
        output: null,
      });
      store.putRecord("attempt", "completed", {
        id: "completed",
        taskId: task.id,
        stage: "implement",
        status: "completed",
        output: { summary: "done" },
      });
      restoreInterruptedTasks(createRepositories(store), "same-boot");
      expect(
        (store.listRecords("attempt") as { status: string }[]).filter(
          (a) => a.status === "running",
        ),
      ).toEqual([]);
      expect(store.getRecord("attempt", "old")).toMatchObject({
        status: "interrupted",
        threadId: "parent",
        child: { threadId: "child" },
      });
      expect(store.getRecord("attempt", "completed")).toMatchObject({
        status: "completed",
        output: { summary: "done" },
      });
      if (status === "running") {
        expect(store.getTask(task.id).reason).toBe("runtime_state_unknown");
        expect(store.getRecord("exclusion", task.id)).toMatchObject({
          reason: "runtime_state_unknown",
        });
      }
    } finally {
      store.close();
    }
  },
);
