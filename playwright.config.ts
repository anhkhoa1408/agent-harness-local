import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const data =
  process.env.HARNESS_E2E_DATA ?? mkdtempSync(join(tmpdir(), "harness-e2e-"));
process.env.HARNESS_E2E_DATA = data;
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: { PORT: "3100", HARNESS_TEST_MODE: "1", HARNESS_DATA_DIR: data },
  },
  reporter: "list",
});
