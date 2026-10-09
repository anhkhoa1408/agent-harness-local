import type { Plan } from "@/presentation/dto";
export function UiVerificationPlan({ plan }: { plan: Plan }) {
  if (!plan.uiVerification) return null;
  return (
    <>
      <h3>UI Verify</h3>
      <p className="text-xs text-muted-foreground">
        E2E kiểm tra hành vi; AI chỉ xem các ảnh đã chọn dưới đây.
      </p>
      {plan.uiVerification.screenshots.map((shot) => (
        <p key={shot.id}>
          <strong>{shot.id}</strong> · {shot.viewport.width} ×{" "}
          {shot.viewport.height}
          <br />
          Tiêu chí: {shot.criterionIds.join(", ")}
          <br />
          Ảnh đối chiếu: {shot.referencePath ?? "Theo tiêu chí UI đã duyệt"}
        </p>
      ))}
    </>
  );
}
export function ScreenshotLinks({
  artifacts,
}: {
  artifacts: { id: string; type: string }[];
}) {
  const shots = artifacts.filter((a) => a.type === "screenshot");
  if (!shots.length) return null;
  return (
    <div className="space-y-3">
      <h3>Ảnh kiểm chứng UI</h3>
      {shots.map((shot, index) => (
        <p key={shot.id}>
          <a
            className="text-primary underline underline-offset-4"
            href={`/api/artifacts/${encodeURIComponent(shot.id)}`}
            target="_blank"
            rel="noreferrer"
          >
            Mở ảnh kiểm chứng {index + 1} ↗
          </a>
        </p>
      ))}
    </div>
  );
}
