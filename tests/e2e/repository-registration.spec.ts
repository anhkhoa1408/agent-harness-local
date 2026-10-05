import { test, expect } from "@playwright/test";
import { createTempRepo } from "../support/temp-repo";

test("registration shows the missing branch reason and preserves input for retry", async ({
  page,
}) => {
  const repo = await createTempRepo({});
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Đăng ký repository", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Đăng ký repository",
      exact: true,
    });
    await dialog.getByLabel("Đường dẫn repo").fill(repo.root);
    await dialog.getByLabel("Nhánh nguồn").fill("missing");
    await dialog
      .getByRole("button", { name: "Đăng ký repo", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Không tìm thấy nhánh “missing”",
    );
    await expect(dialog.getByLabel("Đường dẫn repo")).toHaveValue(repo.root);
    await expect(dialog.getByLabel("Nhánh nguồn")).toHaveValue("missing");
    await dialog.getByLabel("Nhánh nguồn").fill("main");
    await dialog
      .getByRole("button", { name: "Đăng ký repo", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  } finally {
    await repo.dispose();
  }
});
