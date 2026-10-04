# Portable skills and pipeline UI

Native execution. User approved removing Skill roots, visual stage circles, and packaging runtime context in the repository.

1. Bundle the exact installed Superpowers 6.4.2 and Matt Pocock 1.2.3 skills used by the pipeline, their referenced local files, licenses and content hashes. Worker resolves only these tracked files plus harness AGENTS baseline and target repo rules. Remove roots from Settings API/UI and fixtures. Frozen existing bundles remain unchanged; new tasks need no machine-specific skill paths. Test a copy of the tracked package in a temporary directory.
2. Add a pure pipeline projection from task status and persisted attempt outcomes. Green means latest valid successful completion, orange current/waiting, black pending/skipped. Replan invalidates downstream nodes; implement/repair invalidates verify/review/deliver; skipped repair is never green. Queued/paused/cancelled/failed remain explicit. Persist nextStage/nextStatus for new attempts, conservatively interpret legacy outcomes. Test normal, failure, repair, replan, waiting, cancellation, skipped repair.
3. Use a shared accessible, non-interactive circle stepper in task cards and detail, with labels/icons beyond color, responsive horizontal scrolling. Remove configuration paths and update portable setup docs/spec.
4. Verify focused tests, build/typecheck, E2E Settings and stage transitions, then inspect dashboard/detail visually. Keep separate branch/worktree. No GitHub push requested.
