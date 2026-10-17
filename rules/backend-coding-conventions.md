# Backend Coding Conventions

Apply these rules when changing Node.js/TypeScript backend code or its tests.
Follow the approved design spec and [backend architecture](../docs/backend-architecture.md).
Keep each coding convention file under 50 lines, including headings and blank lines; split larger files by topic and link them here.

## Runtime and style

- Use the Node.js version range in `package.json` (`>=24.18.0 <25`); use the existing npm scripts.
- Use TypeScript with the existing strict compiler settings and ES module imports/exports.
- Follow `.prettierrc.json` and `eslint.config.mjs`: 2 spaces, double quotes, semicolons, and trailing commas.
- Use `camelCase` for variables/functions, `PascalCase` for types/classes, and kebab-case file names matching nearby modules.
- Prefer `const`; use `let` only for reassignment. Use `import type` for type-only dependencies.
- Use `unknown` for untrusted values and narrow them before use; avoid `any` and assertions that bypass validation.
- Keep functions focused; extract helpers only for a clear responsibility or actual reuse.

## Layers and dependencies

- Keep domain policies pure TypeScript, without framework dependencies, Zod, or Node.js I/O.
- Put use cases, ports, input/output types, and transaction boundaries in application.
- Keep SQLite, Git, RPC, process, and filesystem operations in infrastructure adapters.
- Keep presentation focused on request parsing, response/error mapping, and calling application services.
- Wire dependencies and manage startup/shutdown in bootstrap; keep Next.js route entrypoints thin.
- Domain/application must not import infrastructure or frameworks, including through type imports.
- Access other application modules through their public `index.ts`; avoid circular dependencies.
- Do not introduce a DI framework, generic base service/repository, or compatibility facade.

## Types, constants, and contracts

- Reuse existing domain types, ports, and validation adapters rather than duplicating contracts.
- Keep constants in the owning layer/module's `constants/`, using classes with `static readonly` members and private constructors.
- Preserve literal types and tuple order for constants used by unions or schemas.
- Keep pure helpers in the owning layer; keep hashing, paths, and delays in infrastructure.
- Preserve public DTOs, serialized values, record keys, and artifact formats unless an approved change requires otherwise.

## Async work, errors, and persistence

- Await async work or explicitly manage its lifecycle; propagate cancellation and release resources in `finally` where needed.
- Keep synchronous SQLite transactions free of async RPC, Git, or process work; use existing unit-of-work and repository ports.
- Preserve lease fencing, optimistic revisions, and command/effect idempotency on worker writes.
- Handle errors where recovery or translation is possible; preserve existing error codes and HTTP mapping.
- Keep retry conditions, deadlines, and cancellation with the caller; do not silently add retries or fallbacks.

## Verification

- Add focused Vitest tests for new behavior and regression tests for bug fixes; use integration tests for adapter boundaries.
- For dependency changes, run `npx vitest run tests/unit/backend-boundaries.test.ts`.
- Run affected tests, `npm run typecheck`, and `npm run lint`; run build/E2E when the affected flow requires them.
- Check changed Markdown with Prettier and `git diff --check`; report failed, blocked, or skipped checks explicitly.
