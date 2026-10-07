export type PendingApproval = { id: string; taskId: string; taskTitle: string };

// Keep notification handles across workspace navigation so later polls can close them.
const notifications = new Map<string, Notification>();
const seenKey = "harness:approval-notifications";

export function notificationsSupported() {
  return (
    window.isSecureContext && "Notification" in window && !!navigator.locks
  );
}

export async function pollApprovalNotifications(
  load: () => Promise<PendingApproval[]>,
  signal: AbortSignal,
) {
  if (
    !notificationsSupported() ||
    Notification.permission !== "granted" ||
    signal.aborted
  )
    return;
  await navigator.locks.request(
    seenKey,
    { ifAvailable: true },
    async (lock) => {
      if (!lock || signal.aborted) return;
      const pending = await load();
      if (signal.aborted || Notification.permission !== "granted") return;
      const active = new Set(pending.map((approval) => approval.id));
      for (const [id, notification] of notifications) {
        if (!active.has(id)) {
          notification.close();
          notifications.delete(id);
        }
      }
      const seen = new Set<string>(
        JSON.parse(localStorage.getItem(seenKey) ?? "[]"),
      );
      for (const approval of pending) {
        if (seen.has(approval.id) || notifications.has(approval.id)) continue;
        const notification = new Notification(
          "Agent Harness — Cần duyệt quyền",
          {
            body: `Task “${approval.taskTitle}” đang cần quyền thực thi. Nhấn để xem.`,
            tag: `approval:${approval.id}`,
          },
        );
        notification.onclick = () => {
          window.focus();
          notification.close();
          window.location.assign(
            `/tasks/${encodeURIComponent(approval.taskId)}#approval=${encodeURIComponent(approval.id)}`,
          );
        };
        notification.onerror = () => {
          void navigator.locks
            .request(seenKey, () => {
              if (notifications.get(approval.id) !== notification) return;
              notifications.delete(approval.id);
              const delivered = JSON.parse(
                localStorage.getItem(seenKey) ?? "[]",
              ) as string[];
              localStorage.setItem(
                seenKey,
                JSON.stringify(delivered.filter((id) => id !== approval.id)),
              );
            })
            .catch(() => {});
        };
        notifications.set(approval.id, notification);
        seen.add(approval.id);
        localStorage.setItem(seenKey, JSON.stringify([...seen]));
      }
      localStorage.setItem(
        seenKey,
        JSON.stringify([...seen].filter((id) => active.has(id))),
      );
    },
  );
}
