# Backend refactor implementation plan

Spec: ../specs/2026-10-06-backend-refactor-design.md
Base: c19541f; branch: codex/refactor. Node 24.18.

### Task 1: Khóa baseline
Worktree riêng, chạy backend baseline; lưu design/plan đã duyệt.
### Task 2: Constants và types
Named policy limits, core evidence types, explicit AgentClient methods/inputs/events; migrate callers/fixtures trong cùng commit. Typecheck và Codex/pipeline tests.
### Task 3: Application services
PlanService/StoryService, validation riêng; bỏ server-worker/delivery-worker dependencies. Plan feedback/story/transaction tests.
### Task 4: Runtime cha-con
ParentAgentSession, DelegatedStageAttempt, protocol decoding. Giữ audit, start-settled, completion wakeup, two cancellation sweeps và cleanup semantics. Toàn Codex/subagent tests.
### Task 5: Worker và stages
StageAgentExecutor, ApprovalBroker, stage handlers, WorkerRuntime; command/recovery/attempt persistence. Worker/pipeline/prepare/verify/story tests.
### Task 6: HTTP, storage và adapters
Resource routes, storage repositories cùng DB, GitHub CLI adapter, check parsers. HTTP/store/execution/delivery tests.
### Task 7: Nghiệm thu và push
Dependency guard RED→GREEN; typecheck/build, backend suites và E2E đã chỉ định; native fixture smoke. Review toàn branch, sửa findings trong phạm vi, báo evidence rồi push và xác minh remote SHA.

## Constraints
Không đổi wire/persistence contracts, policy values, event/error codes hoặc frozen bundles. Không thêm DI framework, provider, abstract base classes. Test hiện có trước/sau; chỉ thêm characterization cho ranh giới thiếu coverage. Bugs ngoài scope ghi riêng. Không force push, merge hoặc PR.
