import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
export function FeedbackMessage({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  const Icon =
    tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <Alert
      variant={tone === "error" ? "destructive" : "default"}
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "success"
          ? "border-primary/25 bg-primary/5 text-primary"
          : undefined
      }
    >
      <Icon aria-hidden="true" />
      <AlertDescription className="min-w-0 break-words text-inherit">
        {children}
      </AlertDescription>
    </Alert>
  );
}
