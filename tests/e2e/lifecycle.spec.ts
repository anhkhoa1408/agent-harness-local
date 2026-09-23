import { test, expect, type Page } from "@playwright/test";
test("unavailable model is rejected; missing skill blocks until settings are repaired", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  const settings = await (await page.request.get("/api/settings")).json(),
    session = await (await page.request.get("/api/session")).json();
  const headers = {
    origin: "http://127.0.0.1:3100",
    "x-harness-csrf": session.csrf,
  };
  const invalid = await page.request.put("/api/settings", {
    headers,
    data: {
      ...settings,
      models: {
        ...settings.models,
        plan: { model: "missing-model", effort: "high" },
      },
    },
  });
  expect(invalid.status()).toBe(400);
  await page.request.put("/api/settings", {
    headers,
    data: {
      ...settings,
      skillRoots: { ...settings.skillRoots, superpowers: "/missing-skills" },
    },
  });
  await create(page, "missing-skill");
  await expect(page.getByText("Bị chặn", { exact: true })).toBeVisible();
  await expect(
    page.getByText("skill_unavailable:superpowers/writing-plans/SKILL.md", {
      exact: true,
    }),
  ).toBeVisible();
  await page.request.put("/api/settings", { headers, data: settings });
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();
  await page.getByRole("button", { name: "Hủy task" }).click();
});
async function create(page: Page, requirement: string) {
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.getByLabel("Tên task").fill(`Feature ${requirement}`);
  await page.getByLabel("Yêu cầu", { exact: true }).fill(requirement);
  await page.getByRole("button", { name: "Tạo task" }).click();
}
test("approval unlocks isolated implementation, repair, review and local report", async ({
  page,
}) => {
  await create(page, "repair");
  await expect(page.getByText("Chờ duyệt plan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Duyệt plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Đã bàn giao local" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("link", { name: "Báo cáo nghiệm thu" }),
  ).toBeVisible();
  await expect(page.getByText("Repair 1/3", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Tests", exact: true }).click();
  await expect(page.getByText("passed", { exact: true })).toBeVisible();
});
test("questions block planning until answered and Python commands need no npm", async ({
  page,
}) => {
  await create(page, "question python");
  await expect(
    page.getByText("Giá trị mặc định là gì?", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Câu trả lời", { exact: true }).fill("Dùng 2");
  await page.getByRole("button", { name: "Gửi câu trả lời" }).click();
  await expect(page.getByText("Chờ duyệt plan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Duyệt plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Đã bàn giao local" }),
  ).toBeVisible({ timeout: 30000 });
});
test("required skipped feature test blocks delivery", async ({ page }) => {
  await create(page, "skip");
  await expect(page.getByText("Chờ duyệt plan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Duyệt plan" }).click();
  await expect(page.getByText("Bị chặn", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByRole("link", { name: "Báo cáo nghiệm thu" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Hủy task" }).click();
});
test("pause and resume at runtime preserves feature branch", async ({
  page,
}) => {
  await create(page, "slow");
  await expect(page.getByText("Chờ duyệt plan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Duyệt plan" }).click();
  await page.getByRole("button", { name: "Tạm dừng" }).click();
  await expect(page.getByText("Đã tạm dừng", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(
    page.getByRole("heading", { name: "Đã bàn giao local" }),
  ).toBeVisible({ timeout: 30000 });
});
test("new plan requires fresh approval; quota never silently switches model", async ({
  page,
}) => {
  await create(page, "replan");
  await expect(page.getByText("Chờ duyệt plan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Duyệt plan" }).click();
  await expect(
    page.getByText("Repair 0/3 · Plan v2", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Báo cáo nghiệm thu" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Duyệt plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Đã bàn giao local" }),
  ).toBeVisible({ timeout: 30000 });
  await create(page, "quota");
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();
  await page.getByRole("button", { name: "Duyệt plan" }).click();
  await expect(page.getByText("quota_exceeded", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Báo cáo nghiệm thu" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Hủy task" }).click();
});
