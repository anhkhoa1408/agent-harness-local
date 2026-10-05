import { test, expect } from "@playwright/test";
import { selectOption } from "../support/select";
test.beforeEach(async ({ context, baseURL }) => {
  await context.request.get(`${baseURL}/session`, {
    headers: { "sec-fetch-mode": "navigate", "sec-fetch-site": "none" },
  });
});

test("navigation marks the active workspace page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Tổng quan/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Model & skills", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "Model & skills", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("link", { name: /Tổng quan/ }),
  ).not.toHaveAttribute("aria-current", "page");
});

test("evidence tabs support keyboard navigation and keep draft feedback during polling", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.getByRole("button", { name: "Tạo task mới", exact: true }).click();
  await page.getByLabel("Tên task").fill("Keyboard evidence");
  await page.getByLabel("Yêu cầu", { exact: true }).fill("keyboard UI");
  await page.getByRole("button", { name: "Tạo task" }).click();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();
  const draft = page.getByLabel("Nội dung góp ý");
  await draft.fill("Bản nháp chưa gửi");
  await expect
    .poll(async () => {
      const data = await (
        await page.request.get(`/api/tasks/${page.url().split("/").at(-1)}`)
      ).json();
      return data.task.status;
    })
    .toBe("waiting_approval");
  await page.waitForTimeout(1400);
  await expect(draft).toHaveValue("Bản nháp chưa gửi");
  const plan = page.getByRole("tab", { name: "Plan", exact: true });
  await plan.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Tests", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Test cũ ngoài plan");
  await page.waitForTimeout(1400);
  await expect(
    page.getByRole("tab", { name: "Tests", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await expect(draft).toHaveValue("Bản nháp chưa gửi");
  await page.getByRole("button", { name: "Hủy task" }).click();
});

test("task detail omits redundant hints and evidence tabs have no vertical overflow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.getByRole("button", { name: "Tạo task mới", exact: true }).click();
  await page.getByLabel("Tên task").fill("Evidence tab overflow");
  await page
    .getByLabel("Yêu cầu", { exact: true })
    .fill("Check evidence layout");
  await page.getByRole("button", { name: "Tạo task" }).click();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const tabs = page.getByRole("tablist", { name: "Evidence" });
    for (const name of ["Plan", "Tests", "Review", "Context"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      const dimensions = await tabs.evaluate((el) => ({
        height: el.clientHeight,
        content: el.scrollHeight,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.height);
      await expect(
        page.getByRole("tab", { name, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    }
  }
  await expect(page.getByText("✓ Xanh: đã xong", { exact: false })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Auto tự chạy các bước", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Chế độ thực thi" }),
  ).not.toHaveAttribute("aria-describedby", "task-execution-mode-hint");
  await page.getByRole("button", { name: "Hủy task" }).click();
});

test("settings save error is an alert and retains the selected model", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("combobox", { name: "Model plan", exact: true }),
  ).toBeVisible();
  await page.route("**/api/settings", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 400, json: { error: "effort_unavailable" } })
      : route.continue(),
  );
  await selectOption(page, "Model plan", "fixture-medium");
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "effort_unavailable",
  );
  await expect(
    page.getByRole("combobox", { name: "Model plan", exact: true }),
  ).toContainText("fixture-medium");
});

test("task form requires input and sends selected repository and delivery mode", async ({
  page,
}) => {
  let submitted: any = null;
  await page.route("**/api/tasks", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 400,
      json: { error: "fixture_submission" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Tạo task mới", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tạo task" })).toBeEnabled();
  await page.getByRole("button", { name: "Tạo task" }).click();
  expect(submitted).toBeNull();
  await page.getByLabel("Tên task").fill("UI payload");
  await page.getByLabel("Yêu cầu", { exact: true }).fill("Kiểm tra payload");
  await page.getByRole("combobox", { name: "Bàn giao", exact: true }).click();
  await page
    .getByRole("option", { name: "GitHub · pull request", exact: true })
    .click();
  await page.getByRole("button", { name: "Tạo task" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "fixture_submission",
  );
  const repos = await (await page.request.get("/api/repositories")).json();
  expect(submitted).toEqual({
    repositoryId: repos[0].id,
    title: "UI payload",
    requirement: "Kiểm tra payload",
    deliveryMode: "github",
  });
});

