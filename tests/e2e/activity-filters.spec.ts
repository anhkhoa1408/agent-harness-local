import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`Recent activity filters compose and limit results at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const tasks = Array.from({ length: 16 }, (_, index) => ({
      id: `activity-${index}`,
      title: `Activity ${index}`,
      repositoryId: index < 6 ? "repo-a" : "repo-b",
      status:
        index >= 12 ? "running" : index % 2 === 0 ? "completed" : "cancelled",
      stage: "deliver",
      branch: `codex/activity-${index}`,
      pipeline: [],
    }));
    await page.route("**/api/tasks", (route) => route.fulfill({ json: tasks }));
    await page.route("**/api/repositories", (route) =>
      route.fulfill({
        json: [
          { id: "repo-a", root: "/tmp/alpha", baseBranch: "main" },
          { id: "repo-b", root: "/tmp/beta", baseBranch: "main" },
        ],
      }),
    );
    await page.goto("/");
    const activity = page.getByRole("region", { name: "Hoạt động gần đây" });
    const cards = activity.getByRole("link");
    await expect(cards).toHaveCount(3);
    await expect(
      activity.getByText("3 / 4 task", { exact: true }),
    ).toBeVisible();
    await expect(cards.first()).toContainText("Activity 12");
    const status = page.getByRole("combobox", { name: "Lọc theo trạng thái" });
    await expect(status).toContainText("Đang chạy");
    await status.click();
    await page
      .getByRole("option", { name: "Tất cả trạng thái", exact: true })
      .click();
    const count = page.getByRole("combobox", { name: "Số hoạt động hiển thị" });
    await count.click();
    await expect(page.getByRole("option")).toHaveText([
      "3 hoạt động",
      "9 hoạt động",
      "12 hoạt động",
    ]);
    await page
      .getByRole("option", { name: "9 hoạt động", exact: true })
      .click();
    await expect(cards).toHaveCount(9);
    await count.click();
    await page
      .getByRole("option", { name: "12 hoạt động", exact: true })
      .click();
    await expect(cards).toHaveCount(12);
    await status.click();
    await expect(page.getByRole("option")).toHaveCount(11);
    await page.getByRole("option", { name: "Hoàn thành", exact: true }).click();
    await expect(cards).toHaveCount(6);
    await page.getByRole("combobox", { name: "Lọc theo repository" }).click();
    await page
      .getByRole("option", { name: "beta · main", exact: true })
      .click();
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText("Activity 6");
    await status.click();
    await page.getByRole("option", { name: "Đã hủy", exact: true }).click();
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText("Activity 7");
    await count.click();
    await page
      .getByRole("option", { name: "3 hoạt động", exact: true })
      .click();
    await expect(cards).toHaveCount(3);
    await expect(
      activity.getByText("3 / 3 task", { exact: true }),
    ).toBeVisible();
    await status.click();
    await page.getByRole("option", { name: "Thất bại", exact: true }).click();
    await expect(cards).toHaveCount(0);
    await expect(
      activity.getByText("Không có hoạt động phù hợp", { exact: true }),
    ).toBeVisible();
    await expect(
      activity.getByText("0 / 0 task", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
