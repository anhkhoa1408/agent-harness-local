"use client";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/molecules/form-field";
import { FeedbackMessage } from "@/components/molecules/feedback-message";
import type {
  TaskDetailData,
  TaskCommand,
} from "@/components/organisms/task-detail/types";
export function TaskRequests({
  task,
  analysis,
  approvals,
  busy,
  command,
}: Pick<TaskDetailData, "task" | "analysis" | "approvals"> & {
  busy: boolean;
  command: TaskCommand;
}) {
  const [requestedApproval, setRequestedApproval] = useState<string | null>(
    null,
  );
  const focusedApproval = useRef<string | null>(null);
  useEffect(() => {
    const read = () =>
      setRequestedApproval(
        new URLSearchParams(window.location.hash.slice(1)).get("approval"),
      );
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    if (!requestedApproval || focusedApproval.current === requestedApproval)
      return;
    const target = document.getElementById(`approval-${requestedApproval}`);
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.focus({ preventScroll: true });
      focusedApproval.current = requestedApproval;
    }
  }, [requestedApproval, approvals]);
  return (
    <>
      {requestedApproval &&
        !approvals.some((approval) => approval.id === requestedApproval) && (
          <FeedbackMessage tone="info">
            Yêu cầu quyền này đã được xử lý hoặc hết hiệu lực.
          </FeedbackMessage>
        )}
      {task.status === "waiting_input" && (
        <Card>
          <CardContent className="space-y-4">
            <h2>Làm rõ yêu cầu</h2>
            {analysis?.questions?.map((q) => (
              <div key={q.id}>
                <p>
                  <strong>{q.question}</strong>
                </p>
                <p className="text-muted-foreground">
                  Đề xuất: {q.recommendation}
                </p>
              </div>
            ))}
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void command("answer", {
                  answer: new FormData(e.currentTarget).get("answer"),
                });
              }}
            >
              <FormField id="task-answer" label="Câu trả lời">
                <Textarea id="task-answer" name="answer" required rows={3} />
              </FormField>
              <Button variant="default" disabled={busy}>
                Gửi câu trả lời
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {approvals.map((a) => (
        <Card
          key={a.id}
          id={`approval-${a.id}`}
          tabIndex={-1}
          className="scroll-mt-5 focus:outline-2 focus:outline-primary"
        >
          <CardContent className="space-y-4">
            <h2>Agent cần quyền thực thi</h2>
            <pre>{JSON.stringify(a.params, null, 2)}</pre>
            <Button
              disabled={busy}
              onClick={() => command("grant", { id: a.id, decision: "accept" })}
            >
              Cho phép
            </Button>{" "}
            <Button
              disabled={busy}
              onClick={() =>
                command("grant", { id: a.id, decision: "decline" })
              }
            >
              Từ chối
            </Button>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
