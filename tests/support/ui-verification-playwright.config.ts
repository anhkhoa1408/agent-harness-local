import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

// This browser proof uses fixture HTML and needs no dashboard or worker server.
export default defineConfig({
  testDir: join(import.meta.dirname, "../e2e"),
  testMatch: "ui-verification-artifacts.spec.ts",
  workers: 1,
  timeout: 30000,
  reporter: "list",
  outputDir: join(tmpdir(), "harness-ui-verify-playwright-results"),
  use: { headless: true },
});
