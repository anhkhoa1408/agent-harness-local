# Refactor backend theo trách nhiệm

Thiết kế và implementation plan được người dùng duyệt ngày 2026-10-06.
Base: c19541f0d31444e5aa4bb8fac4dc2735b63390f8; branch đích codex/refactor.

## Contract giữ nguyên

Refactor tuân theo spec MVP, parent-subagents (bao gồm receipt ngày 2026-10-06) và story-delivery đã duyệt. Giữ nguyên HTTP, schema SQLite, persisted records, error/event codes, artifact format, frozen bundles, model/permission policy, repair budget và thứ tự stage.

Worker quản lý các điều kiện chuyển bước. Mỗi task có một parent; mỗi attempt tạo một native child mới với fork_turns=none. Parent chỉ trả receipt stage/attemptId; worker xác minh và đọc result trực tiếp từ child. Khi trạng thái runtime chưa xác định, Harness giữ exclusion. Cancellation phải xác nhận cả cây agent đã dừng.

## Trách nhiệm và dependency

Server và worker dùng application services. Application và adapters không import server/worker. Core chứa contracts/policy thuần, không import adapter.

PlanService quản lý plan bất biến, comment/revision và transaction. StoryService quản lý selection, execution plan, baseline/evidence. Git orchestration được tách riêng; validation/projection dùng hàm thuần.

StageAgentExecutor chuẩn bị context/packet, model, approval broker và runtime persistence. ParentAgentSession chuẩn bị hoặc resume settings. DelegatedStageAttempt quản lý vòng đời của một native attempt, gồm spawn audit, result và cancellation. WorkerRuntime quản lý lease/scheduling; command, recovery và attempt persistence được tách riêng. Handler của từng stage chỉ xử lý nghiệp vụ stage đó.

HTTP routing được chia theo resource. Storage task/event/command/record dùng chung connection và fencing. GitHub CLI được tách khỏi delivery orchestration; check parser được tách khỏi process execution.

Class dành cho state/lifecycle; policy/validation dùng hàm thuần. Interfaces giữ nhỏ, dependency được truyền qua constructor hoặc parameter. Không thêm DI framework, base class hoặc provider.

## Tên và giới hạn

AgentClient có các phương thức listModels, runDirectTurn, runDelegatedStage, respondToApproval, interruptTurn và close. Delegated input bắt buộc có identity/packet; event dùng discriminated union. Native child agent và story child task là hai loại đối tượng riêng.

Constants được đặt theo thành phần sở hữu và đơn vị đo, giữ nguyên giá trị. Policy chung có một nguồn định nghĩa. HTTP codes và PNG format literals giữ tại chỗ. Không migration dữ liệu hoặc sửa bug, thay đổi hành vi ngoài phạm vi refactor.

## Kiểm chứng

Chạy characterization suites trước và sau refactor, architecture dependency test, typecheck/build và E2E lifecycle/feedback/stories/repository/login/artifacts. Chạy native fixture smoke cho persistent parent, settings và cancellation. Báo pass/fail/blocked/skipped theo bằng chứng thực tế. Commit từng bước và push origin/codex/refactor không force; không tự merge hoặc tạo PR.
