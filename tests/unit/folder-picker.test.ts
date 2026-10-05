import { test, expect } from "vitest";
import { createFolderPicker } from "../../src/server/folder-picker";

test("returns the selected absolute path without losing spaces", async () => {
  const pick = createFolderPicker("darwin", async () => ({
    stdout: "/Users/me/my project /\n",
  }));
  expect(await pick()).toBe("/Users/me/my project ");
});

test("cancel returns null", async () => {
  const pick = createFolderPicker("darwin", async () => ({ stdout: "\n" }));
  expect(await pick()).toBeNull();
});

test("unsupported systems leave manual entry available without launching a dialog", async () => {
  const pick = createFolderPicker("linux", async () => {
    throw new Error("unexpected_launch");
  });
  await expect(pick()).rejects.toThrow("folder_picker_unsupported");
});

test("only one dialog opens at a time, and cancellation releases it", async () => {
  let finish!: (result: { stdout: string }) => void;
  const pick = createFolderPicker(
    "darwin",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = pick();
  await expect(pick()).rejects.toThrow("folder_picker_busy");
  finish({ stdout: "\n" });
  expect(await first).toBeNull();
  const next = pick();
  finish({ stdout: "/tmp/repo/\n" });
  expect(await next).toBe("/tmp/repo");
});

test("dialog failures are sanitized and allow retry", async () => {
  let fail = true;
  const pick = createFolderPicker("darwin", async () => {
    if (fail) throw new Error("private system error");
    return { stdout: "/tmp/repo/\n" };
  });
  await expect(pick()).rejects.toThrow("folder_picker_failed");
  fail = false;
  expect(await pick()).toBe("/tmp/repo");
});
