"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type Event, type ControlCommand } from "../core/contracts";
import { Pipeline } from "./pipeline";
import { api, statusLabel } from "./api";
import type { TaskDetailData } from "./task-detail/types";
import { TaskRequests } from "./task-detail/task-requests";
import { TaskEvidence } from "./task-detail/task-evidence";
import { TaskTimeline } from "./task-detail/task-timeline";
export function TaskDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<TaskDetailData | null>(null),
    [events, setEvents] = useState<Event[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    cursor = useRef(0);
  async function load() {
    try {
      const [d, e] = await Promise.all([
        api<TaskDetailData>(`tasks/${id}`),
        api<Event[]>(`tasks/${id}/events?after=${cursor.current}`),
      ]);
      setDetail(d);
      if (e.length) {
        cursor.current = e.at(-1)!.seq;
        setEvents((old) =>
          [...old, ...e].filter(
            (v, i, a) => a.findIndex((x) => x.seq === v.seq) === i,
          ),
        );
      }
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(load, 1000);
    return () => clearInterval(timer);
  }, [id]);
  async function command(kind: ControlCommand["kind"], payload: unknown = {}) {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      await api(`tasks/${id}/commands`, "POST", {
        id: crypto.randomUUID(),
        kind,
        expectedRevision: detail.task.revision,
        payload,
      });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!detail) return <p>{error || "Đang tải task…"}</p>;
  const { task, analysis, delivery } = detail;
  const terminal = ["completed", "cancelled"].includes(task.status);
  return (
    <>
      <Link className="back" href="/">
        ← Workspace
      </Link>
      <div className="heading">
        <div>
          <p className="eyebrow">FEATURE TASK · {id.slice(0, 8)}</p>
          <h1>{task.title}</h1>
          <p className="muted">{task.branch}</p>
        </div>
        <span
          className={`badge ${terminal ? "good" : task.status === "blocked" ? "warn" : ""}`}
        >
          {delivery?.mode === "local"
            ? "Đã bàn giao local"
            : statusLabel[task.status]}
        </span>
      </div>
      <Pipeline nodes={detail.pipeline} />
      <p className="pipeline-legend">
        ✓ Xanh: đã xong · Cam: đang xử lý hoặc chờ · Đen: chưa chạy / không cần
        chạy
      </p>
      <div className="actions">
        {task.status === "running" && (
          <button disabled={busy} onClick={() => command("pause")}>
            Tạm dừng
          </button>
        )}
        {["paused", "interrupted", "blocked"].includes(task.status) && (
          <button
            disabled={busy || task.reason === "runtime_state_unknown"}
            onClick={() => command("resume")}
          >
            Tiếp tục
          </button>
        )}
        {!terminal && (
          <button disabled={busy} onClick={() => command("cancel")}>
            Hủy task
          </button>
        )}
        <span className="muted">
          Repair {task.repairCount}/3 · Plan v{task.planVersion ?? "—"}
        </span>
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {task.reason && (
        <div className="alert">
          <strong>{task.reason}</strong>
          <p>
            {task.reason === "runtime_state_unknown"
              ? "Runtime cũ chưa được xác nhận đã dừng. Cần đối chiếu process trước khi resume."
              : task.reason.includes("skill_")
                ? "Bộ skill đi kèm ứng dụng đang thiếu. Khôi phục thư mục skills từ repository rồi tiếp tục."
                : task.reason.includes("model_")
                  ? "Cập nhật model cho task ở bên dưới rồi tiếp tục."
                  : "Xem evidence và cấu hình; giải quyết nguyên nhân trước khi tiếp tục."}
          </p>
          {task.stage === "deliver" && (
            <button
              onClick={() => command("configure", { deliveryMode: "local" })}
            >
              Chuyển bàn giao local
            </button>
          )}
        </div>
      )}
      <TaskRequests
        task={task}
        analysis={analysis}
        approvals={detail.approvals}
        busy={busy}
        command={command}
      />
      <div className="detail-grid">
        <TaskEvidence detail={detail} busy={busy} command={command} />
        <TaskTimeline events={events} />
      </div>
      {!terminal && task.status !== "running" && (
        <details className="panel">
          <summary>Đổi model của task tại stage boundary</summary>
          <p className="hint">
            Lưu Settings trước, sau đó áp dụng vào task này. Approval plan hiện
            tại được giữ nguyên nếu scope không đổi.
          </p>
          <button
            onClick={async () => {
              try {
                const s = await api("settings");
                await command("configure", { models: s.models });
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Áp dụng model từ Settings
          </button>
        </details>
      )}
    </>
  );
}
