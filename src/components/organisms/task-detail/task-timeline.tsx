import type { Event } from "@/presentation/dto";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { FeedbackMessage } from "@/components/molecules/feedback-message";
export function TaskTimeline({ events }: { events: Event[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <h2>Timeline</h2>
      </CardHeader>
      <CardContent>
        <div
          className="max-h-[350px] min-[1100px]:max-h-[480px] overflow-y-auto rounded-sm pr-2 focus-visible:outline-2 focus-visible:outline-ring"
          role="region"
          aria-label="Sự kiện Timeline"
          tabIndex={0}
        >
          {events.length === 0 && (
            <p className="text-xs text-muted-foreground">Chưa có sự kiện.</p>
          )}
          {events
            .slice(-40)
            .reverse()
            .map((event) => (
              <div
                key={event.seq}
                className="relative ml-1 space-y-1 border-l pb-5 pl-4"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-2 -left-1 size-2 rounded-full bg-primary/60"
                />
                <strong className="block break-all text-xs font-medium">
                  {event.type}
                </strong>
                <time
                  dateTime={new Date(event.at).toISOString()}
                  className="text-[10px] text-muted-foreground"
                >
                  {new Date(event.at).toLocaleTimeString("vi-VN")}
                </time>
                {event.type === "command.rejected" && (
                  <FeedbackMessage tone="error">
                    {JSON.stringify(event.data)}
                  </FeedbackMessage>
                )}
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
