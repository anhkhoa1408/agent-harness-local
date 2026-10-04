"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Repository } from "../core/contracts";
import type { TaskWithProgress } from "../core/pipeline-progress";
import { api } from "./api";
import { NewTaskForm } from "./workspace/new-task-form";
import { RepositoryForm } from "./workspace/repository-form";
import { TaskList } from "./workspace/task-list";
import { WorkspaceOverview } from "./workspace/workspace-overview";
export function TaskForm() {
  const router = useRouter(),
    [repos, setRepos] = useState<Repository[]>([]),
    [tasks, setTasks] = useState<TaskWithProgress[]>([]),
    [health, setHealth] = useState("offline"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [configured, setConfigured] = useState(false),
    [repoId, setRepoId] = useState("");
  async function load() {
    try {
      const [r, t, h, s] = await Promise.all([
        api<Repository[]>("repositories"),
        api<TaskWithProgress[]>("tasks"),
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
      const task = await api<TaskWithProgress>("tasks", "POST", {
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
      <WorkspaceOverview tasks={tasks} health={health} />
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {!configured && (
        <p className="notice">
          Kiểm tra Model & skills trước khi bắt đầu.{" "}
          <Link href="/settings">Mở Model & skills →</Link>
        </p>
      )}
      <div className="home-grid">
        <NewTaskForm
          repos={repos}
          repoId={repoId}
          onRepoChange={setRepoId}
          onSubmit={submit}
          busy={busy}
          configured={configured}
        />
        <section>
          <TaskList tasks={tasks} />
          <RepositoryForm onSubmit={register} busy={busy} />
        </section>
      </div>
    </>
  );
}
