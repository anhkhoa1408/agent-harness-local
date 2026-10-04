import type { TaskDetailData, TaskCommand } from "./types";
export function TaskRequests({
  task,
  analysis,
  approvals,
  busy,
  command,
}: Pick<TaskDetailData, "task" | "analysis" | "approvals"> & {
  busy: boolean;
  command: TaskCommand;
}) {
  return (
    <>
      {task.status === "waiting_input" && (
        <section className="panel">
          <h2>Làm rõ yêu cầu</h2>
          {analysis?.questions?.map((q) => (
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
      {approvals.map((a) => (
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
    </>
  );
}
