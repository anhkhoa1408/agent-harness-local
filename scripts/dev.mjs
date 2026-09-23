import { spawn } from "node:child_process";
const port = process.env.PORT ?? "3000";
if (process.env.HARNESS_TEST_MODE === "1") {
  await new Promise((resolve, reject) => {
    const seed = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/e2e-seed.ts"],
      { stdio: "inherit" },
    );
    seed.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("seed_failed")),
    );
  });
}
const children = [
  spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      process.env.HARNESS_PRODUCTION === "1" ? "start" : "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      port,
    ],
    { stdio: "inherit" },
  ),
  spawn(process.execPath, ["--import", "tsx", "src/worker/main.ts"], {
    stdio: "inherit",
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  const timeout = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 15000);
  Promise.all(
    children.map((c) =>
      c.exitCode !== null
        ? Promise.resolve()
        : new Promise((r) => c.once("exit", r)),
    ),
  ).then(() => {
    clearTimeout(timeout);
    process.exit(code);
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
