import { delay } from "../../utils/delay";
import { CodexLimits } from "../constants/codex-limits";

// Callers own retry eligibility, deadline checks, cancellation and terminal errors.
export async function waitForRetry(
  currentDelayMs: number,
  deadline: number,
): Promise<number> {
  await delay(Math.min(currentDelayMs, deadline - Date.now()));
  return Math.min(
    currentDelayMs * CodexLimits.RETRY_BACKOFF_FACTOR,
    CodexLimits.ROLLOUT_MAX_RETRY_DELAY_MS,
  );
}
