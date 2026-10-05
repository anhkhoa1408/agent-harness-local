"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type Event, type ControlCommand } from "@/core/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { FormField } from "@/components/molecules/form-field";
import { SelectField } from "@/components/molecules/select-field";
import { FeedbackMessage } from "@/components/molecules/feedback-message";
import { StatusBadge } from "@/components/molecules/status-badge";
import { TaskDetailLayout } from "@/components/templates/task-detail-layout";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Pipeline } from "@/components/organisms/pipeline";
import { api } from "@/lib/api";
import type { TaskDetailData } from "@/components/organisms/task-detail/types";
import { TaskRequests } from "@/components/organisms/task-detail/task-requests";
import { TaskEvidence } from "@/components/organisms/task-detail/task-evidence";
import { TaskTimeline } from "@/components/organisms/task-detail/task-timeline";
export function TaskDetailPage({ id }: { id: string }) {
  const [detail, setDetail] = useState<TaskDetailData | null>(null),
    [events, setEvents] = useState<Event[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    cursor = useRef(0);
  async function load() {
    try {
      const [d, e] = await Promise.all([
        api<TaskDetailData>(`tasks/${id}`),
        api<Event[]>(`tasks/${id}/events?after=${cursor.current}`),
      ]);
      setDetail(d);
      if (e.length) {
        cursor.current = e.at(-1)!.seq;
        setEvents((old) =>
          [...old, ...e].filter(
            (v, i, a) => a.findIndex((x) => x.seq === v.seq) === i,
          ),
        );
      }
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(load, 1000);
    return () => clearInterval(timer);
  }, [id]);
  async function command(kind: ControlCommand["kind"], payload: unknown = {}) {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    try {
      const latest = await api<TaskDetailData>(`tasks/${id}`);
      await api(`tasks/${id}/commands`, "POST", {
        id: crypto.randomUUID(),
        kind,
        expectedRevision: latest.task.revision,
        payload,
      });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!detail)
    return (
      <FeedbackMessage tone={error ? "error" : "info"}>
        {error || "Đang tải task…"}
      </FeedbackMessage>
    );
  const { task, analysis, delivery } = detail;
  const terminal = ["completed", "cancelled"].includes(task.status);
  return (
    <>
      <Link
        href="/"
        aria-label="← Workspace"
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft aria-hidden="true" className="size-3" />
        <span>Workspace</span>
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-primary">
            FEATURE TASK · {id.slice(0, 8)}
          </p>
          <h1 className="break-words">{task.title}</h1>
          <p className="mt-2 break-all text-xs text-muted-foreground">
            {task.branch}
          </p>
        </div>
        {delivery?.mode === "local" ? (
          <Badge variant="outline" className="border-primary/30 text-primary">
            Đã bàn giao local
          </Badge>
        ) : (
          <StatusBadge status={task.status} />
        )}
      </div>
      <div className="min-w-0">
        <Pipeline nodes={detail.pipeline} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {task.status === "running" && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => command("pause")}
          >
            Tạm dừng
          </Button>
        )}
        {["paused", "interrupted", "blocked"].includes(task.status) && (
          <Button
            variant="secondary"
            disabled={busy || task.reason === "runtime_state_unknown"}
            onClick={() => command("resume")}
          >
            Tiếp tục
          </Button>
        )}
        {!terminal && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => command("cancel")}
          >
            Hủy task
          </Button>
        )}
        <span className="text-xs text-muted-foreground sm:ml-auto">
          Repair {task.repairCount}/3 · Plan v{task.planVersion ?? "—"}
        </span>
      </div>
      {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
      {task.reason && (
        <FeedbackMessage tone="error">
          <strong>{task.reason}</strong>
          <p>
            {task.reason === "runtime_state_unknown"
              ? "Runtime cũ chưa được xác nhận đã dừng. Cần đối chiếu process trước khi resume."
              : task.reason.includes("skill_")
                ? "Bộ skill đi kèm ứng dụng đang thiếu. Khôi phục thư mục skills từ repository rồi tiếp tục."
                : task.reason.includes("model_")
                  ? "Cập nhật model cho task ở bên dưới rồi tiếp tục."
                  : "Xem evidence và cấu hình; giải quyết nguyên nhân trước khi tiếp tục."}
          </p>
          {task.stage === "deliver" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => command("configure", { deliveryMode: "local" })}
            >
              Chuyển bàn giao local
            </Button>
          )}
        </FeedbackMessage>
      )}
      <Card>
        <CardContent>
          <FormField id="task-execution-mode" label="Chế độ thực thi">
            <SelectField
              id="task-execution-mode"
              label="Chế độ thực thi"
              value={task.executionMode ?? "manual"}
              disabled={busy || terminal || task.status === "running"}
              onValueChange={(value) =>
                void command("configure", { executionMode: value })
              }
              options={[
                { value: "manual", label: "Duyệt quyền khi cần" },
                { value: "auto", label: "Auto sau khi duyệt Plan" },
              ]}
            />
          </FormField>
        </CardContent>
      </Card>
      <TaskRequests
        task={task}
        analysis={analysis}
        approvals={detail.approvals}
        busy={busy}
        command={command}
      />
      <TaskDetailLayout
        primary={<TaskEvidence detail={detail} busy={busy} command={command} />}
        timeline={<TaskTimeline events={events} />}
      />
      {!terminal && task.status !== "running" && (
        <Card className="py-4">
          <CardContent>
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-between whitespace-normal px-0 text-left"
                >
                  Đổi model của task tại stage boundary
                  <ChevronDown aria-hidden="true" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Lưu Settings trước, sau đó áp dụng vào task này. Approval plan
                  hiện tại được giữ nguyên nếu scope không đổi.
                </p>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const settings = await api("settings");
                      await command("configure", { models: settings.models });
                    } catch (error) {
                      setError(String(error));
                    }
                  }}
                >
                  Áp dụng model từ Settings
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
    </>
  );
}
