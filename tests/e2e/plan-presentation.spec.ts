import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("long plan steps have a readable overview and keyboard-accessible details without losing content", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.getByRole("button", { name: "Tạo task mới", exact: true }).click();
  await page.getByLabel("Tên task").fill("Readable plan");
  await page.getByLabel("Yêu cầu", { exact: true }).fill("Plan presentation");
  await page.getByRole("button", { name: "Tạo task" }).click();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();
  const endpoint = `**/api/tasks/${page.url().split("/").at(-1)}`;
  const longPath = `tests/canvas/${"long-directory/".repeat(15)}canvas.spec.ts`;
  await page.route(endpoint, async (route) => {
    const data = await (await route.fetch()).json();
    const step = data.plan.steps[0];
    data.plan.steps = [
      {
        ...step,
        id: "S1",
        description:
          "Bổ sung test harness tối thiểu. Thêm @playwright/test phiên bản 1.56.1. Chạy node tests/canvas/run-e2e.mjs. Giữ exit code; dọn server trong finally.",
        files: ["package.json", longPath],
        inputs: "Repo dùng Next 16.0.1. Chưa có test framework.",
        outputs: "Bảy test E2E. Báo cáo tại artifacts/canvas/e2e.xml.",
        verification:
          "Chạy npm run test:canvas. Phân biệt lỗi feature với lỗi setup.",
      },
      {
        ...step,
        id: "S2",
        description: "Tạo CanvasScene",
        dependsOn: ["S1"],
        files: ["app/canvas/_components/CanvasScene.tsx"],
      },
    ];
    await route.fulfill({ json: data });
  });
  await page.reload();

  const overview = page.getByRole("list", { name: "Các bước thực hiện" });
  const first = overview.getByRole("listitem").filter({
    has: page.getByRole("heading", {
      name: "Bổ sung test harness tối thiểu.",
      exact: true,
    }),
  });
  const second = overview.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "Tạo CanvasScene", exact: true }),
  });
  const details = first.getByRole("button", {
    name: "Chi tiết bước S1",
    exact: true,
  });
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await expect(first.locator("code")).toHaveText(["package.json", longPath]);
  await expect(
    first.getByText("Thêm @playwright/test phiên bản 1.56.1.", { exact: true }),
  ).not.toBeVisible();
  await expect(second.getByText("Sau bước: S1", { exact: true })).toBeVisible();

  await details.focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("aria-expanded", "true");
  for (const label of ["Việc cần làm", "Đầu vào", "Kết quả", "Cách kiểm tra"]) {
    await expect(
      first.getByRole("heading", { name: label, exact: true }),
    ).toBeVisible();
  }
  for (const sentence of [
    "Thêm @playwright/test phiên bản 1.56.1.",
    "Chạy node tests/canvas/run-e2e.mjs.",
    "Giữ exit code; dọn server trong finally.",
    "Repo dùng Next 16.0.1.",
    "Chưa có test framework.",
    "Bảy test E2E.",
    "Báo cáo tại artifacts/canvas/e2e.xml.",
    "Chạy npm run test:canvas.",
    "Phân biệt lỗi feature với lỗi setup.",
  ]) {
    await expect(
      first.getByRole("listitem").filter({ hasText: sentence }),
    ).toContainText(sentence);
    await expect(first.getByText(sentence, { exact: true })).toBeVisible();
  }
  await mkdir("/tmp/harness-plan-qa", { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await overview.screenshot({
      path: `/tmp/harness-plan-qa/steps-${width}.png`,
    });
  }
  await details.focus();
  await page.keyboard.press("Space");
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await second
    .getByRole("button", { name: "Chi tiết bước S2", exact: true })
    .click();
  await expect(
    second.getByText("Tạo CanvasScene", { exact: true }),
  ).toHaveCount(1);
  await expect(
    second.getByRole("heading", { name: "Kết quả", exact: true }),
  ).toBeVisible();
  await page.unroute(endpoint);
  await page.getByRole("button", { name: "Hủy task" }).click();
});
