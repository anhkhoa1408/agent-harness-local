import { test, expect, type Page } from "@playwright/test";
import { createTempRepo } from "../support/temp-repo";
test("unavailable model is rejected; stale skill roots cannot override bundled context", async ({
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
  const portable = await (await page.request.get("/api/settings")).json();
  expect(portable).not.toHaveProperty("skillRoots");
  await create(page, "bundled-skills");
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();
  const pipeline = page.getByRole("list", { name: "Tiến độ pipeline" });
  await expect(pipeline.locator('[data-stage="discover"]')).toHaveAttribute(
    "data-state",
    "done",
  );
  await expect(pipeline.locator('[data-stage="plan"]')).toHaveAttribute(
    "data-state",
    "current",
  );
  await expect(pipeline.locator('[data-stage="implement"]')).toHaveAttribute(
    "data-state",
    "pending",
  );
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
  await page.getByRole("tab", { name: "Diff", exact: true }).click();
  await expect(page.locator("pre")).toContainText("module.exports=2");
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(page.locator("pre").first()).toContainText('"verdict": "pass"');
  await page.getByRole("tab", { name: "Context", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Model hiện tại" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Context / }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Timeline", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Test plan", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toHaveCount(0);
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
  await expect(
    page.getByRole("listitem", { name: "Kiểm thử: Bị chặn", exact: true }),
  ).toBeVisible({
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

test("settings expose fixed effort and mapped agents, preserving models on save", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.getByRole("link", { name: "⚙ Model & skills" }).click();
  await expect(
    page.getByRole("heading", { name: "Agent theo stage", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Skill roots", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByText("Effort high", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Effort medium", { exact: true })).toHaveCount(5);
  await expect(page.getByRole("combobox", { name: /Effort/ })).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Model plan", exact: true }),
  ).toHaveValue("fixture-strong");
  await expect(
    page.getByRole("combobox", { name: "Model review", exact: true }),
  ).toHaveValue("fixture-medium");
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu cấu hình");
  const settings = await (await page.request.get("/api/settings")).json();
  expect(settings.models.plan.effort).toBe("high");
  expect(settings.models.review.effort).toBe("medium");
});

test("pipeline circles track pause, completion and skipped repair on dashboard and detail", async ({
  page,
}) => {
  await create(page, "slow pipeline");
  const pipeline = page.getByRole("list", { name: "Tiến độ pipeline" });
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();
  await expect(pipeline.locator('[data-stage="plan"]')).toContainText(
    "Chờ duyệt",
  );
  await page.getByRole("button", { name: "Duyệt plan" }).click();
  await expect(pipeline.locator('[data-stage="plan"]')).toHaveAttribute(
    "data-state",
    "done",
  );
  await expect(pipeline.locator('[data-stage="implement"]')).toHaveAttribute(
    "data-state",
    "current",
  );
  await page.getByRole("button", { name: "Tạm dừng" }).click();
  await expect(pipeline).toContainText("Tạm dừng");
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(
    page.getByRole("heading", { name: "Đã bàn giao local" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(pipeline.locator('[data-stage="deliver"]')).toHaveAttribute(
    "data-state",
    "done",
  );
  await expect(pipeline.locator('[data-stage="repair"]')).toHaveAttribute(
    "data-state",
    "skipped",
  );
  await page.getByRole("link", { name: "← Workspace" }).click();
  const card = page.getByRole("link").filter({
    has: page.getByRole("heading", {
      name: "Feature slow pipeline",
      exact: true,
    }),
  });
  await expect(card.locator('[data-stage="deliver"]')).toHaveAttribute(
    "data-state",
    "done",
  );
  await expect(card.locator('[data-stage="repair"]')).toHaveAttribute(
    "data-state",
    "skipped",
  );
});

test("repository registration reports errors and selects the registered repository", async ({
  page,
}) => {
  const repo = await createTempRepo({ "README.md": "UI registration fixture" });
  try {
    await page.goto("/");
    await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
    await page.getByText("+ Đăng ký repository", { exact: true }).click();
    await page
      .getByLabel("Đường dẫn repo", { exact: true })
      .fill("/missing-harness-refactor-repo");
    await page
      .getByRole("button", { name: "Đăng ký repo", exact: true })
      .click();
    await expect(page.locator("p[role=alert]")).toContainText("request_failed");
    await page.getByLabel("Đường dẫn repo", { exact: true }).fill(repo.root);
    await page
      .getByRole("button", { name: "Đăng ký repo", exact: true })
      .click();
    await expect(page.locator("p[role=alert]")).toHaveCount(0);
    const repositories = await (
      await page.request.get("/api/repositories")
    ).json();
    const registered = repositories.find(
      (r: { root: string }) => r.root === repo.root,
    );
    expect(registered).toBeDefined();
    await expect(
      page.getByRole("combobox", { name: "Repository", exact: true }),
    ).toHaveValue(registered.id);
    await expect(page.getByRole("button", { name: "Tạo task" })).toBeEnabled();
  } finally {
    await repo.dispose();
  }
});

test("model settings report save errors without losing stage selections", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.getByRole("link", { name: "⚙ Model & skills" }).click();
  await expect(
    page.getByRole("combobox", { name: "Model plan", exact: true }),
  ).toHaveValue("fixture-strong");
  await page
    .getByRole("combobox", { name: "Model plan", exact: true })
    .selectOption("fixture-medium");
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByRole("status")).toContainText("effort_unavailable");
  await expect(
    page.getByRole("combobox", { name: "Model plan", exact: true }),
  ).toHaveValue("fixture-medium");
  const settings = await (await page.request.get("/api/settings")).json();
  expect(settings.models.plan.model).toBe("fixture-strong");
});
