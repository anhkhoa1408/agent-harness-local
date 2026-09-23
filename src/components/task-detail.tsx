"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { stages, type Event, type ControlCommand } from "../core/contracts";
import { api, stageLabel, statusLabel } from "./api";
export function TaskDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<any>(null),
    [events, setEvents] = useState<Event[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("plan"),
    cursor = useRef(0);
  async function load() {
    try {
      const [d, e] = await Promise.all([
        api(`tasks/${id}`),
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
  const {
    task,
    plan,
    analysis,
    checks,
    review,
    delivery,
    acceptance,
    runtime,
  } = detail;
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
      <ol className="pipeline">
        {stages.map((s, index) => (
          <li
            key={s}
            className={
              s === task.stage
                ? "current"
                : stages.indexOf(task.stage) > index
                  ? "done"
                  : ""
            }
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {stageLabel[s]}
          </li>
        ))}
      </ol>
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
                ? "Kiểm tra đường dẫn skill trong Settings rồi tiếp tục."
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
      {task.status === "waiting_input" && (
        <section className="panel">
          <h2>Làm rõ yêu cầu</h2>
          {analysis?.questions?.map((q: any) => (
            <div key={q.id}>
              <p>
                <strong>{q.question}</strong>
              </p>
              <p className="muted">Đề xuất: {q.recommendation}</p>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void command("answer", {
                answer: new FormData(e.currentTarget).get("answer"),
              });
            }}
          >
            <label>
              Câu trả lời
              <textarea name="answer" required rows={3} />
            </label>
            <button className="primary" disabled={busy}>
              Gửi câu trả lời
            </button>
          </form>
        </section>
      )}
      {detail.approvals.map((a: any) => (
        <section className="panel" key={a.id}>
          <h2>Agent cần quyền thực thi</h2>
          <pre>{JSON.stringify(a.params, null, 2)}</pre>
          <button
            onClick={() => command("grant", { id: a.id, decision: "accept" })}
          >
            Cho phép
          </button>{" "}
          <button
            onClick={() => command("grant", { id: a.id, decision: "decline" })}
          >
            Từ chối
          </button>
        </section>
      ))}
      <div className="detail-grid">
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
          {tab === "plan" &&
            (plan ? (
              <>
                <h2>{plan.scope}</h2>
                <p className="hint">
                  Source {plan.sourceCommit.slice(0, 12)} · Version{" "}
                  {plan.version}
                </p>
                <h3>Acceptance criteria</h3>
                {plan.criteria.map((c: any) => (
                  <p key={c.id}>
                    <strong>{c.id}</strong> {c.description}
                    <br />
                    <small>{c.checkIds.join(", ")}</small>
                  </p>
                ))}
                <h3>Các bước thực hiện</h3>
                {plan.steps.map((s: any) => (
                  <details key={s.id} open>
                    <summary>
                      {s.id} · {s.description}
                    </summary>
                    <p>{s.files.join(", ")}</p>
                    <p className="hint">
                      Inputs: {s.inputs}
                      <br />
                      Outputs: {s.outputs}
                      <br />
                      Kiểm tra: {s.verification}
                    </p>
                  </details>
                ))}
                <h3>Test plan</h3>
                {plan.checks.map((c: any) => (
                  <pre key={c.id}>
                    {c.id} · {c.kind} · {c.required ? "required" : "optional"}
                    {`\n`}
                    {JSON.stringify([c.executable, ...c.args])}
                    {`\n`}cwd: {c.cwd} · timeout: {c.timeoutMs}ms · min tests:{" "}
                    {c.minimumTests}
                  </pre>
                ))}
                <h3>Phạm vi ngoài / môi trường</h3>
                <pre>
                  {JSON.stringify(
                    {
                      outOfScope: plan.outOfScope,
                      dependencies: plan.dependencies,
                      environment: plan.environment,
                      unresolved: plan.unresolved,
                    },
                    null,
                    2,
                  )}
                </pre>
                {task.status === "waiting_approval" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      command("approve", { version: plan.version })
                    }
                  >
                    Duyệt plan
                  </button>
                )}
              </>
            ) : (
              <div className="empty">
                <p>Plan sẽ xuất hiện sau khi requirement đã rõ.</p>
              </div>
            ))}
          {tab === "diff" && (
            <pre>{detail.diff || "Chưa có thay đổi tracked."}</pre>
          )}
          {tab === "tests" && (
            <>
              <p className="hint">
                Test cũ ngoài plan không chạy và không được tính là pass.
              </p>
              {checks?.map((c: any) => (
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
                .filter((a: any) => a.type === "context")
                .map((a: any) => (
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
        <aside className="panel timeline">
          <h2>Timeline</h2>
          {events
            .slice(-40)
            .reverse()
            .map((e) => (
              <div key={e.seq}>
                <span className="timeline-dot" />
                <strong>{e.type}</strong>
                <time>{new Date(e.at).toLocaleTimeString("vi-VN")}</time>
                {e.type === "command.rejected" && (
                  <p className="alert">{JSON.stringify(e.data)}</p>
                )}
              </div>
            ))}
        </aside>
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
