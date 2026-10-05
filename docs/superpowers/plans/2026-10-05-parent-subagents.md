# Parent/subagents Implementation Plan

**Goal:** Một parent Codex thread/task, native clean-context subagent cho mỗi AI stage attempt, worker xác thực evidence và lifecycle.
**Spec:** ../specs/2026-10-05-parent-subagents-design.md (người dùng duyệt và yêu cầu implement trong chat).
**Execution:** Inline trong worktree hiện có `codex/portable-pipeline-ui`; giữ nguyên các thay đổi có sẵn, không commit/push ngoài yêu cầu.

## Constraints và quyết định

- Worker giữ gates; cha `gpt-6-luna/medium`, con giữ stage model/effort; không fallback.
- Runtime-only; không thay UI/Next.js APIs. Con mới mỗi attempt, `fork_turns=none`.
- Parent có sandbox của stage; đây là giới hạn hành vi cho cha, không phải cách ly quyền cha/con.
- Model/catalog/visibility không đáp ứng phải blocked; unknown writer phải giữ exclusion.

## Task 1: Native adapter và evidence

- [x] Viết và chạy RED `tests/integration/subagents.test.ts`: start/resume parent, child identity/model/sandbox/context, fake parent success/mismatched result, cancel cả cây, mất phản hồi.
- [x] Thêm `src/codex/subagents.ts`; mở rộng `AgentInput` bằng delegation identity và `AgentRun` bằng parent/child metadata. `CodexClient.run` gọi native adapter cho input delegated, giữ direct run cho read-only helper ngoài pipeline.
- [x] GREEN adapter tests; kiểm tra native events và quyền bằng live smoke.

## Task 2: Worker wiring và context riêng

- [x] RED pipeline test: discover cũng delegated, parent mapping bền vững, child mới, task context không chứa model/runtime config, review read-only.
- [x] `stages.ts` thống nhất discovery qua AI handler và lưu mapping/metadata vào runtime + attempt. Engine merge evidence đã lưu thay vì ghi đè attempt. `prompts.ts` xây instructions điều phối và packet riêng cho con.
- [x] Cập nhật fixtures biểu diễn parent/child rõ ràng. GREEN pipeline, execution mode, plan feedback và recovery tests liên quan.

## Task 3: Verification và tài liệu

- [x] Typecheck, targeted tests và live native smoke: cùng parent qua read-only → write → review, con đúng model/effort/cwd, pause/cancel dừng toàn cây.
- [x] Review riêng thay đổi; fix findings có test hồi quy; cập nhật README và spec gốc sau proof.
- [x] Ghi pass/blocked/skipped đúng thực tế; không báo migration hoàn tất nếu live proof bắt buộc chưa đạt.

## Review Focus

- Event tới trước turn/start response hoặc cha kết thúc trước con.
- Child/grandchild phát sinh trong lúc cancellation.
- Parent được resume với cwd snapshot cũ đã xóa hoặc sandbox vẫn là workspace-write khi review.
- Crash giữa spawn và persist child identity.
- Parent output có schema đúng nhưng không có child evidence hoặc khác kết quả của con.

## Ledger

- 2026-10-05: Spec approved by user `implement đi`; triển khai liên tục theo instruction hiện tại, không hỏi lại scope. Worktree đã có nhiều thay đổi, chỉ sửa phần cần cho feature.
- Native inspection: child resume cần parent được load trước. Metadata settings chứa `model`, `reasoningEffort`, `cwd`, `sandbox`, `approvalPolicy`, `thread.parentThreadId`. Kill app-server khi cha hoàn tất có thể interrupt child đang hoàn tất; phải chờ child turn thực sự dừng.
- Adapter + worker được triển khai. Child rollout có thể chưa durable khi spawn event đến: retry có deadline. Root/subagent dùng role-scoped developer instructions vì native runtime vẫn kế thừa developer instructions dù fork none.
- Runtime resume giữ sandbox của loaded parent: cập nhật qua `thread/settings/update` và read-back trước spawn. Restart không restore raw events: đối chiếu spawn trong durable rollout path do app-server trả; không fallback sang session độc lập.
- Review: hai race về pending turn/start cancellation và child completion bị mất wakeup được tái hiện RED, sửa GREEN. Message thiếu/plaintext sai bị từ chối; native ciphertext không có API giải mã nên việc đối chiếu nguyên văn là giới hạn visibility, đã công bố trong spec/README/report, không coi là proof.
- Bổ sung RED/GREEN cho preflight tree failure giữ unknown exclusion và cha reactivate con cũ qua cả hai dạng event. Unknown writer không được báo stopped.
- Feature suite cuối: 10 files / 59 tests passed; Typecheck passed; E2E lifecycle + feedback: 12 passed. Diff whitespace passed. Không chạy legacy ngoài phạm vi hoặc production build/Docker runtime.
- Native smoke passed: cùng cha qua analyze/plan Astra-high/implement/review; restart app-server; read-only ghi bị chặn và implement ghi được; cancel cả cây terminal; marker không fork lịch sử; resume sau xóa snapshot cũ; SIGKILL app-server giữ unknown rồi chỉ tạo con mới sau terminal reconciliation. Kill worker thật chưa smoke, recovery/exclusion có fixture tests.
- Báo cáo bền vững: `docs/verification/2026-10-05-parent-subagents.md`. Thay đổi chưa commit/push; giữ nguyên các thay đổi có sẵn của workspace.

- 2026-10-05, yêu cầu push: tách snapshot runtime cha–con + dependencies backend khỏi UI/login/folder-picker; đúng snapshot pass 58 tests, 10 lifecycle E2E và typecheck trên Node 24.18. Giữ các thay đổi khác ở workspace.
