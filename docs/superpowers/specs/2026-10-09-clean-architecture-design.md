# Clean Architecture cho toàn backend

Thiết kế và plan được duyệt trong chat ngày 2026-10-09. Baseline: 2bded2d.
Thay thế kiến trúc refactor ngày 2026-10-06; giữ các quyết định sản phẩm của spec MVP và các bổ sung parent-subagents/story delivery.

Domain chứa types và policy TypeScript thuần. Application sở hữu use cases, pipeline, ports và input/output. Infrastructure triển khai SQLite, Codex, Git/process, context/artifacts, clock và scheduler. Presentation chỉ xử lý transport. Bootstrap nối dependency theo lifetime web/worker.

Dependencies: presentation → application → domain; infrastructure → application/domain. Bootstrap được nối mọi adapter. Domain/application không import Node I/O, Zod, Next, infrastructure/presentation hoặc type của adapter.

Model catalog tách khỏi agent execution. Giữ defaults, fixed effort, no fallback, task snapshot và stage boundary. Prepare conflict dùng repair; UI verification dùng review. Một parent/task, child mới/attempt, fork_turns=none, receipt và child identity/result kiểm tra độc lập. Cancellation và unknown-runtime exclusion giữ nguyên.

Typed repositories và UnitOfWork giữ SQLite schema/record keys, synchronous transaction, nested savepoint, revision/command idempotency và fenced worker writes. I/O bất đồng bộ nằm ngoài transaction. Giữ event/error codes, HTTP JSON, Zod parse/default/error behavior tại adapter, artifacts/packets và frozen bundles.

Chuyển từng lát cắt, dùng compatibility facade chỉ trong quá trình chuyển; cuối đợt xóa toàn bộ đường legacy. Policy là hàm; class dành cho state/lifecycle. Không thêm provider, DI framework, base service/repository, migration hoặc dual write.

Kiểm chứng: dependency fixtures, model/settings/task behavior, typed persistence/rollback/fencing, agent packet/approval/cancel, crash recovery, verification/delivery, HTTP/E2E và native Codex smoke trong repo tạm. Runtime fixture không thay thế smoke thật.
