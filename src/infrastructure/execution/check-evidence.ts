import { Parser } from "tap-parser";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { CheckSpec } from "../../domain/contracts";
import type { EvidenceCounts as Counts } from "../../application/verification";
export { evaluateCheck } from "../../domain/check-evidence";
export async function parseEvidence(
  format: CheckSpec["reportFormat"],
  text: string,
): Promise<Counts> {
  if (format === "exit-code") return { executed: null, failed: 0, skipped: 0 };
  if (format === "tap")
    return new Promise((resolve) => {
      const parser = new Parser();
      let executed = 0,
        skipped = 0,
        failed = 0;
      parser.on("result", (result) => {
        if (result.closingTestPoint) return;
        if (result.skip || result.todo) skipped++;
        else {
          executed++;
          if (!result.ok) failed++;
        }
      });
      parser.on("complete", (r) =>
        resolve({
          executed,
          failed: r.ok ? failed : Math.max(1, failed),
          skipped: Math.max(skipped, r.skip + r.todo),
        }),
      );
      parser.end(text);
    });
  if (XMLValidator.validate(text) !== true) throw new Error("invalid_junit");
  const xml = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
  }).parse(text);
  let executed = 0,
    failed = 0,
    skipped = 0;
  function walk(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, v] of Object.entries(value)) {
      if (key === "testcase") {
        for (const c of Array.isArray(v) ? v : [v]) {
          executed++;
          if (c && typeof c === "object") {
            if ("failure" in c || "error" in c) failed++;
            if ("skipped" in c) skipped++;
          }
        }
      } else walk(v);
    }
  }
  if (!xml.testsuites && !xml.testsuite) throw new Error("invalid_junit");
  walk(xml);
  return { executed, failed, skipped };
}
