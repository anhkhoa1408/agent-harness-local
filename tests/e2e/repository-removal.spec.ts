import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { openStore } from "../../src/infrastructure/persistence/store";
import { inspectRepository } from "../../src/infrastructure/repositories/inspect";
import { createTempRepo } from "../support/temp-repo";
import { taskFixture } from "../support/task-fixture";
import { selectOption } from "../support/select";

for (const width of [1440, 390]) {
  test(`repository removal confirms, clears history and resets selected repository at ${width}px`, async ({
    page,
  }) => {
    const repo = await createTempRepo({ "keep.txt": "code" });
    const store = openStore(join(process.env.HARNESS_E2E_DATA!, "harness.db"));
    try {
      const registered = await inspectRepository(repo.root, "main", null);
      store.putRecord("repository", registered.id, registered);
      const task = store.atomic(() => {
        const created = store.createTask(
          taskFixture({
            repositoryId: registered.id,
            title: `Remove history ${width}`,
          }),
        );
        return store.updateTask(
          created.id,
          0,
          { status: "paused" },
          { type: "paused", data: {} },
        );
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const label = `${repo.root.split("/").pop()} · main`;
      await selectOption(page, "Lọc theo repository", label);
      const activity = page.getByRole("region", { name: "Hoạt động gần đây" });
      await expect(activity.getByRole("link")).toHaveCount(1);
      await page
        .getByRole("button", { name: "Tạo task mới", exact: true })
        .click();
      await selectOption(page, "Repository", label);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Đóng", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Quản lý repository", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Quản lý repository",
        exact: true,
      });
      const entry = dialog.getByRole("listitem").filter({ hasText: repo.root });
      await expect(entry).toContainText("1 task");
      await entry.getByRole("button", { name: "Gỡ", exact: true }).click();
      await expect(
        dialog.getByText("Toàn bộ task và lịch sử chạy sẽ bị xoá."),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Huỷ", exact: true }).click();
      expect(store.getRecord("repository", registered.id)).not.toBeNull();
      await entry.getByRole("button", { name: "Gỡ", exact: true }).click();
      await page.screenshot({
        path: `/tmp/harness-ui-qa/repository-removal-${width}.png`,
      });
      await dialog
        .getByRole("button", { name: "Gỡ và xoá lịch sử", exact: true })
        .click();
      await expect(entry).toHaveCount(0);
      expect(store.getRecord("repository", registered.id)).toBeNull();
      expect(() => store.getTask(task.id)).toThrow("task_not_found");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("combobox", { name: "Lọc theo repository" }),
      ).toContainText("Tất cả repository");
      await expect(
        page.getByRole("heading", { name: task.title, exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Tạo task mới", exact: true })
        .click();
      await expect(
        page.getByRole("combobox", { name: "Repository", exact: true }),
      ).not.toContainText(label);
      await page.keyboard.press("Escape");
      await page.reload();
      await page
        .getByRole("button", { name: "Quản lý repository", exact: true })
        .click();
      await expect(
        page.getByRole("dialog").getByText(repo.root, { exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    } finally {
      store.close();
      await repo.dispose();
    }
  });
}

test("management shows removal errors and blocks repositories with running tasks", async ({
  page,
}) => {
  await page.route("**/api/repositories", (route) =>
    route.fulfill({
      json: [
        { id: "busy", root: "/tmp/busy", baseBranch: "main" },
        { id: "race", root: "/tmp/race", baseBranch: "main" },
      ],
    }),
  );
  await page.route("**/api/tasks", (route) =>
    route.fulfill({
      json: [
        {
          id: "busy-task",
          repositoryId: "busy",
          title: "Busy",
          status: "running",
          stage: "analyze",
          pipeline: [],
        },
      ],
    }),
  );
  await page.route("**/api/repositories/race", (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: "repository_busy",
        details: ["Dừng task trước khi gỡ repository."],
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Quản lý repository", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Quản lý repository",
    exact: true,
  });
  await expect(
    dialog
      .getByRole("listitem")
      .filter({ hasText: "/tmp/busy" })
      .getByRole("button", { name: "Gỡ", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("listitem")
    .filter({ hasText: "/tmp/race" })
    .getByRole("button", { name: "Gỡ", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Gỡ và xoá lịch sử", exact: true })
    .click();
  await expect(
    dialog.getByText(/Dừng task trước khi gỡ repository/),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Gỡ và xoá lịch sử", exact: true }),
  ).toBeEnabled();
});
