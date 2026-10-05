import type { TaskWithProgress } from "@/core/pipeline-progress";
import { Activity, Layers3, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
export function WorkspaceOverview({
  tasks,
  health,
}: {
  tasks: TaskWithProgress[];
  health: string;
}) {
  const stats = [
    { label: "Tổng task", value: tasks.length, icon: Layers3 },
    {
      label: "Đang thực thi",
      value: tasks.filter((t) => t.status === "running").length,
      icon: Activity,
    },
    {
      label: "Cần bạn xử lý",
      value: tasks.filter((t) =>
        ["waiting_input", "waiting_approval", "blocked"].includes(t.status),
      ).length,
      icon: CircleAlert,
    },
  ];
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-primary">
            BUILD WITH INTENTION
          </p>
          <h1>Tổng quan</h1>
        </div>
        <Badge
          variant="outline"
          className={
            health === "online"
              ? "border-primary/30 bg-primary/5 text-primary"
              : "border-amber-400/30 text-amber-200"
          }
        >
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-current"
          />
          Worker {health === "online" ? "sẵn sàng" : "offline"}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="gap-0 py-4 md:py-5">
            <CardContent className="px-3 md:px-5">
              <div className="flex items-center justify-between">
                <strong className="text-2xl font-medium md:text-3xl">
                  {value}
                </strong>
                <Icon
                  aria-hidden="true"
                  className="hidden size-4 text-muted-foreground md:block"
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground md:text-xs">
                {label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
