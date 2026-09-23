export type RecoveryObservation = {
  agent: "stopped" | "running" | "unknown";
  process: "stopped" | "running" | "unknown";
  effect: "absent" | "confirmed" | "unknown";
};
export function decideRecovery(
  o: RecoveryObservation,
): "resume" | "wait" | "reconcile" {
  if (o.agent !== "stopped" || o.process !== "stopped") return "wait";
  return o.effect === "unknown" ? "reconcile" : "resume";
}
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
export function bootIdentity(): string | null {
  try {
    if (process.platform === "darwin")
      return execFileSync("/usr/sbin/sysctl", ["-n", "kern.boottime"], {
        encoding: "utf8",
      }).trim();
    if (process.platform === "linux")
      return readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  } catch {}
  return null;
}
