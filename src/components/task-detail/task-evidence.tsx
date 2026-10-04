import { useState } from "react";
import { TaskPlan } from "./task-plan";
import type { TaskDetailData, TaskCommand } from "./types";
export function TaskEvidence({
  detail,
  busy,
  command,
}: {
  detail: TaskDetailData;
  busy: boolean;
  command: TaskCommand;
}) {
  const [tab, setTab] = useState("plan");
  const { task, plan, checks, review, delivery, acceptance, runtime } = detail;
  const id = task.id;
  return (
    <section className="panel">
      <div className="tabs" role="tablist">
        {["plan", "diff", "tests", "review", "context"].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {
              {
                plan: "Plan",
                diff: "Diff",
                tests: "Tests",
                review: "Review",
                context: "Context",
              }[t]
            }
          </button>
        ))}
      </div>
      {tab === "plan" && (
        <TaskPlan task={task} plan={plan} busy={busy} command={command} />
      )}
      {tab === "diff" && (
        <pre>{detail.diff || "Chưa có thay đổi tracked."}</pre>
      )}
      {tab === "tests" && (
        <>
          <p className="hint">
            Test cũ ngoài plan không chạy và không được tính là pass.
          </p>
          {checks?.map((c) => (
            <div className="check-row" key={c.id}>
              <strong>{c.id}</strong>
              <span
                className={`badge ${c.status === "passed" ? "good" : "warn"}`}
              >
                {c.status}
              </span>
              <p>
                {c.executed ?? "?"} tests · {c.reason || c.evidencePath}
              </p>
            </div>
          ))}
          {!checks && <p>Chưa có kết quả kiểm thử.</p>}
        </>
      )}
      {tab === "review" && (
        <>
          <pre>
            {review ? JSON.stringify(review, null, 2) : "Chưa có review."}
          </pre>
          {acceptance && <pre>{JSON.stringify(acceptance, null, 2)}</pre>}
        </>
      )}
      {tab === "context" && (
        <>
          <h3>Model hiện tại</h3>
          <pre>{JSON.stringify(runtime ?? task.models, null, 2)}</pre>
          {detail.artifacts
            .filter((a) => a.type === "context")
            .map((a) => (
              <p key={a.id}>
                <a href={`/api/artifacts/${a.id}`} target="_blank">
                  Context {a.id.slice(0, 12)} ↗
                </a>
              </p>
            ))}
        </>
      )}
      {delivery && (
        <div className="notice">
          <h3>
            {delivery.mode === "local"
              ? "Đã bàn giao local"
              : "Đã tạo pull request"}
          </h3>
          <a href={`/api/artifacts/${id}-delivery`} target="_blank">
            Báo cáo nghiệm thu
          </a>
          {delivery.prUrl && (
            <p>
              <a href={delivery.prUrl} target="_blank" rel="noreferrer">
                Mở pull request ↗
              </a>
            </p>
          )}
          <p className="hint">Commit {delivery.commit}</p>
        </div>
      )}
    </section>
  );
}
