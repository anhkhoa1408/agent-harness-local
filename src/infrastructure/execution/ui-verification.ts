import { contentHash } from "../utils/content-hash";
import { contained } from "../utils/contained-path";
import { ExecutionErrorCode } from "./constants/execution-error-code";
import { ExecutionLimits } from "./constants/execution-limits";

import type { VisualReview } from "../../domain/contracts";
import { visualChecks as mapVisualChecks } from "../../application/verification";
import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Task, Plan } from "../validation/contracts";
import { VisualReviewSchema } from "../validation/contracts";
import type { CheckResult } from "../../domain/evidence";

import { gitText } from "../repositories/inspect";

export { evidenceExclusions } from "../../domain/evidence";
export async function clearScreenshots(
  root: string,
  plan: Plan,
  checkId: string,
) {
  for (const shot of plan.uiVerification?.screenshots.filter(
    (s) => s.checkId === checkId,
  ) ?? []) {
    if (await gitText(root, ["ls-files", "--", shot.path]))
      throw new Error(ExecutionErrorCode.SCREENSHOT_OVERWRITES_SOURCE);
    await rm(await contained(root, shot.path), { force: true });
  }
}
type Image = { path: string; sha256: string };
export type ScreenshotEvidence = {
  id: string;
  viewport: { width: number; height: number };
  criterionIds: string[];
  actual: Image;
  reference: Image | null;
};
async function png(path: string) {
  if ((await stat(path)).size > ExecutionLimits.MAX_EVIDENCE_FILE_BYTES)
    throw new Error(ExecutionErrorCode.UI_IMAGE_TOO_LARGE);
  const data = await readFile(path);
  if (
    data.length < 24 ||
    !data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    data.toString("ascii", 12, 16) !== "IHDR"
  )
    throw new Error(ExecutionErrorCode.UI_INVALID_PNG);
  return { data, width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}
export async function collectScreenshots(
  task: Task,
  plan: Plan,
  checks: CheckResult[],
  artifacts: string,
): Promise<ScreenshotEvidence[]> {
  const root = task.worktree!;
  const folder = join(artifacts, "ui", randomUUID());
  await mkdir(folder, { recursive: true });
  const result: ScreenshotEvidence[] = [];
  for (const shot of plan.uiVerification?.screenshots ?? []) {
    if (!checks.some((c) => c.id === shot.checkId && c.status === "passed"))
      throw new Error(ExecutionErrorCode.UI_E2E_NOT_PASSED);
    const actual = await png(await contained(root, shot.path));
    if (
      actual.width !== shot.viewport.width ||
      actual.height !== shot.viewport.height
    )
      throw new Error(ExecutionErrorCode.UI_VIEWPORT_MISMATCH);
    const copy = async (name: string, data: Buffer): Promise<Image> => {
      const path = join(folder, name);
      await writeFile(path, data, { mode: 0o600, flag: "wx" });
      return { path, sha256: contentHash(data.toString("base64")) };
    };
    result.push({
      id: shot.id,
      viewport: shot.viewport,
      criterionIds: shot.criterionIds,
      actual: await copy(`${shot.id}.png`, actual.data),
      reference: shot.referencePath
        ? await copy(
            `${shot.id}-reference.png`,
            (await png(await contained(root, shot.referencePath))).data,
          )
        : null,
    });
  }
  return result;
}
export async function verifyImageEvidence(checks: CheckResult[]) {
  for (const check of checks.filter((c) => c.id.startsWith("ui:"))) {
    if (!check.imageEvidence?.length)
      throw new Error(ExecutionErrorCode.UI_EVIDENCE_MISSING);
    for (const image of check.imageEvidence) {
      try {
        const data = (await png(image.path)).data;
        if (contentHash(data.toString("base64")) !== image.sha256)
          throw new Error(ExecutionErrorCode.UI_EVIDENCE_CHANGED);
      } catch {
        throw new Error(ExecutionErrorCode.UI_EVIDENCE_CHANGED);
      }
    }
  }
}

export function visualChecks(
  task: Task,
  plan: Plan,
  fingerprint: string,
  shots: ScreenshotEvidence[],
  raw: VisualReview,
) {
  return mapVisualChecks(
    task,
    plan,
    fingerprint,
    shots,
    VisualReviewSchema.parse(raw),
  );
}
