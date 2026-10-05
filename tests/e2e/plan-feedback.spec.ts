import { test, expect } from "@playwright/test";
import { selectOption } from "../support/select";

test("comment on a step, request a new version and approve it in auto mode", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.getByRole("button", { name: "Tạo task mới", exact: true }).click();
  await page.getByLabel("Tên task").fill("Feedback auto feature");
  await page.getByLabel("Yêu cầu", { exact: true }).fill("feedback auto");
  await page.getByRole("button", { name: "Tạo task" }).click();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeVisible();
  await selectOption(page, "Chế độ thực thi", "Auto sau khi duyệt Plan");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/tasks/${page.url().split("/").at(-1)}`)
          ).json()
        ).task.executionMode,
    )
    .toBe("auto");
  await selectOption(page, "Mục góp ý", /^Bước one:/);
  await page
    .getByLabel("Nội dung góp ý", { exact: true })
    .fill("Giữ nguyên repository hiện có");
  await page.getByRole("button", { name: "Gửi comment", exact: true }).click();
  await expect(
    page.getByText("Giữ nguyên repository hiện có", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeDisabled();
  await page
    .getByRole("button", { name: "Yêu cầu sửa plan", exact: true })
    .click();
  await expect(
    page.getByText("Repair 0/3 · Plan v2", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Duyệt plan" })).toBeEnabled();
  await page.reload();
  await expect(
    page.getByText("Giữ nguyên repository hiện có", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Chế độ thực thi", { exact: true }),
  ).toContainText("Auto sau khi duyệt Plan");
  await page.getByRole("button", { name: "Duyệt plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Đã bàn giao local" }),
  ).toBeVisible({ timeout: 30000 });
});

test("default execution mode is saved in Settings and inherited by new tasks", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.getByRole("link", { name: "Model & skills", exact: true }).click();
  await expect(page.getByLabel("Chế độ mặc định")).toBeVisible();
  await selectOption(page, "Chế độ mặc định", "Auto sau khi duyệt Plan");
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu cấu hình");
  await page.goto("/");
  await page.getByRole("button", { name: "Tạo task mới", exact: true }).click();
  await page.getByLabel("Tên task").fill("Inherited auto");
  await page.getByLabel("Yêu cầu", { exact: true }).fill("auto default");
  await page.getByRole("button", { name: "Tạo task" }).click();
  await expect(
    page.getByLabel("Chế độ thực thi", { exact: true }),
  ).toContainText("Auto sau khi duyệt Plan");
  await page.getByRole("button", { name: "Hủy task" }).click();
  await page.goto("/settings");
  await selectOption(page, "Chế độ mặc định", "Duyệt quyền khi cần");
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu cấu hình");
});
