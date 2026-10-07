"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import {
  notificationsSupported,
  pollApprovalNotifications,
  type PendingApproval,
} from "@/lib/approval-notifications";

export function PermissionNotifications() {
  const [permission, setPermission] = useState<
    NotificationPermission | "loading" | "unsupported"
  >("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () =>
      setPermission(
        notificationsSupported() ? Notification.permission : "unsupported",
      );
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    if (permission !== "granted") return;
    const controller = new AbortController();
    const poll = async () => {
      if (Notification.permission !== "granted") {
        setPermission(Notification.permission);
        return;
      }
      try {
        await pollApprovalNotifications(
          () =>
            api<PendingApproval[]>(
              "approvals",
              "GET",
              undefined,
              AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
            ),
          controller.signal,
        );
        if (!controller.signal.aborted) setError("");
      } catch {
        if (!controller.signal.aborted)
          setError("Không thể nhận thông báo. Đang thử lại…");
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [permission]);
  async function enable() {
    setBusy(true);
    setError("");
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      setError("Không thể bật thông báo. Thử lại trong trình duyệt.");
    } finally {
      setBusy(false);
    }
  }
  if (permission === "loading") return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {permission === "default" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void enable()}
        >
          Bật thông báo
        </Button>
      ) : (
        <span role="status">
          {permission === "granted"
            ? "Thông báo đã bật"
            : permission === "denied"
              ? "Thông báo bị chặn. Bật lại trong cài đặt trình duyệt."
              : "Trình duyệt chưa hỗ trợ thông báo."}
        </span>
      )}
      {error && <span role="status">{error}</span>}
    </div>
  );
}
