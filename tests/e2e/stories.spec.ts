import { test, expect } from "@playwright/test";
async function create(
  page: import("@playwright/test").Page,
  title: string,
  requirement = "stories feature",
) {
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.getByRole("button", { name: "Tạo task mới", exact: true }).click();
  await page.getByLabel("Tên task").fill(title);
  await page.getByLabel("Yêu cầu", { exact: true }).fill(requirement);
  await page.getByLabel("Chia thành stories để chọn").check();
  await page.getByRole("button", { name: "Tạo task", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Duyệt plan", exact: true }),
  ).toBeVisible();
}
test("shared PR selection, dependency validation, checkpoint pause, resume and completion", async ({
  page,
}) => {
  await create(page, "Shared stories");
  await page.getByLabel("Một PR cho toàn feature", { exact: true }).check();
  await page.getByLabel("Chọn story B", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Duyệt plan", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Thiếu story phụ thuộc: A")).toBeVisible();
  await page.getByLabel("Chọn story A", { exact: true }).check();
  await page
    .getByRole("group", { name: "Chọn stories để thực hiện" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/private/tmp/harness-story-picker.png" });
  await page.getByRole("button", { name: "Duyệt plan", exact: true }).click();
  await expect(
    page.getByText("Story A · Hoàn thành", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("button", { name: "Tiếp tục", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Story A · Hoàn thành", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(
    page.getByText("Story B · Hoàn thành", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Đã bàn giao local" }),
  ).toBeVisible({ timeout: 30000 });
  const id = page.url().split("/").at(-1),
    detail = await (await page.request.get(`/api/tasks/${id}`)).json();
  expect(detail.stories.runs).toHaveLength(2);
  expect(
    detail.stories.runs.every(
      (r: import("../../src/domain/contracts").StoryRun) =>
        r.commit && r.state === "completed",
    ),
  ).toBe(true);
  expect(
    new Set(
      detail.stories.runs.map(
        (r: import("../../src/domain/contracts").StoryRun) => r.commit,
      ),
    ).size,
  ).toBe(2);
  await page.screenshot({ path: "/private/tmp/harness-story-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText("Story A · Hoàn thành", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/private/tmp/harness-story-mobile.png" });
});
test("separate deliveries use child tasks, only selected stories run", async ({
  page,
}) => {
  await create(page, "Separate story");
  await page.getByLabel("PR riêng từng story", { exact: true }).check();
  await page.getByLabel("Chọn story A", { exact: true }).check();
  await page.getByRole("button", { name: "Duyệt plan", exact: true }).click();
  await expect(
    page.getByText("Story A · Hoàn thành", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByText("Story B · Chưa chọn", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Mở task của story A" }),
  ).toBeVisible();
  await expect(
    page.getByText("Pipeline thực thi nằm trong từng task của story.", {
      exact: true,
    }),
  ).toBeVisible();
  const id = page.url().split("/").at(-1);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/tasks/${id}`)).json()).task.status,
    )
    .toBe("completed");
});
test("automatic continuation runs shared stories and final checks", async ({
  page,
}) => {
  await create(page, "Auto shared stories");
  await page.getByLabel("Một PR cho toàn feature", { exact: true }).check();
  await page.getByLabel("Chọn story A", { exact: true }).check();
  await page.getByLabel("Chọn story B", { exact: true }).check();
  await page.getByLabel("Tự tiếp tục các stories đã chọn").check();
  await page.getByRole("button", { name: "Duyệt plan", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Đã bàn giao local" }),
  ).toBeVisible({ timeout: 30000 });
});

test("replan after checkpoint keeps selection locked and resumes remaining story", async ({
  page,
}) => {
  await create(page, "Replan story feature", "story-replan");
  await page.getByLabel("Một PR cho toàn feature", { exact: true }).check();
  await page.getByLabel("Chọn story A", { exact: true }).check();
  await page.getByLabel("Chọn story B", { exact: true }).check();
  await page.getByRole("button", { name: "Duyệt plan", exact: true }).click();
  await expect(
    page.getByText("Story A · Hoàn thành", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(
    page.getByText("Repair 0 · Plan v2", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel("Chọn story A", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Chọn story A", { exact: true })).toBeDisabled();
  await expect(
    page.getByLabel("Một PR cho toàn feature", { exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Duyệt plan", exact: true }).click();
  await expect(
    page.getByText("Story B · Hoàn thành", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Đã bàn giao local" }),
  ).toBeVisible({ timeout: 30000 });
});
test("interruption in second story retains first checkpoint and resume completes", async ({
  page,
}) => {
  await create(page, "Interrupted story feature", "story-interrupt");
  await page.getByLabel("Một PR cho toàn feature", { exact: true }).check();
  await page.getByLabel("Chọn story A", { exact: true }).check();
  await page.getByLabel("Chọn story B", { exact: true }).check();
  await page.getByLabel("Tự tiếp tục các stories đã chọn").check();
  await page.getByRole("button", { name: "Duyệt plan", exact: true }).click();
  await expect(page.getByText("quota_exceeded", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByText("Story A · Hoàn thành", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Đã bàn giao local" }),
  ).toBeVisible({ timeout: 30000 });
  const detail = await (
    await page.request.get(`/api/tasks/${page.url().split("/").at(-1)}`)
  ).json();
  expect(
    detail.stories.runs.every(
      (r: import("../../src/domain/contracts").StoryRun) =>
        r.state === "completed",
    ),
  ).toBe(true);
});
