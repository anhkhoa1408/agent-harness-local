import type { FormEvent } from "react";
import type { Repository } from "../../core/contracts";
export function NewTaskForm({
  repos,
  repoId,
  onRepoChange,
  onSubmit,
  busy,
  configured,
}: {
  repos: Repository[];
  repoId: string;
  onRepoChange: (id: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  busy: boolean;
  configured: boolean;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Task mới</h2>
        <span className="pill">01 → 09 stages</span>
      </div>
      <form onSubmit={onSubmit}>
        <label>
          Repository
          <select
            value={repoId}
            onChange={(e) => onRepoChange(e.target.value)}
            required
          >
            <option value="">Chọn repo</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.root.split("/").pop()} · {r.baseBranch}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tên task
          <input
            name="title"
            placeholder="Ví dụ: Thêm bộ lọc trạng thái"
            required
            maxLength={200}
          />
        </label>
        <label>
          Yêu cầu
          <textarea
            name="requirement"
            rows={5}
            placeholder="Hành vi mong đợi, phạm vi và tiêu chí thành công…"
            required
          />
        </label>
        <label>
          Bàn giao
          <select name="deliveryMode">
            <option value="local">Local · branch và báo cáo</option>
            <option value="github">GitHub · pull request</option>
          </select>
        </label>
        <p className="hint">
          Bạn sẽ duyệt plan trước khi agent bắt đầu sửa code.
        </p>
        <button className="primary" disabled={busy || !configured || !repoId}>
          Tạo task <span>↗</span>
        </button>
      </form>
    </section>
  );
}
