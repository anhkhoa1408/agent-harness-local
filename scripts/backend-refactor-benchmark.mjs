// Synthetic in-process benchmark; run: node --import tsx scripts/backend-refactor-benchmark.mjs [checkout]
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
const root = process.argv[2] ?? process.cwd();
const mod = async (p) => import(pathToFileURL(`${root}/${p}`).href);
const { DashboardService } = await mod("src/application/dashboard/index.ts");
const { taskFixture } = await mod("tests/support/task-fixture.ts");
const { openStore } = await mod("src/infrastructure/persistence/store.ts");
const tasks = Array.from({ length: 1500 }, (_, i) =>
  taskFixture({ id: `task-${i}`, stage: "implement", status: "running" }),
);
const attempts = Array.from({ length: 20 }, () =>
  tasks.map((t) => ({
    taskId: t.id,
    stage: "discover",
    status: "completed",
    nextStage: "analyze",
    nextStatus: "queued",
    output: null,
  })),
).flat();
const dashboard = new DashboardService({
  tasks: { list: () => tasks },
  attempts: { list: () => attempts },
});
function measure(name, fn) {
  fn();
  fn();
  const times = [];
  for (let i = 0; i < 7; i++) {
    const at = performance.now();
    fn();
    times.push(performance.now() - at);
  }
  times.sort((a, b) => a - b);
  console.log(JSON.stringify({ name, medianMs: times[3], samplesMs: times }));
}
measure("dashboard-1500-tasks-30000-attempts", () => dashboard.tasks());
const store = openStore(":memory:");
try {
  measure("record-crud-10000-cycles", () => {
    for (let i = 0; i < 10000; i++) {
      const id = String(i);
      store.putRecord("bench", id, { i, text: "fixture" });
      store.getRecord("bench", id);
      store.deleteRecord("bench", id);
    }
  });
} finally {
  store.close();
}
