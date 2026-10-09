import Link from "next/link";
import type { Plan, StorySelection } from "@/presentation/dto";
import { selectedStories } from "@/domain/stories";
import { Card, CardContent } from "@/components/ui/card";
import type { TaskDetailData } from "./types";

export function StoryPicker({
  plan,
  selection,
  onChange,
  disabled,
  locked = false,
}: {
  plan: Plan;
  selection: StorySelection;
  onChange: (value: StorySelection) => void;
  disabled: boolean;
  locked?: boolean;
}) {
  const missing = [
    ...new Set(
      (plan.stories ?? [])
        .filter((s) => selection.storyIds.includes(s.id))
        .flatMap((s) => s.dependsOn)
        .filter((id) => !selection.storyIds.includes(id)),
    ),
  ];
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-4 rounded-lg border p-4"
    >
      <legend className="px-1 font-semibold">Chọn stories để thực hiện</legend>
      <p className="text-xs text-muted-foreground">
        Point thể hiện độ phức tạp và bất định, không quy đổi sang token. Mỗi
        story có test và checkpoint riêng.
      </p>
      {plan.stories?.map((story) => (
        <div key={story.id} className="space-y-2 rounded-md border p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              disabled={locked}
              aria-label={`Chọn story ${story.id}`}
              checked={selection.storyIds.includes(story.id)}
              onChange={(e) =>
                onChange({
                  ...selection,
                  storyIds: e.target.checked
                    ? [...selection.storyIds, story.id]
                    : selection.storyIds.filter((id) => id !== story.id),
                })
              }
              className="mt-1"
            />
            <span className="min-w-0 break-words">
              <strong>
                {story.id} · {story.title}
              </strong>
              <br />
              {story.outcome}
              <br />
              <small>
                {story.points} point · Phụ thuộc:{" "}
                {story.dependsOn.join(", ") || "Không có"}
              </small>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            Tiêu chí: {story.criterionIds.join(", ")}
          </p>
          {story.points === 8 && (
            <p className="text-xs">Nên góp ý plan để tách story này nhỏ hơn.</p>
          )}
        </div>
      ))}
      {locked && (
        <p className="text-xs">
          Stories và cách bàn giao được giữ theo phạm vi đã bắt đầu. Replan giữ
          checkpoint đã hoàn thành.
        </p>
      )}
      {missing.length > 0 && (
        <p role="alert" className="text-sm text-destructive">
          Thiếu story phụ thuộc: {missing.join(", ")}
        </p>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Cách bàn giao</legend>
        {(
          [
            ["separate_pr", "PR riêng từng story"],
            ["shared_pr", "Một PR cho toàn feature"],
          ] as const
        ).map(([mode, label]) => (
          <label key={mode} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              disabled={locked}
              name="story-delivery-mode"
              value={mode}
              checked={selection.mode === mode}
              onChange={() => onChange({ ...selection, mode })}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Bàn giao local áp dụng cùng cách chia branch và checkpoint. Với PR
        riêng, story phụ thuộc chờ commit trước được tích hợp vào nhánh đích.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={selection.continueAutomatically}
          onChange={(e) =>
            onChange({ ...selection, continueAutomatically: e.target.checked })
          }
          className="mt-1"
        />
        Tự tiếp tục các stories đã chọn
      </label>
      <p className="text-xs text-muted-foreground">
        Mặc định dừng sau mỗi story. PR chung cần một lượt kiểm tra toàn feature
        trước bàn giao.
      </p>
    </fieldset>
  );
}
export function validStorySelection(plan: Plan, selection: StorySelection) {
  try {
    selectedStories(plan, selection);
    return true;
  } catch {
    return false;
  }
}
const labels = {
  pending: "Chưa chạy",
  running: "Đang chạy",
  completed: "Hoàn thành",
  interrupted: "Gián đoạn",
  blocked: "Cần xử lý",
};
export function TaskStories({ detail }: { detail: TaskDetailData }) {
  const data = detail.stories;
  if (!data?.execution || !detail.plan?.stories) return null;
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-4">
        <h2>Tiến độ stories</h2>
        <p className="text-sm text-muted-foreground">
          {data.execution.selection.mode === "shared_pr"
            ? "Một PR cho toàn feature · checkpoint từng story"
            : "PR riêng từng story"}
        </p>
        {data.execution.selection.mode === "shared_pr" &&
          detail.task.status !== "completed" && (
            <p className="text-xs">
              Story hoàn thành là checkpoint cục bộ. Feature chưa được bàn giao.
            </p>
          )}
        {detail.plan.stories.map((story) => {
          const run = data.runs.find((r) => r.storyId === story.id),
            selected = data.execution!.selection.storyIds.includes(story.id);
          return (
            <div
              key={story.id}
              className="min-w-0 space-y-2 border-t pt-3 [overflow-wrap:anywhere]"
            >
              <h3>
                Story {story.id} ·{" "}
                {selected ? labels[run?.state ?? "pending"] : "Chưa chọn"}
              </h3>
              <p className="text-sm">
                {story.title} · {story.points} point
              </p>
              {run?.commit && (
                <p className="text-xs text-muted-foreground">
                  Checkpoint commit: {run.commit.slice(0, 12)}
                </p>
              )}
              {run?.childTaskId && (
                <Link
                  className="block text-sm text-primary underline"
                  href={`/tasks/${run.childTaskId}`}
                >
                  Mở task của story {story.id}
                </Link>
              )}
              {run?.prUrl && (
                <a
                  className="block text-sm text-primary underline"
                  href={run.prUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở PR của story {story.id}
                </a>
              )}
              {run?.checkpointPath &&
                data.execution!.selection.mode === "shared_pr" && (
                  <a
                    className="block text-sm text-primary underline"
                    href={`/api/artifacts/${encodeURIComponent(run.checkpointArtifactId ?? `${detail.task.id}:story:${run.planVersion}:${run.storyId}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở checkpoint story {story.id}
                  </a>
                )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
