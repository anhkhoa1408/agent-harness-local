# Portable skills and pipeline UI — verification

- Native implementation on `codex/portable-pipeline-ui`, based on `1d345ce`.
- `npm test`: 52 tests passed across 18 files, including portable package copy, settings normalization, pipeline history, clarification/replan invalidation.
- `npm run typecheck`: passed. Final `npm run build`: passed, including TypeScript checking.
- `HARNESS_PRODUCTION=1 npm run test:e2e`: 8 passed. Fake agent; actual Git/process runner, API and browser. Covers approval, repair, pause/resume, required skipped tests, model settings and pipeline dashboard/detail.
- Independent review found stale green downstream nodes during clarification before the next attempt. Regression reproduced red, fixed and passed; reviewer verified the fix with no remaining findings in scope.
- Visual inspection found connectors overlapping node numbers; corrected stacking and rebuilt, visually verified. This CSS-only correction followed the E2E run; no additional behavior changes.
- 28 vendored files match SHA256 in skills/sources.json; MIT licenses included. Profiles keep their separate agents/sources.json provenance.
- Local UI at port 3001 uses existing agent-stage-mapping `.harness` data directory. Demo screenshot used a separate fixture at port 3002; demo server stopped after inspection.
- No real-model inference or GitHub publishing performed. Portability test copies package context to another directory on this Mac; another OS/device was not tested.
