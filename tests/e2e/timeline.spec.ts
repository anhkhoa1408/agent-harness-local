import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`Timeline scrolls independently at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Tạo task mới", exact: true })
      .click();
    await expect(page.getByRole("button", { name: "Tạo task" })).toBeEnabled();
    await page.getByLabel("Tên task").fill(`Timeline ${width}`);
    await page
      .getByLabel("Yêu cầu", { exact: true })
      .fill("timeline verification");
    await page.getByRole("button", { name: "Tạo task" }).click();
    await expect(
      page.getByRole("button", { name: "Duyệt plan" }),
    ).toBeVisible();
    const taskId = page.url().split("/").at(-1)!;
    await page.route(`**/api/tasks/${taskId}/events?*`, (route) =>
      route.fulfill({
        json: Array.from({ length: 100 }, (_, index) => ({
          seq: index + 1,
          taskId,
          type: `event.${index + 1}`,
          data: {},
          at: 1791170000000 + index * 1000,
        })),
      }),
    );
    await page.reload();
    const list = page.getByRole("region", { name: "Sự kiện Timeline" });
    await expect(list).toBeVisible();
    await expect(list.locator("strong")).toHaveCount(40);
    await expect(list.locator("strong").first()).toHaveText("event.100");
    await expect(list.locator("strong").last()).toHaveText("event.61");
    await list.scrollIntoViewIfNeeded();
    const heading = page.getByRole("heading", {
      name: "Timeline",
      exact: true,
    });
    const before = await heading.boundingBox();
    const dimensions = await list.evaluate((el) => ({
      height: el.clientHeight,
      content: el.scrollHeight,
    }));
    expect(dimensions.height).toBeLessThanOrEqual(width < 1100 ? 350 : 480);
    expect(dimensions.content).toBeGreaterThan(dimensions.height);
    await list.focus();
    await page.keyboard.press("End");
    await expect
      .poll(() => list.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await expect(list.locator("strong").last()).toBeInViewport();
    expect(await heading.boundingBox()).toEqual(before);
    await page.unroute(`**/api/tasks/${taskId}/events?*`);
    await page.getByRole("button", { name: "Hủy task" }).click();
  });
}
