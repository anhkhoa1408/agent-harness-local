type Notice = {
  closed: boolean;
  onclick: () => void;
  onerror: () => void;
  options: NotificationOptions;
};
type NotificationWindow = Window & {
  notices: Notice[];
  nativeNotifications: { shown: number; errors: number; body: string };
};
import { test, expect, type BrowserContext } from "@playwright/test";
import { taskFixture } from "../support/task-fixture";
test.use({ headless: false });

const approval = {
  id: "notification-task:12",
  taskId: "notification-task",
  taskTitle: "Permission feature",
};
async function setup(
  context: BrowserContext,
  permission = "default",
  native = false,
) {
  if (!native)
    await context.addInitScript((permission) => {
      const notices: DesktopNotification[] = [];
      (window as unknown as NotificationWindow).notices = notices as Notice[];
      class DesktopNotification {
        static permission = permission;
        static requests = 0;
        static async requestPermission() {
          DesktopNotification.requests++;
          DesktopNotification.permission = "granted";
          return "granted";
        }
        closed = false;
        onclick: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(
          public title: string,
          public options: NotificationOptions,
        ) {
          notices.push(this);
        }
        close() {
          this.closed = true;
        }
      }
      Object.defineProperty(window, "Notification", {
        value: DesktopNotification,
        configurable: true,
      });
    }, permission);
  await context.route("**/api/codex-auth", (route) =>
    route.fulfill({
      json: { status: "authenticated", authorizationUrl: null, error: null },
    }),
  );
  await context.route("**/api/repositories", (route) =>
    route.fulfill({ json: [] }),
  );
  await context.route("**/api/tasks", (route) => route.fulfill({ json: [] }));
  await context.route("**/api/health", (route) =>
    route.fulfill({ json: { worker: "online" } }),
  );
  let pending = [approval];
  await context.route("**/api/approvals", (route) =>
    route.fulfill({ json: pending }),
  );
  await context.route("**/api/tasks/notification-task", (route) =>
    route.fulfill({
      json: {
        task: {
          ...taskFixture(),
          id: approval.taskId,
          title: approval.taskTitle,
          status: "running",
          executionMode: "manual",
        },
        pipeline: [],
        approvals: pending.map((a) => ({
          id: a.id,
          params: { command: "npm test" },
        })),
        analysis: null,
        plan: null,
        comments: [],
        checks: null,
        review: null,
        acceptance: null,
        delivery: null,
        runtime: null,
        artifacts: [],
        diff: "",
      },
    }),
  );
  await context.route("**/api/tasks/notification-task/events?*", (route) =>
    route.fulfill({ json: [] }),
  );
  return {
    resolve: () => {
      pending = [];
    },
    requestNext: () => {
      pending = [{ ...approval, id: "notification-task:13" }];
    },
  };
}

test.beforeEach(async ({ context, baseURL }) => {
  await context.request.get(`${baseURL}/session`, {
    headers: { "sec-fetch-mode": "navigate", "sec-fetch-site": "none" },
  });
});

test("enabling notifications publishes pending permission and clicking opens and focuses its approval", async ({
  page,
  context,
}) => {
  await setup(context);
  await page.goto("/");
  const enable = page.getByRole("button", {
    name: "Bật thông báo",
    exact: true,
  });
  await expect(enable).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        (Notification as typeof Notification & { requests: number }).requests,
    ),
  ).toBe(0);
  await enable.click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as NotificationWindow).notices.length,
      ),
    )
    .toBe(1);
  const sibling = await context.newPage();
  await sibling.goto("/");
  await expect(sibling.getByRole("navigation")).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as NotificationWindow).notices[0].onclick(),
  );
  await expect(page).toHaveURL(
    /\/tasks\/notification-task#approval=notification-task%3A12$/,
  );
  const card = page.locator('[id="approval-notification-task:12"]');
  await expect(
    card.getByRole("button", { name: "Cho phép", exact: true }),
  ).toBeVisible();
  await expect(card).toBeFocused();
  expect(await page.evaluate(() => document.hasFocus())).toBe(true);
});

