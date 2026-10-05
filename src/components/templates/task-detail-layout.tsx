import type { ReactNode } from "react";
export function TaskDetailLayout({
  primary,
  timeline,
}: {
  primary: ReactNode;
  timeline: ReactNode;
}) {
  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">{primary}</div>
      {timeline}
    </div>
  );
}
