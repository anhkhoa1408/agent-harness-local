import { Layers3 } from "lucide-react";
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
      <Layers3
        className="mx-auto mb-4 size-8 text-primary/70"
        aria-hidden="true"
      />
      <h3>{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
