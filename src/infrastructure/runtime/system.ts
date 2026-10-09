import { randomUUID } from "node:crypto";
import { bootIdentity } from "./boot";
import type { RuntimePort } from "../../application/runtime";
export const systemRuntime: RuntimePort = {
  now: () => Date.now(),
  id: randomUUID,
  bootIdentity,
  pid: process.pid,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  every: (ms, work) => {
    const timer = setInterval(work, ms);
    return () => clearInterval(timer);
  },
};
