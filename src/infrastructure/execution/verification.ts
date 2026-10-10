import { failureEvidence } from "./failure-evidence";
import { readFile, stat, rm } from "node:fs/promises";
import { MAX_EVIDENCE_FILE_BYTES } from "./limits";
import { runProcess } from "./process";
import { parseEvidence } from "./check-evidence";
import {
  clearScreenshots,
  collectScreenshots,
  verifyImageEvidence,
} from "./ui-verification";
import { gitText } from "../repositories/inspect";
import { fingerprintWorktree } from "../repositories/fingerprint";
import { contained } from "../context/rules";
import type { VerificationPort } from "../../application/verification";
export const verificationIO: VerificationPort = {
  failureEvidence,
  fingerprint: fingerprintWorktree,
  clearScreenshots,
  reportPath: contained,
  isTracked: (root, path) => gitText(root, ["ls-files", "--", path]),
  remove: (path) => rm(path, { force: true }),
  async readReport(path) {
    if ((await stat(path)).size > MAX_EVIDENCE_FILE_BYTES)
      throw new Error("report_too_large");
    return readFile(path, "utf8");
  },
  runProcess,
  parseEvidence,
  collectScreenshots,
  verifyImageEvidence,
};
