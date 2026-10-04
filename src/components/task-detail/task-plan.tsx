import type { TaskDetailData, TaskCommand } from "./types";
export function TaskPlan({
  task,
  plan,
  busy,
  command,
}: Pick<TaskDetailData, "task" | "plan"> & {
  busy: boolean;
  command: TaskCommand;
}) {
  return plan ? (
    <>
      <h2>{plan.scope}</h2>
      <p className="hint">
        Source {plan.sourceCommit.slice(0, 12)} · Version {plan.version}
      </p>
      <h3>Acceptance criteria</h3>
      {plan.criteria.map((c) => (
        <p key={c.id}>
          <strong>{c.id}</strong> {c.description}
          <br />
          <small>{c.checkIds.join(", ")}</small>
        </p>
      ))}
      <h3>Các bước thực hiện</h3>
      {plan.steps.map((s) => (
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
      {plan.checks.map((c) => (
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
          onClick={() => command("approve", { version: plan.version })}
        >
          Duyệt plan
        </button>
      )}
    </>
  ) : (
    <div className="empty">
      <p>Plan sẽ xuất hiện sau khi requirement đã rõ.</p>
    </div>
  );
}
