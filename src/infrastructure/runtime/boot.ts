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
