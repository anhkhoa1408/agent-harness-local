import Link from "next/link";
import type { TaskWithProgress } from "../../core/pipeline-progress";
import { Pipeline } from "../pipeline";
import { statusLabel, stageLabel } from "../api";
export function TaskList({ tasks }: { tasks: TaskWithProgress[] }) {
  return (
    <>
      <div className="section-heading">
        <h2>Hoạt động gần đây</h2>
        <span className="muted">{tasks.length} task</span>
      </div>
      <div className="task-list">
        {tasks.length ? (
          tasks.map((t) => (
            <Link className="task-card" href={`/tasks/${t.id}`} key={t.id}>
              <div className="task-card-body">
                <span
                  className={`badge ${t.status === "completed" ? "good" : ""}`}
                >
                  {statusLabel[t.status]}
                </span>
                <h3>{t.title}</h3>
                <p>
                  {stageLabel[t.stage]} · {t.branch}
                </p>
                <Pipeline nodes={t.pipeline} compact />
              </div>
              <span className="arrow">↗</span>
            </Link>
          ))
        ) : (
          <div className="empty">
            <span>◫</span>
            <h3>Workspace đang sẵn sàng</h3>
            <p>
              Thêm repo và tạo task đầu tiên.
              <br />
              Mọi tiến trình sẽ xuất hiện ở đây.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
