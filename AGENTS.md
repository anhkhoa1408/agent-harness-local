# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Combine these with project-specific instructions as needed. Prioritize caution over speed; use a proportionate process for simple tasks.

## 1. Think before coding

Do not guess or hide ambiguity. State tradeoffs clearly.

- State assumptions before implementation. If unsure about a decision that affects behavior, ask.
- If multiple interpretations are possible, present them rather than silently choosing one.
- If a simpler approach exists, point it out and push back when needed.
- When a requirement is unclear, identify the specific ambiguity and clarify it before changing code that depends on that decision.

## 2. Prioritize simplicity

Write the minimum code needed to meet the requirements.

- Do not add features beyond the requirements.
- Do not create abstractions for code used only once.
- Do not add flexibility or configuration that was not requested.
- Do not handle errors for scenarios that cannot occur.
- If 50 lines can clearly solve the same problem that currently takes 200 lines, simplify it.
- Ask yourself: would a senior engineer consider this approach too complex?

## 3. Make targeted changes

Change only what is necessary; clean up only redundancy introduced by your own changes.

- Preserve the existing code style.
- Do not improve surrounding code, comments, or formatting outside the task's scope.
- Do not refactor unrelated or working code.
- If you find unrelated pre-existing dead code, report it rather than deleting it.
- Remove imports, variables, or functions made redundant by your own changes.
- Every changed line must be traceable to the user's request.

## 4. Execute toward verifiable goals

Define verifiable success criteria and iterate until there is evidence that they are met, within the agreed execution limits.

- When adding validation: write tests for invalid input, observe the expected failures, then make the tests pass.
- When fixing a bug: reproduce it, identify the cause, write a regression test, and demonstrate that the test passes after the fix.
- When performing a requested refactor: verify the relevant behavior before and after the change.
- For multi-step tasks, provide a short plan with a verification condition for each step.
- If the goal is merely to "make it work," clarify the expected behavior before implementation.
- Report results based on actual evidence; distinguish pass, fail, blocked, and skipped.

For this Agent Harness, tests for the feature or bug being addressed are mandatory. Existing tests outside that scope may be skipped; clearly state what was not run. Write tests for new features and bugs being fixed, without adding tests in bulk for existing code. Do not skip required feature tests just to report success.

## 5. Language

Respond in Vietnamese, retaining technical terms when needed. Write concisely, clearly, and to the point, with an emphasis on practicality. Use bullet points when they improve readability.

## 6. Rules by project type

For Node.js/TypeScript backend changes, read and follow [Backend Coding Conventions](rules/backend-coding-conventions.md) before editing backend code or its tests.

Only when a task modifies a Liquid/Shopify theme or optimizes Core Web Vitals for a theme, read `rules/lighthouse-performance.md` in the target repository before making the relevant changes. If the file is missing, explicitly report the missing rules and request their contents; do not infer the rules yourself. Other repositories and tasks do not require these rules.

## 7. Design of this workspace

When designing or implementing Agent Harness, read the [spec](docs/superpowers/specs/2026-09-23-agent-harness-design.md) and use the version approved by the user. Propose a spec revision if there is a conflict; do not silently change requirements.

This `AGENTS.md` applies to the Agent Harness workspace. When building functionality to orchestrate other repositories, use the behavioral rules in sections 1–6 as a baseline managed by the harness, combined with the target repository's instructions; do not copy section 7 or overwrite the target repository's `AGENTS.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
