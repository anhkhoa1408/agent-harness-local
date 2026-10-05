import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context, baseURL }) => {
  await context.request.get(`${baseURL}/session`, {
    headers: { "sec-fetch-mode": "navigate", "sec-fetch-site": "none" },
  });
});

for (const path of ["/", "/settings", "/tasks/not-signed-in"]) {
  test(`signed-out visitor to ${path} sees only the centered login button`, async ({
    page,
  }) => {
    await page.route("**/api/codex-auth", (route) =>
      route.fulfill({
        json: { status: "signed_out", authorizationUrl: null, error: null },
      }),
    );
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    const button = page.getByRole("button", {
      name: "Đăng nhập với Codex",
      exact: true,
    });
    await expect(button).toBeEnabled();
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(1);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(
        Math.abs(box!.x + box!.width / 2 - viewport.width / 2),
      ).toBeLessThan(2);
      expect(
        Math.abs(box!.y + box!.height / 2 - viewport.height / 2),
      ).toBeLessThan(2);
    }
  });
}

test("OAuth success closes the popup and opens dashboard, including after reload", async ({
  page,
  context,
}) => {
  let authenticated = false;
  const authorizationUrl =
    "https://auth.openai.com/oauth/authorize?response_type=code&state=fixture&code_challenge=fixture&redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback";
  await page.route("**/api/codex-auth", (route) =>
    route.fulfill({
      json: {
        status: authenticated
          ? "authenticated"
          : route.request().method() === "POST"
            ? "waiting"
            : "signed_out",
        authorizationUrl:
          route.request().method() === "POST" ? authorizationUrl : null,
        error: null,
      },
    }),
  );
  await context.route("https://auth.openai.com/**", async (route) => {
    authenticated = true;
    await route.fulfill({
      contentType: "text/html",
      body: "<h1>Fixture OAuth</h1>",
    });
  });
  await page.goto("/login");
  const popupReady = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Đăng nhập với Codex", exact: true })
    .click();
  const popup = await popupReady;
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBe(true);
  await page.reload();
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.goto("/login");
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/$/);
});

test("expired login keeps visitor on login and allows retry", async ({
  page,
  context,
}) => {
  let status = "signed_out";
  await page.route("**/api/codex-auth", (route) => {
    if (route.request().method() === "POST") status = "waiting";
    return route.fulfill({
      json: {
        status,
        authorizationUrl: null,
        error: status === "error" ? "login_expired" : null,
      },
    });
  });
  await page.goto("/login");
  const button = page.getByRole("button", {
    name: "Đăng nhập với Codex",
    exact: true,
  });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    "Hoàn tất đăng nhập trên trang OpenAI.",
  );
  status = "error";
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "hết thời gian",
  );
  await expect(button).toBeEnabled();
  await expect(page).toHaveURL(/\/login$/);
  for (const popup of context.pages().filter((p) => p !== page))
    await popup.close();
});

test("failed auth check never shows dashboard", async ({ page }) => {
  await page.route("**/api/codex-auth", (route) =>
    route.fulfill({ status: 500, json: { error: "unavailable" } }),
  );
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByText("Worker sẵn sàng")).toHaveCount(0);
});
