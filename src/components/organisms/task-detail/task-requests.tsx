import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/molecules/form-field";
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
  return (
    <>
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
        <Card key={a.id}>
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
