import { z } from "zod";
import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Task, Plan } from "../core/contracts";
import { VisualReviewSchema } from "../core/contracts";
import type { CheckResult } from "./checks";
import { contained, contentHash } from "../context/rules";
import { gitText } from "../repositories/inspect";

export function evidenceExclusions(plan: Plan) {
  return [
    ...plan.checks.flatMap((c) => (c.reportPath ? [c.reportPath] : [])),
    ...(plan.uiVerification?.screenshots.map((s) => s.path) ?? []),
  ];
}
export async function clearScreenshots(
  root: string,
  plan: Plan,
  checkId: string,
) {
  for (const shot of plan.uiVerification?.screenshots.filter(
    (s) => s.checkId === checkId,
  ) ?? []) {
    if (await gitText(root, ["ls-files", "--", shot.path]))
      throw new Error("screenshot_overwrites_source");
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
  if ((await stat(path)).size > 8 * 1024 * 1024)
    throw new Error("ui_image_too_large");
  const data = await readFile(path);
  if (
    data.length < 24 ||
    !data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    data.toString("ascii", 12, 16) !== "IHDR"
  )
    throw new Error("ui_invalid_png");
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
      throw new Error("ui_e2e_not_passed");
    const actual = await png(await contained(root, shot.path));
    if (
      actual.width !== shot.viewport.width ||
      actual.height !== shot.viewport.height
    )
      throw new Error("ui_viewport_mismatch");
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
export function visualChecks(
  task: Task,
  plan: Plan,
  fingerprint: string,
  shots: ScreenshotEvidence[],
  raw: z.infer<typeof VisualReviewSchema>,
): CheckResult[] {
  const verdict = VisualReviewSchema.parse(raw);
  if (
    verdict.screenshots.length !== shots.length ||
    new Set(verdict.screenshots.map((s) => s.id)).size !== shots.length ||
    shots.some((s) => !verdict.screenshots.some((v) => v.id === s.id))
  )
    throw new Error("ui_verdict_incomplete");
  return shots.map((shot) => {
    const finding = verdict.screenshots.find((s) => s.id === shot.id)!;
    return {
      id: `ui:${shot.id}`,
      taskId: task.id,
      planVersion: plan.version,
      fingerprint,
      status: finding.passed ? "passed" : "failed",
      executed: null,
      exitCode: null,
      evidencePath: shot.actual.path,
      reason: finding.evidence,
      imageEvidence: [shot.actual, ...(shot.reference ? [shot.reference] : [])],
    };
  });
}
export async function verifyImageEvidence(checks: CheckResult[]) {
  for (const check of checks.filter((c) => c.id.startsWith("ui:"))) {
    if (!check.imageEvidence?.length) throw new Error("ui_evidence_missing");
    for (const image of check.imageEvidence) {
      try {
        const data = (await png(image.path)).data;
        if (contentHash(data.toString("base64")) !== image.sha256)
          throw new Error("ui_evidence_changed");
      } catch {
        throw new Error("ui_evidence_changed");
      }
    }
  }
}
