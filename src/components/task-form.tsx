"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Repository, Task } from "../core/contracts";
import { api, statusLabel, stageLabel } from "./api";
export function TaskForm() {
  const router = useRouter(),
    [repos, setRepos] = useState<Repository[]>([]),
    [tasks, setTasks] = useState<Task[]>([]),
    [health, setHealth] = useState("offline"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [configured, setConfigured] = useState(false),
    [repoId, setRepoId] = useState("");
  async function load() {
    try {
      const [r, t, h, s] = await Promise.all([
        api<Repository[]>("repositories"),
        api<Task[]>("tasks"),
        api("health"),
        api("settings"),
      ]);
      setRepos(r);
      setTasks(t);
      setHealth(h.worker);
      setConfigured(!!s.models);
      setRepoId((old) => old || r[0]?.id || "");
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(event.currentTarget);
    try {
      const task = await api<Task>("tasks", "POST", {
        repositoryId: repoId,
        title: f.get("title"),
        requirement: f.get("requirement"),
        deliveryMode: f.get("deliveryMode"),
      });
      router.push(`/tasks/${task.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const f = new FormData(event.currentTarget);
    try {
      const repo = await api<Repository>("repositories", "POST", {
        path: f.get("path"),
        baseBranch: f.get("base"),
        remote: f.get("remote") || null,
      });
      await load();
      setRepoId(repo.id);
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="heading">
        <div>
          <p className="eyebrow">BUILD WITH INTENTION</p>
          <h1>Từ yêu cầu đến feature.</h1>
          <p className="muted">
            Plan rõ ràng. Thực thi có kiểm soát. Review độc lập.
          </p>
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
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {!configured && (
        <p className="notice">
          Chọn model cho từng stage trước khi bắt đầu.{" "}
          <Link href="/settings">Mở Model & skills →</Link>
        </p>
      )}
      <div className="home-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>Task mới</h2>
            <span className="pill">01 → 09 stages</span>
          </div>
          <form onSubmit={submit}>
            <label>
              Repository
              <select
                value={repoId}
                onChange={(e) => setRepoId(e.target.value)}
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
            <button
              className="primary"
              disabled={busy || !configured || !repoId}
            >
              Tạo task <span>↗</span>
            </button>
          </form>
        </section>
        <section>
          <div className="section-heading">
            <h2>Hoạt động gần đây</h2>
            <span className="muted">{tasks.length} task</span>
          </div>
          <div className="task-list">
            {tasks.length ? (
              tasks.map((t) => (
                <Link className="task-card" href={`/tasks/${t.id}`} key={t.id}>
                  <div>
                    <span
                      className={`badge ${t.status === "completed" ? "good" : ""}`}
                    >
                      {statusLabel[t.status]}
                    </span>
                    <h3>{t.title}</h3>
                    <p>
                      {stageLabel[t.stage]} · {t.branch}
                    </p>
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
          <details className="panel repo-panel">
            <summary>+ Đăng ký repository</summary>
            <form onSubmit={register}>
              <label>
                Đường dẫn repo
                <input
                  name="path"
                  placeholder="/Users/you/projects/my-app"
                  required
                />
              </label>
              <label>
                Nhánh nguồn
                <input name="base" defaultValue="main" required />
              </label>
              <label>
                Remote (để trống nếu local)
                <input name="remote" placeholder="origin" />
              </label>
              <button disabled={busy}>Đăng ký repo</button>
            </form>
          </details>
        </section>
      </div>
    </>
  );
}
