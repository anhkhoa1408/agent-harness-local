"use client";
let csrf = "";
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (method !== "GET" && !csrf) {
    const session = await api<{ csrf: string }>("session");
    csrf = session.csrf;
  }
  const response = await fetch(`/api/${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(csrf ? { "x-harness-csrf": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  if (response.status === 403) {
    // A full navigation is required to bootstrap the local session cookie.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/session");
    throw new Error("Đang mở phiên local…");
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error + (result.details ? `: ${result.details.join(", ")}` : ""),
    );
  return result;
}
export const statusLabel: Record<string, string> = {
  queued: "Trong hàng đợi",
  running: "Đang chạy",
  waiting_input: "Cần làm rõ",
  waiting_approval: "Chờ duyệt plan",
  blocked: "Bị chặn",
  paused: "Đã tạm dừng",
  interrupted: "Cần khôi phục",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  failed: "Thất bại",
};
export const stageLabel: Record<string, string> = {
  discover: "Khám phá repo",
  analyze: "Phân tích yêu cầu",
  plan: "Lập kế hoạch",
  prepare: "Chuẩn bị worktree",
  implement: "Implement",
  verify: "Kiểm thử",
  review: "Review độc lập",
  repair: "Sửa lỗi",
  deliver: "Bàn giao",
};
