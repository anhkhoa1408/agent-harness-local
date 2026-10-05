"use client";
import { useState } from "react";
import type { Repository } from "@/core/contracts";
import { SelectField } from "@/components/molecules/select-field";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { TaskWithProgress } from "@/core/pipeline-progress";
import { Pipeline } from "@/components/organisms/pipeline";
import { stageLabel } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/molecules/status-badge";
import { EmptyState } from "@/components/molecules/empty-state";
export function TaskList({
  tasks,
  repos,
}: {
  tasks: TaskWithProgress[];
  repos: Repository[];
}) {
  const [filterRepoId, setFilterRepoId] = useState("all");
  const visibleTasks =
    filterRepoId === "all"
      ? tasks
      : tasks.filter((task) => task.repositoryId === filterRepoId);
  return (
    <section
      aria-labelledby="recent-activity-heading"
      className="w-full min-w-0 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="recent-activity-heading">Hoạt động gần đây</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-60 max-w-full">
            <SelectField
              id="activity-repository"
              label="Lọc theo repository"
              value={filterRepoId}
              onValueChange={setFilterRepoId}
              options={[
                { value: "all", label: "Tất cả repository" },
                ...repos.map((repo) => ({
                  value: repo.id,
                  label: `${repo.root.split("/").pop()} · ${repo.baseBranch}`,
                })),
              ]}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {visibleTasks.length} task
          </span>
        </div>
      </div>
      {visibleTasks.length ? (
        <div className="space-y-3">
          {visibleTasks.map((task) => (
            <Link
              href={`/tasks/${task.id}`}
              key={task.id}
              className="block rounded-xl"
            >
              <Card className="min-w-0 gap-0 py-5 transition-colors hover:border-primary/40">
                <CardContent className="flex min-w-0 gap-3 px-5">
                  <div className="min-w-0 flex-1">
                    <StatusBadge status={task.status} />
                    <h3 className="mt-3 break-words text-base">{task.title}</h3>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {stageLabel[task.stage]} · {task.branch}
                    </p>
                    <Pipeline nodes={task.pipeline} compact />
                  </div>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-primary"
                  />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            filterRepoId === "all"
              ? "Workspace đang sẵn sàng"
              : "Repository chưa có task"
          }
          description={
            filterRepoId === "all"
              ? "Thêm repo và tạo task đầu tiên. Mọi tiến trình sẽ xuất hiện ở đây."
              : "Chọn repository khác hoặc tạo task cho repository này."
          }
        />
      )}
    </section>
  );
}
