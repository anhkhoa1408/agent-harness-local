import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { StorySelection } from "@/core/contracts";
import { StoryPicker, validStorySelection } from "./task-stories";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { FormField } from "@/components/molecules/form-field";
import { SelectField } from "@/components/molecules/select-field";
import { EmptyState } from "@/components/molecules/empty-state";
import type {
  TaskDetailData,
  TaskCommand,
} from "@/components/organisms/task-detail/types";
import { UiVerificationPlan } from "./ui-verification";

function planSentences(text: string) {
  return Array.from(
    new Intl.Segmenter("vi", { granularity: "sentence" }).segment(text),
    ({ segment }) => segment.trim(),
  ).filter(Boolean);
}

export function TaskPlan({
  task,
  plan,
  comments,
  stories,
  busy,
  command,
}: Pick<TaskDetailData, "task" | "plan" | "comments" | "stories"> & {
  busy: boolean;
  command: TaskCommand;
}) {
  const [selection, setSelection] = useState<StorySelection>({
    storyIds: [],
    mode: "separate_pr",
    continueAutomatically: false,
    ...stories?.execution?.selection,
    planVersion: plan?.version ?? 1,
  });
  const currentComments = comments.filter((c) => c.version === plan?.version);
  const editable =
    task.stage === "plan" &&
    ["waiting_approval", "waiting_input"].includes(task.status);
  return plan ? (
    <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
      <h2>{plan.scope}</h2>
      <p className="break-words text-xs text-muted-foreground">
        Source {plan.sourceCommit.slice(0, 12)} · Version {plan.version}
      </p>
      {task.splitIntoStories && editable && plan.stories && (
        <StoryPicker
          plan={plan}
          selection={selection}
          onChange={setSelection}
          disabled={busy}
          locked={stories?.runs.some(
            (r) => r.state !== "pending" || !!r.childTaskId,
          )}
        />
      )}
      <h3>Acceptance criteria</h3>
      {plan.criteria.map((c) => (
        <p key={c.id}>
          <strong>{c.id}</strong> {c.description}
          <br />
          <small>{c.checkIds.join(", ")}</small>
        </p>
      ))}
      <h3>Các bước thực hiện</h3>
      <ol aria-label="Các bước thực hiện" className="space-y-4">
        {plan.steps.map((s) => {
          const [title, ...actions] = planSentences(s.description);
          return (
            <li key={s.id} className="min-w-0 rounded-lg border p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">
                  {s.id}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Mục tiêu
                  </p>
                  <h4 className="text-base font-semibold leading-relaxed">
                    {title}
                  </h4>
                  {s.dependsOn.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Sau bước: {s.dependsOn.join(", ")}
                    </p>
                  )}
                </div>
              </div>
              {s.files.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h5 className="text-sm font-semibold">File liên quan</h5>
                  <div className="flex flex-wrap gap-2">
                    {s.files.map((file) => (
                      <code
                        key={file}
                        className="min-w-0 max-w-full rounded-md bg-background px-2 py-1 text-xs leading-relaxed"
                      >
                        {file}
                      </code>
                    ))}
                  </div>
                </div>
              )}
              <Collapsible className="mt-4 border-t pt-3">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="group h-auto w-full justify-between whitespace-normal text-left"
                  >
                    Chi tiết bước {s.id}
                    <ChevronDown
                      aria-hidden="true"
                      className="shrink-0 transition-transform group-data-[state=open]:rotate-180"
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4 space-y-5">
                  {(
                    [
                      ["Việc cần làm", actions],
                      ["Đầu vào", planSentences(s.inputs)],
                      ["Kết quả", planSentences(s.outputs)],
                      ["Cách kiểm tra", planSentences(s.verification)],
                    ] as const
                  ).map(
                    ([label, items]) =>
                      items.length > 0 && (
                        <section key={label} className="space-y-2">
                          <h5 className="text-sm font-semibold">{label}</h5>
                          <ul className="list-disc space-y-2 pl-5 text-sm leading-7">
                            {items.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        </section>
                      ),
                  )}
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
      </ol>
      <h3>Test plan</h3>
      {plan.checks.map((c) => (
        <pre key={c.id}>
          {c.id} · {c.kind} · {c.required ? "required" : "optional"}
          {`\n`}
          {JSON.stringify([c.executable, ...c.args])}
          {`\n`}cwd: {c.cwd} · timeout: {c.timeoutMs}ms · min tests:{" "}
          {c.minimumTests}
        </pre>
      ))}
      <UiVerificationPlan plan={plan} />
      <h3>Phạm vi ngoài / môi trường</h3>
      <pre>
        {JSON.stringify(
          {
            outOfScope: plan.outOfScope,
            dependencies: plan.dependencies,
            environment: plan.environment,
            unresolved: plan.unresolved,
          },
          null,
          2,
        )}
      </pre>
      <h3>Góp ý Plan</h3>
      {comments.length === 0 && (
        <p className="break-words text-xs text-muted-foreground">
          Chưa có comment.
        </p>
      )}
      {comments.map((c) => (
        <div className="space-y-2 border-b py-3" key={c.id}>
          <small>
            Plan v{c.version} ·{" "}
            {c.target === "general"
              ? "Góp ý chung"
              : c.target
                  .replace("step:", "Bước ")
                  .replace("criterion:", "Tiêu chí ")
                  .replace("check:", "Kiểm tra ")}
          </small>
          <p>{c.text}</p>
        </div>
      ))}
      {editable && (
        <form
          key={plan.version}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void command("comment", {
              version: plan.version,
              target: data.get("target"),
              text: data.get("text"),
            });
          }}
        >
          <FormField id="plan-comment-target" label="Mục góp ý">
            <SelectField
              id="plan-comment-target"
              name="target"
              label="Mục góp ý"
              defaultValue="general"
              disabled={busy}
              options={[
                { value: "general", label: "Góp ý chung" },
                ...plan.steps.map((step) => ({
                  value: `step:${step.id}`,
                  label: `Bước ${step.id}: ${step.description}`,
                })),
                ...plan.criteria.map((criterion) => ({
                  value: `criterion:${criterion.id}`,
                  label: `Tiêu chí ${criterion.id}: ${criterion.description}`,
                })),
                ...plan.checks.map((check) => ({
                  value: `check:${check.id}`,
                  label: `Kiểm tra ${check.id}`,
                })),
              ]}
            />
          </FormField>
          <FormField id="plan-comment-text" label="Nội dung góp ý">
            <Textarea
              id="plan-comment-text"
              name="text"
              required
              maxLength={10000}
              rows={3}
            />
          </FormField>
          <Button disabled={busy}>Gửi comment</Button>
        </form>
      )}
      {editable && currentComments.length > 0 && (
        <>
          <p className="break-words text-xs text-muted-foreground">
            Có góp ý cho version hiện tại. Yêu cầu sửa để tạo Plan mới trước khi
            duyệt.
          </p>
          <Button
            disabled={busy}
            onClick={() => command("revise", { version: plan.version })}
          >
            Yêu cầu sửa plan
          </Button>
        </>
      )}
      {task.status === "waiting_approval" && (
        <Button
          variant="default"
          disabled={
            busy ||
            currentComments.length > 0 ||
            (!!task.splitIntoStories && !validStorySelection(plan, selection))
          }
          onClick={() =>
            command("approve", {
              version: plan.version,
              ...(task.splitIntoStories ? { selection } : {}),
            })
          }
        >
          Duyệt plan
        </Button>
      )}
    </div>
  ) : (
    <EmptyState
      title="Chưa có Plan"
      description="Plan sẽ xuất hiện sau khi requirement đã rõ."
    />
  );
}