test("multiple background tabs and reloads publish once, then resolution closes the notification", async ({
  page,
  context,
}) => {
  const fixture = await setup(context, "granted");
  const second = await context.newPage();
  await Promise.all([page.goto("/"), second.goto("/")]);
  await expect
    .poll(
      async () =>
        (await page.evaluate(
          () => (window as unknown as NotificationWindow).notices.length,
        )) +
        (await second.evaluate(
          () => (window as unknown as NotificationWindow).notices.length,
        )),
    )
    .toBe(1);
  await page.waitForTimeout(3500);
  expect(
    (await page.evaluate(
      () => (window as unknown as NotificationWindow).notices.length,
    )) +
      (await second.evaluate(
        () => (window as unknown as NotificationWindow).notices.length,
      )),
  ).toBe(1);
  const owner = (await page.evaluate(
    () => (window as unknown as NotificationWindow).notices.length,
  ))
    ? page
    : second;
  const other = owner === page ? second : page;
  await other.reload();
  await expect(other.getByRole("navigation")).toBeVisible();
  expect(
    await other.evaluate(
      () => (window as unknown as NotificationWindow).notices.length,
    ),
  ).toBe(0);
  fixture.resolve();
  await expect
    .poll(() =>
      owner.evaluate(
        () => (window as unknown as NotificationWindow).notices[0].closed,
      ),
    )
    .toBe(true);
});

test("expired deep link explains the request was already handled", async ({
  page,
  context,
}) => {
  const fixture = await setup(context, "granted");
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as NotificationWindow).notices.length,
      ),
    )
    .toBe(1);
  fixture.resolve();
  await page.evaluate(() =>
    (window as unknown as NotificationWindow).notices[0].onclick(),
  );
  await expect(
    page.getByText("Yêu cầu quyền này đã được xử lý hoặc hết hiệu lực.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cho phép", exact: true }),
  ).toHaveCount(0);
});

test("denied notification permission explains browser settings and keeps the approval usable", async ({
  page,
  context,
}) => {
  await setup(context, "denied");
  await page.goto("/tasks/notification-task");
  await expect(
    page.getByText("Thông báo bị chặn. Bật lại trong cài đặt trình duyệt.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cho phép", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => (window as unknown as NotificationWindow).notices.length,
    ),
  ).toBe(0);
});

test.describe("Native desktop notifications", () => {
  test("native browser notification reports show for a pending approval", async ({
    page,
    context,
    baseURL,
  }) => {
    await setup(context, "granted", true);
    await context.grantPermissions(["notifications"], { origin: baseURL });
    await context.addInitScript(() => {
      (window as unknown as NotificationWindow).nativeNotifications = {
        shown: 0,
        errors: 0,
        body: "",
      };
      const NativeNotification = window.Notification;
      window.Notification = new Proxy(NativeNotification, {
        construct(target, args) {
          const notice = Reflect.construct(target, args) as Notification;
          (window as unknown as NotificationWindow).nativeNotifications.body =
            notice.body;
          notice.addEventListener(
            "show",
            () =>
              (window as unknown as NotificationWindow).nativeNotifications
                .shown++,
          );
          notice.addEventListener(
            "error",
            () =>
              (window as unknown as NotificationWindow).nativeNotifications
                .errors++,
          );
          return notice;
        },
      });
    });
    await page.goto("/");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as NotificationWindow).nativeNotifications.shown,
        ),
      )
      .toBe(1);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as NotificationWindow).nativeNotifications.errors,
      ),
    ).toBe(0);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as NotificationWindow).nativeNotifications.body,
      ),
    ).toContain("Permission feature");
  });
});

test("reloading the notification owner suppresses the old request and receives a new one", async ({
  page,
  context,
}) => {
  const fixture = await setup(context, "granted");
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as NotificationWindow).notices.length,
      ),
    )
    .toBe(1);
  await page.reload();
  await expect(
    page.getByText("Thông báo đã bật", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as NotificationWindow).notices.length,
    ),
  ).toBe(0);
  fixture.requestNext();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as NotificationWindow).notices.length,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(
      () => (window as unknown as NotificationWindow).notices[0].options.tag,
    ),
  ).toBe("approval:notification-task:13");
});

test("asynchronous notification errors release the shared claim for the next poll", async ({
  page,
  context,
}) => {
  await setup(context, "granted");
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as NotificationWindow).notices.length,
      ),
    )
    .toBe(1);
  await page.evaluate(() =>
    (window as unknown as NotificationWindow).notices[0].onerror(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as NotificationWindow).notices.length,
      ),
    )
    .toBe(2);
});
