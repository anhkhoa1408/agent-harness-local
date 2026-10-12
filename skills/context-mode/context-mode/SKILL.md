---
name: context-mode
description: Use when processing large tool outputs or searching indexed project material during a Harness AI stage.
---

# Context Mode for Harness

Modified for Agent Harness from context-mode distribution 1.0.169.
Copyright 2026 Mert Koseoglu. See ../LICENSE and ../../sources.json.

Keep raw data outside the conversation; return findings with source locations and evidence. Use only tools exposed by this runtime and permitted for this stage. These instructions do not install MCP servers or grant execution, network or write permissions.

If the needed tool is unavailable, use permitted normal read/command tools with scoped paths and bounded output. Report `context_mode_unavailable` once in the stage summary; do not invent indexed content or savings, or block approved work solely because the optimization tool is missing.

## Routing

| Need | Available context-mode tool |
| --- | --- |
| Capture independent reads or commands and retrieve relevant sections | `ctx_batch_execute(commands, queries)` |
| Analyze logs, JSON, test output or diffs | `ctx_execute(language, code)` |
| Analyze a file without loading its raw bytes | `ctx_execute_file(path, language, code)` |
| Store material for repeated lookup | `ctx_index(path, source)` |
| Retrieve already indexed material | `ctx_search(queries, source)` |
| Inspect savings when requested | `ctx_stats()` |

Use the current stage checkout as the working directory. Print derived findings, command exit status and evidence locations. Retain failure details needed to assess a check; shortened output alone is not proof of success. Writes and exact reads needed for edits use normal filesystem tools. Do not run commands beyond the approved stage or test plan.

## Index and search

Index only material needed for this task, using `path` rather than large inline `content`. Choose a source label containing repository, revision and task identity. Exclude secrets, credentials, `.git`, dependencies and generated output. Prefer specific files; avoid indexing the whole repository by default.

Batch related questions in one `queries` array and scope them to the intended source. Use `sort: "timeline"` for previously captured session decisions when supported. Do not re-index an output already returned into the conversation. Check freshness before relying on snippets; read current files before edits and bind verification evidence to the current revision.

## Stats and frozen instructions

Call `ctx_stats` only when context savings are requested. It is read-only: do not purge or reset the index. Report only returned measurements; they describe context-mode usage, not total Harness token cost or money saved. Keep the required Harness JSON schema; reference a report artifact if the full stats output does not fit the stage result.

This frozen guide covers index/search/stats routing. The separate `ctx-index`, `ctx-search` and `ctx-stats` skills are operator utilities, not additional mandatory stage instructions. Do not replace this snapshot with live utility files during an attempt.
