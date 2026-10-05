# Story Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Cho phép chọn story có point và dependency, thực thi tuần tự và bàn giao PR riêng hoặc PR chung với checkpoint an toàn.

**Architecture:** Giữ task cũ; bật split tạo feature coordinator. PR riêng dùng task con liên kết; PR chung dùng story cursor trên task gốc với evidence theo story và verify/review tổng hợp trước delivery cuối.

**Tech Stack:** TypeScript, Zod, SQLite store hiện có, Next.js 16.3.6, React 19.3.0, Vitest, Playwright, Git/gh.

**Spec:** `docs/superpowers/specs/2026-10-06-story-delivery-design.md`

## Global Constraints

- Node >=24.18.0 <25, không thêm dependency runtime.
- Không thay model/effort policy, approval gates, fencing/reconciliation hoặc quy tắc evidence hiện có.
- Giữ các thay đổi unrelated đang có trong workspace; không commit/push nếu chưa được yêu cầu.
- Story points chỉ 1, 2, 3, 5, 8; mặc định dừng sau mỗi story.
- Task cũ thiếu split/stories phải chạy nguyên luồng.
- Đọc hướng dẫn Next.js tại `node_modules/next/dist/docs/` trước sửa UI.
- Implement trong chat hiện tại; không dispatch subagent nếu chưa được yêu cầu.

## Review Focus

- Stale selection/replan: selection gắn planVersion, không tái dùng approval cũ.
- Dependency chưa merge, kể cả squash: không coi PR opened là dependency ready.
- Crash sau commit trước persistence: nhận lại commit có marker, không commit lặp.
- Story sau làm hỏng story trước: final checks/review phải fail và chặn PR chung.
- Task cũ và đổi story: parser tương thích, không reset repair count hoặc dùng nhầm evidence.

### Task 1: Contracts, story validation và plan projection

**Files:** Modify `src/core/contracts.ts`, `src/core/acceptance.ts`, `src/worker/stages.ts`; Create `src/core/stories.ts`; Test `tests/unit/stories.test.ts`, `tests/unit/planning.test.ts`.

**Interfaces:** `StorySchema`, `StorySelectionSchema`, optional `Plan.stories` và `Task.splitIntoStories`. `validateStories(plan: Plan): string[]`; `selectedStories(plan: Plan, selection: StorySelection): Story[]`; `projectStoryPlan(plan: Plan, storyId: string, baselineCommit: string): Plan`.

- [x] Viết tests cho point không hợp lệ; ID/cycle/mapping/dependency lỗi; selection rỗng, thiếu dependency hoặc sai version; topological order; projection criteria/steps/checks/screenshots; parse task cũ.
- [x] Chạy tests, xác nhận fail do thiếu contract/hàm.
- [x] Implement validation, projection và hướng dẫn planner chỉ trả stories khi bật split.
- [x] Chạy `npm run test:unit -- tests/unit/stories.test.ts tests/unit/planning.test.ts` và typecheck; chỉ đi tiếp khi pass.

### Task 2: Approval, coordinator và PR riêng

**Files:** Modify `src/server/services.ts`, `src/server/http.ts`, `src/worker/engine.ts`, `src/worker/stages.ts`; Create `src/worker/stories.ts`; Test `tests/integration/story-coordinator.test.ts`.

**Interfaces:** `approveStorySelection(store: Store, task: Task, selection: StorySelection): void`; `reconcileFeatureStories(store: Store, featureId: string, signal: AbortSignal): Promise<void>`. Records selection/story-run/child linkage; task con có featureId/storyId liên kết bất biến. Dùng transaction và revision của store hiện có.

- [x] Viết tests approval transaction và stale version; child tạo đúng một lần; dependency chưa tích hợp blocked; xác minh ancestry bằng fixture Git; squash trường hợp không chứng minh thì blocked; default pause và auto-next; replan không bỏ checkpoint; repair count không reset.
- [x] Chạy tests, xác nhận fail.
- [x] Implement worker scheduling tuần tự; derive plan con đã duyệt khi baseline giữ nguyên; source đổi quay lại discover/plan và approval. Không fetch/mutate Git trong transaction SQLite.
- [x] Chạy tests mới và `tests/integration/worker.test.ts`, `tests/integration/plan-feedback.test.ts`.

