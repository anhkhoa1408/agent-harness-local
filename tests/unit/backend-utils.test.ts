import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, rm, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planKey, storyKey } from "../../src/domain/utils/record-key";
import { errorMessage } from "../../src/application/utils";
import { contentHash } from "../../src/infrastructure/utils/content-hash";
import { contained } from "../../src/infrastructure/utils/contained-path";
import { waitForRetry } from "../../src/infrastructure/codex/utils/retry-delay";

afterEach(() => vi.useRealTimers());

test("record keys retain version separators, including the legacy null plan lookup", () => {
  expect(planKey("task", 2)).toBe("task:2");
  expect(planKey("task", null)).toBe("task:null");
  expect(
    storyKey({ featureId: "task", planVersion: 2, storyId: "story-1" }),
  ).toBe("task:2:story-1");
});

test("error messages preserve Error text and each caller's non-Error fallback", () => {
  expect(errorMessage(new Error(""), "request_failed")).toBe("");
  expect(errorMessage(new Error("failure"), "request_failed")).toBe("failure");
  expect(errorMessage(null, "request_failed")).toBe("request_failed");
  expect(errorMessage(42, String)).toBe("42");
  expect(errorMessage(undefined, String)).toBe("undefined");
});

test("content hashing retains UTF-8 text and base64 screenshot input contracts", () => {
  expect(contentHash("abc")).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  expect(contentHash("YWJj")).toBe(
    "35d95694d3f160215db293c7899daa5907837838fb4b8119ed713e32446c1266",
  );
  expect(contentHash("abc")).not.toBe(contentHash("YWJj"));
});

test("contained paths support new descendants and reject traversal or escaping symlinks", async () => {
  const temp = await mkdtemp(join(tmpdir(), "harness-utils-"));
  try {
    const root = join(temp, "root");
    await mkdir(root);
    await mkdir(join(temp, "outside"));
    await symlink(join(temp, "outside"), join(root, "escape"));
    await symlink(root, join(root, "inside"));
    const resolved = await realpath(root);
    expect(await contained(root, "new/path.txt")).toBe(
      join(resolved, "new/path.txt"),
    );
    expect(await contained(root, "inside/new.txt")).toBe(
      join(resolved, "new.txt"),
    );
    await expect(contained(root, "../outside/a")).rejects.toThrow(
      "path_outside_root",
    );
    await expect(contained(root, "escape/new.txt")).rejects.toThrow(
      "path_outside_root",
    );
    await expect(contained(root, join(temp, "outside"))).rejects.toThrow(
      "path_outside_root",
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("retry delay respects the deadline and caps exponential growth", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  let settled = false;
  const pending = waitForRetry(80, 1020).then((delay) => {
    settled = true;
    return delay;
  });
  await vi.advanceTimersByTimeAsync(19);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe(160);
  const capped = waitForRetry(160, 2000);
  await vi.advanceTimersByTimeAsync(160);
  expect(await capped).toBe(200);
});
