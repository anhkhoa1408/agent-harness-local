# Agent stage mapping implementation plan

> Native execution, theo yêu cầu người dùng. Skills: writing-plans, test-driven-development, verification-before-completion.

**Goal:** Map pinned GitHub agent profiles into stage context, hard-code effort and default model policy, keep each feature isolated in its own worktree.
**Spec:** ../specs/2026-09-23-agent-harness-design.md; user amendment 2026-10-03 overrides previous effort selector requirement.

1. Model policy → plan/replan gpt-6-astra/high; others gpt-6-luna/medium. Keep model overrides, remove effort control. Normalize settings/task creation/configuration; runtime validates catalog without fallback. Existing task model snapshots are retained; attempt logs reflect effective effort. Test ingress and unavailable models/efforts.
2. Agent profiles → pinned ECC planner/TDD/reviewer/E2E/build repair and VoltAgent analyst/stack specialists/debugger. Keep upstream copies/licenses; load concise adapted profiles, not installation scripts or Claude tool metadata. Snapshot source revision and adapted content hashes. Select stack from committed manifests/source; generic fallback for unknown or mixed stacks. E2E support only where approved plan contains E2E checks. Test profile selection, provenance, context boundaries.
3. UI/docs → fixed effort labels and agent mapping, defaults for new settings, worktree per feature. Test UI save and task lifecycle; verify two features do not share worktree and retries reuse their own.
4. Verify → focused unit/integration and browser tests, typecheck, production build. Keep new feature branch/worktree separate from MVP; no merge/push.

Review focus: old settings with custom efforts; unsupported model combinations; mixed-stack repositories; old frozen bundles; replan must preserve worktree and repair budget. Do not mutate completed history or frozen task profiles implicitly.
