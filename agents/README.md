# Bundled stage profiles

- `sources.json`: pinned GitHub URLs, commit revisions and upstream content hashes.
- `upstream/`: unmodified source profiles and each project's MIT license.
- `profiles/`: concise harness adaptations actually loaded into model context; filenames map from source ID by replacing `/` with `-`.

Routing lives in `src/context/agents.ts`. Agent context snapshots contain adapted content, its SHA256 and the pinned upstream source URL/hash. Changes to profiles affect new task snapshots; frozen tasks are not updated implicitly.

Adaptations preserve the relevant role workflow while dropping Claude-specific model/tool metadata, nonexistent context-manager calls, blanket coverage targets, unrelated architecture mandates and automatic delivery. Harness schemas, user-approved scope, permissions and stage transitions govern execution. Optional E2E guidance is frozen up front and activated by the approved test plan.

To update a source, review the upstream diff, preserve its license, update the source file and manifest, then deliberately revise the corresponding adapted profile and run mapping/context tests. Runtime never downloads upstream instructions.