### Task 3: PR chung, checkpoint và recovery

**Files:** Modify `src/worker/stages.ts`, `src/worker/engine.ts`, `src/worker/recovery.ts`, `src/delivery/github.ts`, `src/delivery/report.ts`; Create `src/delivery/checkpoint.ts`; Test `tests/integration/story-delivery.test.ts`.

**Interfaces:** `createStoryCheckpoint(store: Store, data: string, task: Task, signal: AbortSignal): Promise<StoryCheckpoint>`; checkpoint key featureId/version/storyId/fingerprint. Active projected plan và baseline truyền tường minh vào verify/review/checkpoint; plan gốc giữ bất biến.

- [x] Viết fixture hai stories trên một branch; assert hai checkpoint commits, không push/PR giữa chừng, final required checks trên cuối branch.
- [x] Viết test story 2 làm hỏng story 1: final verify fail, PR không được tạo. Test stale review/checks không được pass; screenshot mapping hợp lệ; repair budget giữ xuyên stories.
- [x] Viết crash/retry tests sau commit và PR side effect; assert không duplicate, completed story không implement lại và HEAD ngoài checkpoint thì blocked.
- [x] Chạy tests, xác nhận fail.
- [x] Tách commit/checkpoint từ delivery với gate evidence/scope và marker riêng; persist history trước đổi cursor; cuối lượt chạy verify/review trên projected selected-feature plan và baseline feature.
- [x] Chạy tests mới cùng delivery, acceptance và prepare/verify regression liên quan; typecheck.

### Task 4: Story picker và tiến độ trên UI

**Files:** Modify `src/components/organisms/workspace/new-task-form.tsx`, `src/components/organisms/task-detail/task-plan.tsx`, `src/components/organisms/task-detail/types.ts`, `src/components/pages/task-detail-page.tsx`, `src/server/http.ts`; Create `src/components/organisms/task-detail/task-stories.tsx`; Test `tests/e2e/stories.spec.ts`, `tests/support/e2e-agent.ts`.

**Interfaces:** Task detail API trả selection/storyRuns/child links, client gửi selection trong approve payload cùng version/revision. Story picker chỉ dùng contract API, không thực hiện orchestration trong browser.

- [x] Đọc `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` và guide forms hiện có trước sửa UI.
- [x] Viết E2E bật split, chọn stories/mode, lỗi dependency, stale approval; default checkpoint pause/resume; auto-next; completed story giữ sau gián đoạn; link PR/task con; old task không có picker.
- [x] Chạy E2E và xác nhận fail do UI thiếu.
- [x] Implement checkbox split, cards/checkbox chọn story, hai mode, auto-next toggle mặc định false; progress/checkpoint và thông báo chờ có hành động cụ thể.
- [x] Chạy E2E mới và typecheck; xem screenshot của luồng selection/checkpoint ở desktop và viewport hẹp.

### Task 5: Tích hợp, tài liệu và kiểm tra cuối

**Files:** Modify `README.md`, spec gốc chỉ để liên kết extension được duyệt; Tests feature ở bốn tasks trên.

- [x] Đối chiếu tám tiêu chí nghiệm thu spec với tests, kiểm tra phạm vi diff và giữ unrelated edits.
- [x] Chạy unit/integration feature và regression ở approval, worker, delivery; chạy E2E stories và typecheck.
- [x] Tự review diff: approval/dependency/fencing, evidence theo story, idempotency, aggregate check trên snapshot cuối, backward compatibility.
- [x] Sửa lỗi trong phạm vi rồi chạy lại các checks bị ảnh hưởng; ghi rõ legacy tests không chạy.
- [x] Cập nhật hướng dẫn hai mode, checkpoint và dependency merge; báo kết quả với bằng chứng, giới hạn và file thay đổi. Không commit/push tự động.

## Trạng thái review

Người dùng đã duyệt spec và plan trong chat. Đã triển khai và kiểm chứng theo [báo cáo](../../verification/2026-10-06-story-delivery.md). Không commit/push; giữ ledger và các thay đổi khác trong workspace.
