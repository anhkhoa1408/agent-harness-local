import { test, expect } from "@playwright/test";
import { selectOption } from "../support/select";
import type { Repository } from "../../src/domain/contracts";
import type { TaskWithProgress } from "../../src/domain/pipeline-progress";

const repos: Repository[] = ["alpha", "beta", "empty"].map((id) => ({
  id,
  root: `/tmp/${id}`,
  baseBranch: "main",
  remote: null,
  head: "a".repeat(40),
  dirty: false,
}));
const tasks: TaskWithProgress[] = ["alpha", "beta"].map((repositoryId) => ({
  id: `${repositoryId}-task`,
  repositoryId,
  title: `Task ${repositoryId}`,
  requirement: "Fixture",
  sourceCommit: "a".repeat(40),
  targetBranch: "main",
  deliveryMode: "local",
  executionMode: "manual",
  models: {} as TaskWithProgress["models"],
  stage: "discover",
  status: "queued",
  reason: null,
  revision: 0,
  planVersion: null,
  approvedPlanVersion: null,
  repairCount: 0,
  worktree: null,
  branch: `codex/${repositoryId}`,
  resumeStage: null,
  createdAt: 0,
  updatedAt: 0,
  pipeline: [],
}));

test.beforeEach(async ({ page }) => {
  await page.route("**/api/repositories", (route) =>
    route.fulfill({ json: repos }),
  );
  await page.route("**/api/tasks", (route) => route.fulfill({ json: tasks }));
});

for (const width of [390, 1440]) {
  test(`workspace dialogs fit ${width}px and return focus on close`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByLabel("Tên task")).toHaveCount(0);
    const trigger = page.getByRole("button", {
      name: "Tạo task mới",
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Tạo task mới",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(
      Math.min(640, width - 32),
    );
    const submit = dialog.getByRole("button", {
      name: "Tạo task",
      exact: true,
    });
    await expect(submit.locator("svg")).toHaveCount(0);
    expect(
      await submit.evaluate((el) => getComputedStyle(el).justifyContent),
    ).toBe("center");
    await page.screenshot({
      path: `/tmp/harness-ui-qa/task-dialog-${width}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page
      .getByRole("button", { name: "Đăng ký repository", exact: true })
      .click();
    const repository = page.getByRole("dialog", {
      name: "Đăng ký repository",
      exact: true,
    });
    await expect(repository.getByLabel("Đường dẫn repo")).toBeVisible();
    expect((await repository.boundingBox())!.width).toBeLessThanOrEqual(
      Math.min(640, width - 32),
    );
    await page.screenshot({
      path: `/tmp/harness-ui-qa/repository-dialog-${width}.png`,
    });
    await repository.getByRole("button", { name: "Đóng" }).click();
    await expect(repository).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test("recent activity uses full width and filters tasks by repository", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const activity = page.getByRole("region", { name: "Hoạt động gần đây" });
  await expect(activity.getByRole("link")).toHaveCount(2);
  const stats = page
    .getByText("Tổng task", { exact: true })
    .locator("xpath=../../..");
  expect((await activity.boundingBox())!.width).toBeCloseTo(
    (await stats.boundingBox())!.width,
    0,
  );
  await selectOption(page, "Lọc theo repository", "alpha · main");
  await expect(activity.getByRole("link")).toHaveCount(1);
  await expect(
    activity.getByRole("heading", { name: "Task alpha", exact: true }),
  ).toBeVisible();
  await expect(activity.getByText("1 task", { exact: true })).toBeVisible();
  await page.waitForTimeout(3200);
  await expect(activity.getByRole("link")).toHaveCount(1);
  await selectOption(page, "Lọc theo repository", "empty · main");
  await expect(activity.getByRole("link")).toHaveCount(0);
  await expect(activity.getByText("0 task", { exact: true })).toBeVisible();
  await expect(
    activity.getByRole("heading", { name: "Repository chưa có task" }),
  ).toBeVisible();
  await selectOption(page, "Lọc theo repository", "Tất cả repository");
  await expect(activity.getByRole("link")).toHaveCount(2);
  await page.screenshot({
    path: "/tmp/harness-ui-qa/workspace-dialogs.png",
    fullPage: true,
  });
});
