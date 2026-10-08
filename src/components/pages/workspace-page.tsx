"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Repository } from "@/core/contracts";
import type { TaskWithProgress } from "@/core/pipeline-progress";
import { FeedbackMessage } from "@/components/molecules/feedback-message";
import { api } from "@/lib/api";
import { NewTaskForm } from "@/components/organisms/workspace/new-task-form";
import { RepositoryForm } from "@/components/organisms/workspace/repository-form";
import { RepositoryManager } from "@/components/organisms/workspace/repository-manager";
import { TaskList } from "@/components/organisms/workspace/task-list";
import { WorkspaceOverview } from "@/components/organisms/workspace/workspace-overview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function WorkspacePage() {
  const router = useRouter(),
    [repos, setRepos] = useState<Repository[]>([]),
    [tasks, setTasks] = useState<TaskWithProgress[]>([]),
    [health, setHealth] = useState("offline"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [configured, setConfigured] = useState(false),
    [repoId, setRepoId] = useState(""),
    [taskDialogOpen, setTaskDialogOpen] = useState(false),
    [repoDialogOpen, setRepoDialogOpen] = useState(false),
    [repositoryDraft, setRepositoryDraft] = useState({
      path: "",
      base: "main",
      remote: "",
    });
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
      setRepoId((old) =>
        r.some((repo) => repo.id === old) ? old : r[0]?.id || "",
      );
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
        splitIntoStories: f.get("splitIntoStories") === "on",
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
      setRepoDialogOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <WorkspaceOverview tasks={tasks} health={health} />
      {error && !taskDialogOpen && !repoDialogOpen && (
        <FeedbackMessage tone="error">{error}</FeedbackMessage>
      )}
      {!configured && (
        <FeedbackMessage tone="info">
          Kiểm tra Model & skills trước khi bắt đầu.{" "}
          <Link href="/settings">Mở Model & skills →</Link>
        </FeedbackMessage>
      )}
      <div className="flex flex-wrap gap-3">
        <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
          <DialogTrigger asChild>
            <Button>Tạo task mới</Button>
          </DialogTrigger>
          <DialogContent>
            <div className="space-y-2 pr-7">
              <DialogTitle className="text-lg font-semibold">
                Tạo task mới
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Giao yêu cầu cho agent trên repository đã đăng ký.
              </DialogDescription>
            </div>
            {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
            <NewTaskForm
              repos={repos}
              repoId={repoId}
              onRepoChange={setRepoId}
              onSubmit={submit}
              busy={busy}
              configured={configured}
            />
          </DialogContent>
        </Dialog>
        <Dialog open={repoDialogOpen} onOpenChange={setRepoDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">Đăng ký repository</Button>
          </DialogTrigger>
          <DialogContent>
            <div className="space-y-2 pr-7">
              <DialogTitle className="text-lg font-semibold">
                Đăng ký repository
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Chọn repository Git local và nhánh nguồn để tạo task.
              </DialogDescription>
            </div>
            {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
            <RepositoryForm
              onSubmit={register}
              busy={busy}
              draft={repositoryDraft}
              onDraftChange={(field, value) =>
                setRepositoryDraft((old) => ({ ...old, [field]: value }))
              }
            />
          </DialogContent>
        </Dialog>
        <RepositoryManager
          repos={repos}
          tasks={tasks}
          onRemove={async (repo) => {
            await api(`repositories/${encodeURIComponent(repo.id)}`, "DELETE");
            await load();
          }}
        />
      </div>
      <TaskList tasks={tasks} repos={repos} />
    </>
  );
}
