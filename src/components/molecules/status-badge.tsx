import type { Status } from "@/presentation/dto";
import { statusLabel } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5",
        status === "completed" &&
          "border-primary/30 bg-primary/10 text-primary",
        [
          "blocked",
          "waiting_input",
          "waiting_approval",
          "interrupted",
        ].includes(status) &&
          "border-amber-400/30 bg-amber-400/10 text-amber-200",
        ["failed", "cancelled"].includes(status) && "text-muted-foreground",
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {statusLabel[status]}
    </Badge>
  );
}
