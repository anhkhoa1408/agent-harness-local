import { beforeEach, afterEach, test, expect, vi } from "vitest";

let notices: Notice[];
class Notice {
  static permission = "granted";
  static fail = false;
  onclick: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(
    public title: string,
    public options: NotificationOptions,
  ) {
    if (Notice.fail) throw new Error("notifications unavailable");
    notices.push(this);
  }
}
const approval = { id: "task:12", taskId: "task", taskTitle: "Feature" };
let focus: ReturnType<typeof vi.fn>, assign: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  notices = [];
  Notice.permission = "granted";
  Notice.fail = false;
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  let locked = false;
  vi.stubGlobal("navigator", {
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        work?: (lock: object | null) => Promise<void> | void,
      ) => {
        const callback =
          work ?? (_options as (lock: object | null) => Promise<void> | void);
        if (locked) return callback(null);
        locked = true;
        try {
          return await callback({});
        } finally {
          locked = false;
        }
      },
    },
  });
  focus = vi.fn();
  assign = vi.fn();
  vi.stubGlobal("window", {
    isSecureContext: true,
    Notification: Notice,
    focus,
    location: { assign },
  });
  vi.stubGlobal("Notification", Notice);
});
afterEach(() => vi.unstubAllGlobals());

test("publishes once across polling, reloads and simultaneous tabs", async () => {
  const first = await import("../../src/lib/approval-notifications");
  const signal = new AbortController().signal;
  const load = async () => [approval];
  await Promise.all([
    first.pollApprovalNotifications(load, signal),
    first.pollApprovalNotifications(load, signal),
  ]);
  await first.pollApprovalNotifications(load, signal);
  vi.resetModules();
  const second = await import("../../src/lib/approval-notifications");
  await second.pollApprovalNotifications(load, signal);
  expect(notices).toHaveLength(1);
  expect(notices[0].options.body).toContain("Feature");
});

test("click focuses the web tab and opens the encoded task and approval", async () => {
  const { pollApprovalNotifications } =
    await import("../../src/lib/approval-notifications");
  await pollApprovalNotifications(
    async () => [{ ...approval, id: "task:12&x", taskId: "task/x" }],
    new AbortController().signal,
  );
  notices[0].onclick!();
  expect(focus).toHaveBeenCalledOnce();
  expect(assign).toHaveBeenCalledWith("/tasks/task%2Fx#approval=task%3A12%26x");
  expect(notices[0].close).toHaveBeenCalledOnce();
});

test("closes resolved notifications and publishes newly requested permissions", async () => {
  const { pollApprovalNotifications } =
    await import("../../src/lib/approval-notifications");
  const signal = new AbortController().signal;
  await pollApprovalNotifications(async () => [approval], signal);
  await pollApprovalNotifications(async () => [], signal);
  expect(notices[0].close).toHaveBeenCalledOnce();
  await pollApprovalNotifications(
    async () => [{ ...approval, id: "task:13" }],
    signal,
  );
  expect(notices).toHaveLength(2);
});

test.each(["default", "denied"])(
  "does not fetch or publish without notification permission: %s",
  async (permission) => {
    Notice.permission = permission;
    const { pollApprovalNotifications } =
      await import("../../src/lib/approval-notifications");
    const load = vi.fn(async () => [approval]);
    await pollApprovalNotifications(load, new AbortController().signal);
    expect(load).not.toHaveBeenCalled();
    expect(notices).toHaveLength(0);
  },
);

test("does not publish a response arriving after the component stopped", async () => {
  const { pollApprovalNotifications } =
    await import("../../src/lib/approval-notifications");
  const controller = new AbortController();
  await pollApprovalNotifications(async () => {
    controller.abort();
    return [approval];
  }, controller.signal);
  expect(notices).toHaveLength(0);
});

test("failed publication can be retried rather than being marked delivered", async () => {
  const { pollApprovalNotifications } =
    await import("../../src/lib/approval-notifications");
  const load = async () => [approval],
    signal = new AbortController().signal;
  Notice.fail = true;
  await expect(pollApprovalNotifications(load, signal)).rejects.toThrow(
    "notifications unavailable",
  );
  Notice.fail = false;
  await pollApprovalNotifications(load, signal);
  expect(notices).toHaveLength(1);
});

test("a feed failure keeps existing pending notifications and does not prevent retry", async () => {
  const { pollApprovalNotifications } =
    await import("../../src/lib/approval-notifications");
  const signal = new AbortController().signal;
  await pollApprovalNotifications(async () => [approval], signal);
  await expect(
    pollApprovalNotifications(async () => {
      throw new Error("offline");
    }, signal),
  ).rejects.toThrow("offline");
  expect(notices[0].close).not.toHaveBeenCalled();
  await pollApprovalNotifications(
    async () => [{ ...approval, id: "task:13" }],
    signal,
  );
  expect(notices).toHaveLength(2);
});

test("an asynchronous native notification error allows the pending request to be retried", async () => {
  const { pollApprovalNotifications } =
    await import("../../src/lib/approval-notifications");
  const load = async () => [approval],
    signal = new AbortController().signal;
  await pollApprovalNotifications(load, signal);
  notices[0].onerror?.();
  await vi.waitFor(async () => {
    await pollApprovalNotifications(load, signal);
    expect(notices).toHaveLength(2);
  });
});
