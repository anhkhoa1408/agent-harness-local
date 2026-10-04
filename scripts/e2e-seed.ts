import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { openStore } from "../src/storage/store";
import { inspectRepository } from "../src/repositories/inspect";
import { aiStages } from "../src/core/contracts";
if (process.env.HARNESS_TEST_MODE !== "1")
  throw new Error("test_mode_required");
const data = resolve(process.env.HARNESS_DATA_DIR!),
  root = join(data, "fixture-repo");
await mkdir(root, { recursive: true });
const files = {
  "app.cjs": "module.exports=0",
  "feature.test.cjs":
    "const {test}=require('node:test');const assert=require('node:assert/strict');test('feature',()=>assert.equal(require('./app.cjs'),2));",
  "legacy.test.cjs": "throw Error('intentionally failing legacy')",
  "skip.test.cjs": "require('node:test').test('feature',{skip:true},()=>{})",
  "app.py": "value=0",
  "feature_test.py":
    "from app import value\nprint('TAP version 13')\nprint('1..1')\nprint(('ok' if value == 2 else 'not ok') + ' 1 - feature')\n",
  ".gitignore": "__pycache__/\n",
};
for (const [name, text] of Object.entries(files))
  await writeFile(join(root, name), text);
for (const args of [
  ["init", "-b", "main"],
  ["config", "user.name", "Fixture"],
  ["config", "user.email", "fixture@example.test"],
  ["add", "."],
  ["commit", "--allow-empty", "-m", "fixture"],
])
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
const store = openStore(join(data, "harness.db"));
const repo = await inspectRepository(root, "main", null);
store.putRecord("repository", repo.id, repo);
store.putRecord("settings", "current", {
  models: Object.fromEntries(
    aiStages.map((s) => [
      s,
      {
        model: s === "plan" ? "fixture-strong" : "fixture-medium",
        effort: s === "plan" ? "high" : "medium",
      },
    ]),
  ),
});
store.close();
