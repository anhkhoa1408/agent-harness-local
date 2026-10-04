import type { Event } from "../../core/contracts";
export function TaskTimeline({ events }: { events: Event[] }) {
  return (
    <aside className="panel timeline">
      <h2>Timeline</h2>
      {events
        .slice(-40)
        .reverse()
        .map((e) => (
          <div key={e.seq}>
            <span className="timeline-dot" />
            <strong>{e.type}</strong>
            <time>{new Date(e.at).toLocaleTimeString("vi-VN")}</time>
            {e.type === "command.rejected" && (
              <p className="alert">{JSON.stringify(e.data)}</p>
            )}
          </div>
        ))}
    </aside>
  );
}
