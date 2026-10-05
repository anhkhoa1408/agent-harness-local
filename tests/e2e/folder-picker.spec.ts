import { test, expect } from "@playwright/test";
import { createTempRepo } from "../support/temp-repo";

test("Browse fills the form and registers a real Git repository", async ({
  page,
}) => {
  const repo = await createTempRepo({});
  try {
    await page.route("**/api/repositories/pick-folder", (route) =>
      route.fulfill({ json: { path: repo.root } }),
    );
    await page.goto("/");
    await page
      .getByRole("button", { name: "Đăng ký repository", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Chọn thư mục…", exact: true })
      .click();
    await expect(page.getByLabel("Đường dẫn repo")).toHaveValue(repo.root);
    await page.getByLabel("Nhánh nguồn").fill("main");
    await page
      .getByRole("button", { name: "Đăng ký repo", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Tạo task mới", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Repository", exact: true }),
    ).toContainText(repo.root.split("/").pop()!);
  } finally {
    await repo.dispose();
  }
});

test("cancel preserves typed path; errors allow manual entry and retry", async ({
  page,
}) => {
  let mode = "cancel";
  await page.route("**/api/repositories/pick-folder", (route) =>
    route.fulfill({
      status: mode === "cancel" ? 200 : 503,
      json:
        mode === "cancel" ? { path: null } : { error: "folder_picker_failed" },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Đăng ký repository", exact: true })
    .click();
  const path = page.getByLabel("Đường dẫn repo");
  const browse = page.getByRole("button", {
    name: "Chọn thư mục…",
    exact: true,
  });
  await path.fill("/tmp/manual-repo");
  await browse.click();
  await expect(browse).toBeEnabled();
  await expect(path).toHaveValue("/tmp/manual-repo");
  mode = "error";
  await browse.click();
  await expect(
    page
      .getByRole("dialog", { name: "Đăng ký repository", exact: true })
      .getByRole("alert"),
  ).toContainText("Không thể mở");
  await expect(browse).toBeEnabled();
  await path.fill("/tmp/another-repo");
  mode = "cancel";
  await browse.click();
  await expect(
    page
      .getByRole("dialog", { name: "Đăng ký repository", exact: true })
      .getByRole("alert"),
  ).toHaveCount(0);
  await expect(path).toHaveValue("/tmp/another-repo");
});

test("collapsing repository form preserves branch and remote input", async ({
  page,
}) => {
  await page.goto("/");
  const toggle = page.getByRole("button", {
    name: "+ Đăng ký repository",
    exact: true,
  });
  await toggle.click();
  await page
    .getByLabel("Đường dẫn repo", { exact: true })
    .fill("/tmp/repo-draft");
  await page.getByLabel("Nhánh nguồn", { exact: true }).fill("develop");
  await page.getByLabel("Remote (để trống nếu local)").fill("upstream");
  await toggle.click();
  await expect(page.getByLabel("Nhánh nguồn", { exact: true })).toBeHidden();
  await toggle.click();
  await expect(page.getByLabel("Đường dẫn repo", { exact: true })).toHaveValue(
    "/tmp/repo-draft",
  );
  await expect(page.getByLabel("Nhánh nguồn", { exact: true })).toHaveValue(
    "develop",
  );
  await expect(page.getByLabel("Remote (để trống nếu local)")).toHaveValue(
    "upstream",
  );
});
