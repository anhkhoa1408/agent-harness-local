# Refactor backend theo trách nhiệm

Thiết kế và implementation plan được người dùng duyệt ngày 2026-10-06.
Base: c19541f0d31444e5aa4bb8fac4dc2735b63390f8; branch đích codex/refactor.

## Contract giữ nguyên

Theo spec MVP, parent-subagents (bao gồm receipt ngày 2026-10-06) và story-delivery đã duyệt. Không đổi HTTP, schema SQLite, persisted records, error/event codes, artifact format, frozen bundles, model/permission policy, repair budget hoặc thứ tự stage.
Worker giữ gates. Một parent/task, một native child mới/attempt, fork_turns=none. Parent chỉ trả receipt stage/attemptId; worker xác minh và đọc result trực tiếp từ child. Unknown runtime giữ exclusion; cancellation phải xác nhận cả cây đã dừng.

## Trách nhiệm và dependency

Server và worker dùng application services. Application không import server/worker; adapters không import server/worker. Core chứa contracts/policy thuần, không import adapter.
PlanService sở hữu immutable plan, comment/revision và transaction. StoryService sở hữu selection, execution plan, baseline/evidence; Git orchestration riêng với validation/projection thuần.
StageAgentExecutor chuẩn bị context/packet, model, approval broker và runtime persistence. ParentAgentSession chuẩn bị/resume settings. DelegatedStageAttempt giữ lifecycle một native attempt, spawn audit/result/cancellation. WorkerRuntime giữ lease/scheduling; command, recovery và attempt persistence tách riêng. Stage handlers mỗi stage chỉ xử lý nghiệp vụ.
HTTP routing theo resource; storage task/event/command/record dùng cùng connection và fencing; GitHub CLI tách delivery orchestration; check parser tách process execution.
Class dành cho state/lifecycle; policy/validation dùng hàm thuần. Interfaces nhỏ, constructor/parameter injection; không DI framework/base class/provider mới.

## Tên và giới hạn

AgentClient: listModels, runDirectTurn, runDelegatedStage, respondToApproval, interruptTurn, close. Delegated input bắt buộc có identity/packet; event discriminated union. Native child agent khác story child task.
Constants đặt theo owner/đơn vị, giữ nguyên giá trị; policy chung một nguồn. HTTP codes và PNG format literals giữ tại chỗ. Không migration dữ liệu, không sửa bug/hành vi ngoài refactor.

## Kiểm chứng

Characterization suites trước/sau, architecture dependency test, typecheck/build, E2E lifecycle/feedback/stories/repository/login/artifacts; native fixture smoke persistent parent, settings và cancellation. Báo pass/fail/blocked/skipped theo evidence. Commit từng bước, push origin/codex/refactor không force; không tự merge hoặc PR.
