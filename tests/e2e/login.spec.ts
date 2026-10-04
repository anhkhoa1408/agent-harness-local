import { test, expect } from "@playwright/test";

test("browser OAuth page opens provider, detects login and keeps the saved session on reload", async ({
  page,
  context,
}) => {
  let authenticated = false;
  const authorizationUrl =
    "https://auth.openai.com/oauth/authorize?response_type=code&state=fixture&code_challenge=fixture&redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback";
  await page.route("**/api/codex-auth", async (route) => {
    const starting = route.request().method() === "POST";
    await route.fulfill({
      json: {
        status: authenticated
          ? "authenticated"
          : starting
            ? "waiting"
            : "signed_out",
        authorizationUrl: starting ? authorizationUrl : null,
        error: null,
      },
    });
  });
  await context.route("https://auth.openai.com/**", async (route) => {
    authenticated = true;
    await route.fulfill({
      contentType: "text/html",
      body: "<h1>Fixture OAuth</h1>",
    });
  });
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.getByRole("link", { name: "↗ Đăng nhập Codex" }).click();
  await expect(
    page.getByRole("button", { name: "Đăng nhập với OpenAI" }),
  ).toBeEnabled();
  const popupReady = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Đăng nhập với OpenAI" }).click();
  const popup = await popupReady;
  await expect.poll(() => authenticated).toBe(true);
  await expect(page.getByRole("status")).toHaveText("Đã đăng nhập Codex.");
  await expect.poll(() => popup.isClosed()).toBe(true);
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Đã đăng nhập Codex.");
  await expect(page.getByRole("link", { name: "Chọn model →" })).toBeVisible();
});

test("pending OAuth can be cancelled and failed login can be retried", async ({
  page,
  context,
}) => {
  let status = "signed_out";
  await page.route("**/api/codex-auth", async (route) => {
    if (route.request().method() === "POST") status = "waiting";
    await route.fulfill({
      json: {
        status,
        authorizationUrl: null,
        error: status === "error" ? "login_expired" : null,
      },
    });
  });
  await page.route("**/api/codex-auth/cancel", async (route) => {
    status = "signed_out";
    await route.fulfill({
      json: { status, authorizationUrl: null, error: null },
    });
  });
  await page.goto("/");
  await expect(page.getByText("Worker sẵn sàng")).toBeVisible();
  await page.getByRole("link", { name: "↗ Đăng nhập Codex" }).click();
  await page.getByRole("button", { name: "Đăng nhập với OpenAI" }).click();
  await expect(
    page.getByRole("button", { name: "Hủy đăng nhập" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hủy đăng nhập" }).click();
  await expect(
    page.getByRole("button", { name: "Đăng nhập với OpenAI" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Đăng nhập với OpenAI" }).click();
  status = "error";
  await expect(
    page.getByRole("alert").filter({ hasText: "Phiên đăng nhập" }),
  ).toContainText("hết thời gian");
  await expect(
    page.getByRole("button", { name: "Đăng nhập với OpenAI" }),
  ).toBeEnabled();
  for (const popup of context.pages().filter((p) => p !== page))
    await popup.close();
});
