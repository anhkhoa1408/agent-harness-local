import type { TaskWithProgress } from "../../core/pipeline-progress";
export function WorkspaceOverview({
  tasks,
  health,
}: {
  tasks: TaskWithProgress[];
  health: string;
}) {
  return (
    <>
      <div className="heading">
        <div>
          <p className="eyebrow">BUILD WITH INTENTION</p>
        </div>
        <span className={`badge ${health === "online" ? "good" : "warn"}`}>
          Worker {health === "online" ? "sẵn sàng" : "offline"}
        </span>
      </div>
      <div className="stats">
        <div>
          <strong>{tasks.length}</strong>
          <span>Tổng task</span>
        </div>
        <div>
          <strong>{tasks.filter((t) => t.status === "running").length}</strong>
          <span>Đang thực thi</span>
        </div>
        <div>
          <strong>
            {
              tasks.filter((t) =>
                ["waiting_input", "waiting_approval", "blocked"].includes(
                  t.status,
                ),
              ).length
            }
          </strong>
          <span>Cần bạn xử lý</span>
        </div>
      </div>
    </>
  );
}
