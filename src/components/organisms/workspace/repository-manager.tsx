"use client";
import { useState } from "react";
import type { Repository } from "@/core/contracts";
import type { TaskWithProgress } from "@/core/pipeline-progress";
import { FeedbackMessage } from "@/components/molecules/feedback-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function RepositoryManager({
  repos,
  tasks,
  onRemove,
}: {
  repos: Repository[];
  tasks: TaskWithProgress[];
  onRemove: (repo: Repository) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove(repo: Repository) {
    setBusy(true);
    setError("");
    try {
      await onRemove(repo);
      setSelectedId(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      onOpenChange={() => {
        setSelectedId(null);
        setError("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Quản lý repository</Button>
      </DialogTrigger>
      <DialogContent>
        <div className="space-y-2 pr-7">
          <DialogTitle className="text-lg font-semibold">
            Quản lý repository
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Gỡ repository sẽ xoá toàn bộ task, lịch sử và báo cáo trong Harness.
            Thư mục Git gốc và worktree được giữ nguyên.
          </DialogDescription>
        </div>
        {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
        {repos.length ? (
          <ul className="space-y-3">
            {repos.map((repo) => {
              const history = tasks.filter(
                (task) => task.repositoryId === repo.id,
              );
              const active = history.some(
                (task) =>
                  task.status === "running" ||
                  task.reason === "runtime_state_unknown",
              );
              return (
                <li
                  key={repo.id}
                  className="min-w-0 space-y-3 rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="break-all text-sm font-medium">
                        {repo.root}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {repo.baseBranch} · {history.length} task
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || active}
                      onClick={() => {
                        setSelectedId(repo.id);
                        setError("");
                      }}
                    >
                      Gỡ
                    </Button>
                  </div>
                  {active && (
                    <p className="text-xs text-muted-foreground">
                      Dừng task và xác nhận tiến trình đã dừng trước khi gỡ.
                    </p>
                  )}
                  {selectedId === repo.id && (
                    <div className="space-y-3 border-t pt-3">
                      <p className="text-sm">
                        Toàn bộ task và lịch sử chạy sẽ bị xoá.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="destructive"
                          disabled={busy || active}
                          onClick={() => void remove(repo)}
                        >
                          {busy ? "Đang gỡ…" : "Gỡ và xoá lịch sử"}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setSelectedId(null);
                            setError("");
                          }}
                        >
                          Huỷ
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chưa có repository đã đăng ký.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