test("all screens fit mobile and desktop, including long evidence and independent timeline", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tạo task mới", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tạo task" })).toBeEnabled();
  await page.getByLabel("Tên task").fill("Long".repeat(48));
  await page
    .getByLabel("Yêu cầu", { exact: true })
    .fill("UI viewport verification");
  await page.getByRole("button", { name: "Tạo task" }).click();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();
  const taskUrl = page.url();
  const id = taskUrl.split("/").at(-1)!;
  await page.route(`**/api/tasks/${id}`, async (route) => {
    const data = await (await route.fetch()).json();
    data.task.branch = "codex/" + "branch".repeat(65);
    data.runtime = { context: "evidence".repeat(200) };
    await route.fulfill({ json: data });
  });
  await page.route(`**/api/tasks/${id}/events?*`, (route) =>
    route.fulfill({
      json: Array.from({ length: 100 }, (_, index) => ({
        seq: index + 1,
        taskId: id,
        type: `event.${index + 1}`,
        data: {},
        at: Date.now() + index,
      })),
    }),
  );
  const { mkdir } = await import("node:fs/promises");
  await mkdir("/tmp/harness-ui-qa", { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [screen, url] of [
      ["overview", "/"],
      ["settings", "/settings"],
      ["detail", taskUrl],
    ]) {
      await page.goto(url);
      await expect(page.getByRole("navigation")).toBeVisible();
      await expect(page.locator("[data-slot=card]").first()).toBeVisible();
      if (screen === "settings")
        await expect(
          page.getByRole("combobox", { name: "Model plan", exact: true }),
        ).toContainText("fixture-strong");
      if (screen === "detail") {
        await expect(
          page.getByText("codex/" + "branch".repeat(65), { exact: true }),
        ).toBeVisible();
        const timeline = page.getByRole("region", { name: "Sự kiện Timeline" });
        await expect(timeline.locator("strong")).toHaveCount(40);
        const dimensions = await timeline.evaluate((el) => ({
          height: el.clientHeight,
          content: el.scrollHeight,
        }));
        expect(dimensions.height).toBeLessThanOrEqual(width < 1100 ? 350 : 480);
        expect(dimensions.content).toBeGreaterThan(dimensions.height);
        const heading = page.getByRole("heading", {
          name: "Timeline",
          exact: true,
        });
        await timeline.scrollIntoViewIfNeeded();
        const before = await heading.boundingBox();
        await timeline.focus();
        await page.keyboard.press("End");
        await expect
          .poll(() => timeline.evaluate((el) => el.scrollTop))
          .toBeGreaterThan(0);
        expect(await heading.boundingBox()).toEqual(before);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        await page.getByRole("tab", { name: "Context", exact: true }).click();
        await expect(page.locator("pre:visible")).toContainText(
          "evidence".repeat(200),
        );
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `/tmp/harness-ui-qa/${screen}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  }
  await page.unroute(`**/api/tasks/${id}`);
  await page.unroute(`**/api/tasks/${id}/events?*`);
  await page.goto(taskUrl);
  await page.getByRole("button", { name: "Hủy task" }).click();
  await page.route("**/api/codex-auth", (route) =>
    route.fulfill({
      json: { status: "signed_out", authorizationUrl: null, error: null },
    }),
  );
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Đăng nhập với Codex" }),
  ).toBeEnabled();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `/tmp/harness-ui-qa/login-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("task controls stay disabled while a command is pending", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tạo task mới", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tạo task" })).toBeEnabled();
  await page.getByLabel("Tên task").fill("Busy UI action");
  await page
    .getByLabel("Yêu cầu", { exact: true })
    .fill("Busy action verification");
  await page.getByRole("button", { name: "Tạo task" }).click();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();
  let count = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const endpoint = `**/api/tasks/${page.url().split("/").at(-1)}/commands`;
  await page.route(endpoint, async (route) => {
    count++;
    await pending;
    await route.fulfill({ json: { ok: true } });
  });
  const cancel = page.getByRole("button", { name: "Hủy task" });
  await cancel.click();
  await expect(cancel).toBeDisabled();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeDisabled();
  await cancel.evaluate((el) => (el as HTMLButtonElement).click());
  expect(count).toBe(1);
  release();
  await expect(cancel).toBeEnabled();
  await page.unroute(endpoint);
  await cancel.click();
});

test("empty, offline, loading and error feedback remain accessible", async ({
  page,
}) => {
  await page.route("**/api/repositories", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/tasks", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { worker: "offline" } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Workspace đang sẵn sàng" }),
  ).toBeVisible();
  await expect(page.getByText("Worker offline", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tạo task mới", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tạo task" })).toBeDisabled();
  await page.screenshot({
    path: "/tmp/harness-ui-qa/empty-offline.png",
    fullPage: true,
    animations: "disabled",
  });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/codex-auth", async (route) => {
    await pending;
    await route.fulfill({
      json: { status: "signed_out", authorizationUrl: null, error: null },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Đang kiểm tra đăng nhập",
  );
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/harness-ui-qa/loading.png",
    fullPage: true,
    animations: "disabled",
  });
  release();
  await expect(page).toHaveURL(/\/login$/);
  await page.unroute("**/api/codex-auth");
  await page.route("**/api/codex-auth", (route) =>
    route.fulfill({ status: 500, json: { error: "unavailable" } }),
  );
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Không thể kiểm tra đăng nhập",
  );
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/harness-ui-qa/auth-error.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("execution mode exposes its help text to assistive technology", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("combobox", { name: "Chế độ mặc định", exact: true }),
  ).toHaveAccessibleDescription(
    "Áp dụng cho task mới. Auto vẫn yêu cầu duyệt Plan trước khi sửa code và khi thay phạm vi.",
  );
});

test("long Plan comments wrap inside the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Tạo task mới", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tạo task" })).toBeEnabled();
  await page.getByLabel("Tên task").fill("Long comment UI");
  await page
    .getByLabel("Yêu cầu", { exact: true })
    .fill("long comment verification");
  await page.getByRole("button", { name: "Tạo task" }).click();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();
  const comment = "/very/long/path".repeat(100);
  await page.getByLabel("Nội dung góp ý", { exact: true }).fill(comment);
  await page.getByRole("button", { name: "Gửi comment", exact: true }).click();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Hủy task" }).click();
});
