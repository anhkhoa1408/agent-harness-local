import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  collectScreenshots,
  visualChecks,
  verifyImageEvidence,
} from "../../src/infrastructure/execution/ui-verification";
import { fingerprintWorktree } from "../../src/infrastructure/repositories/fingerprint";
import { gitText } from "../../src/infrastructure/repositories/inspect";
import { createTempRepo } from "../support/temp-repo";
import { planFixture, taskFixture } from "../support/task-fixture";
function render(
  component: "UiVerificationPlan" | "ScreenshotLinks",
  props: unknown,
) {
  const script = `import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ${component} } from './src/components/organisms/task-detail/ui-verification.tsx';
    globalThis.React = React;
    console.log(renderToStaticMarkup(React.createElement(${component}, JSON.parse(process.argv[1]))));`;
  return execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      script,
      JSON.stringify(props),
    ],
    { encoding: "utf8" },
  );
}

test("selected UI plan is readable and real browser screenshot becomes frozen verification evidence", async ({
  page,
}) => {
  const f = await createTempRepo({ "app.js": "source" });
  const artifacts = await mkdtemp(join(tmpdir(), "browser-ui-evidence-"));
  try {
    const sourceCommit = await gitText(f.root, ["rev-parse", "HEAD"]);
    const plan = planFixture({
      sourceCommit,
      checks: [{ ...planFixture().checks[0], kind: "e2e" }],
      uiVerification: {
        screenshots: [
          {
            id: "mobile",
            checkId: "feature-unit",
            path: "evidence/mobile.png",
            criterionIds: ["AC-1"],
            viewport: { width: 390, height: 844 },
            referencePath: null,
          },
        ],
      },
    });
    const task = taskFixture({ worktree: f.root, sourceCommit });
    const html = render("UiVerificationPlan", { plan });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`<main>${html}</main>`);
    await expect(
      page.getByRole("heading", { name: "UI Verify" }),
    ).toBeVisible();
    await expect(
      page.getByText("Tiêu chí: AC-1", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("mobile", { exact: true })).toBeVisible();
    await mkdir(join(f.root, "evidence"));
    await page.screenshot({
      path: join(f.root, "evidence/mobile.png"),
      fullPage: false,
    });
    const fingerprint = await fingerprintWorktree(
      f.root,
      ["evidence/mobile.png"],
      sourceCommit,
    );
    const check = {
      id: "feature-unit",
      taskId: task.id,
      planVersion: 1,
      fingerprint,
      status: "passed" as const,
      executed: 1,
      exitCode: 0,
      evidencePath: "/log",
      reason: null,
    };
    const shots = await collectScreenshots(task, plan, [check], artifacts);
    const checks = visualChecks(task, plan, fingerprint, shots, {
      screenshots: [
        {
          id: "mobile",
          passed: true,
          evidence: "Plan selection is visible at mobile viewport",
        },
      ],
    });
    await verifyImageEvidence(checks);
    expect(checks[0].status).toBe("passed");
    expect(shots[0].viewport).toEqual({ width: 390, height: 844 });
    await page.setContent(
      render("ScreenshotLinks", {
        artifacts: [{ id: "ui:mobile", type: "screenshot" }],
      }),
    );
    await expect(
      page.getByRole("link", { name: /Mở ảnh kiểm chứng/ }),
    ).toHaveAttribute("href", "/api/artifacts/ui%3Amobile");
  } finally {
    await f.dispose();
    await rm(artifacts, { recursive: true, force: true });
  }
});
