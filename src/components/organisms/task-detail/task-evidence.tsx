import { useState } from "react";
import { ScreenshotLinks } from "./ui-verification";
import { TaskPlan } from "./task-plan";
import type { TaskDetailData, TaskCommand } from "./types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FeedbackMessage } from "@/components/molecules/feedback-message";
export function TaskEvidence({
  detail,
  busy,
  command,
}: {
  detail: TaskDetailData;
  busy: boolean;
  command: TaskCommand;
}) {
  const [tab, setTab] = useState("plan");
  const { task, plan, checks, review, delivery, acceptance, runtime } = detail;
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-6">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList
            aria-label="Evidence"
            className="mb-4 w-full justify-start overflow-x-auto"
          >
            {[
              { value: "plan", label: "Plan" },
              { value: "tests", label: "Tests" },
              { value: "review", label: "Review" },
              { value: "context", label: "Context" },
            ].map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="plan" forceMount hidden={tab !== "plan"}>
            <TaskPlan
              task={task}
              plan={plan}
              comments={detail.comments}
              busy={busy}
              command={command}
            />
          </TabsContent>
          <TabsContent
            value="tests"
            forceMount
            hidden={tab !== "tests"}
            className="space-y-4"
          >
            <p className="text-xs text-muted-foreground">
              Test cũ ngoài plan không chạy và không được tính là pass.
            </p>
            {checks?.map((check) => (
              <div className="space-y-2 border-b py-4" key={check.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{check.id}</strong>
                  <Badge
                    variant="outline"
                    className={
                      check.status === "passed"
                        ? "border-primary/30 text-primary"
                        : "border-amber-400/30 text-amber-200"
                    }
                  >
                    {check.status}
                  </Badge>
                </div>
                <p className="break-all text-xs text-muted-foreground">
                  {check.executed ?? "?"} tests ·{" "}
                  {check.reason || check.evidencePath}
                </p>
              </div>
            ))}
            {!checks && <p>Chưa có kết quả kiểm thử.</p>}
            <ScreenshotLinks artifacts={detail.artifacts} />
          </TabsContent>
          <TabsContent
            value="review"
            forceMount
            hidden={tab !== "review"}
            className="space-y-4"
          >
            <pre>
              {review ? JSON.stringify(review, null, 2) : "Chưa có review."}
            </pre>
            {acceptance != null && (
              <pre>{JSON.stringify(acceptance, null, 2)}</pre>
            )}
          </TabsContent>
          <TabsContent
            value="context"
            forceMount
            hidden={tab !== "context"}
            className="space-y-4"
          >
            <h3>Model hiện tại</h3>
            <pre>{JSON.stringify(runtime ?? task.models, null, 2)}</pre>
            {detail.artifacts
              .filter((artifact) => artifact.type === "context")
              .map((artifact) => (
                <p key={artifact.id}>
                  <a
                    className="text-primary underline underline-offset-4"
                    href={`/api/artifacts/${artifact.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Context {artifact.id.slice(0, 12)} ↗
                  </a>
                </p>
              ))}
          </TabsContent>
        </Tabs>
        {delivery && (
          <FeedbackMessage tone="success">
            <h3>
              {delivery.mode === "local"
                ? "Đã bàn giao local"
                : "Đã tạo pull request"}
            </h3>
            <a
              className="underline underline-offset-4"
              href={`/api/artifacts/${task.id}-delivery`}
              target="_blank"
              rel="noreferrer"
            >
              Báo cáo nghiệm thu
            </a>
            {delivery.prUrl && (
              <p>
                <a
                  className="underline underline-offset-4"
                  href={delivery.prUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở pull request ↗
                </a>
              </p>
            )}
            <p className="break-all text-xs">Commit {delivery.commit}</p>
          </FeedbackMessage>
        )}
      </CardContent>
    </Card>
  );
}
