# Clean Architecture cho toàn backend

Thiết kế và plan được duyệt trong chat ngày 2026-10-09. Baseline: 2bded2d.
Kiến trúc này thay thế thiết kế refactor ngày 2026-10-06, giữ nguyên các quyết định sản phẩm trong spec MVP và các bổ sung parent-subagents/story delivery.

Domain chứa types và policy TypeScript thuần. Application quản lý use cases, pipeline, ports và input/output. Infrastructure triển khai SQLite, Codex, Git/process, context/artifacts, clock và scheduler. Presentation chỉ xử lý transport. Bootstrap kết nối dependency theo vòng đời của web hoặc worker.

Chiều dependency: presentation → application → domain; infrastructure → application/domain. Bootstrap được kết nối mọi adapter. Domain và application không import Node I/O, Zod, Next, infrastructure/presentation hoặc type của adapter.

Model catalog được tách khỏi phần thực thi agent. Giữ nguyên model mặc định, effort cố định, chính sách không fallback, task snapshot và ranh giới áp dụng thay đổi theo stage. Prepare dùng model repair khi có conflict; UI verification dùng model review. Mỗi task có một parent, mỗi attempt tạo child mới với fork_turns=none. Worker kiểm tra receipt và identity/result của child độc lập. Giữ nguyên cơ chế cancellation và exclusion khi trạng thái runtime chưa xác định.

Typed repositories và UnitOfWork giữ nguyên SQLite schema/record keys, transaction đồng bộ, nested savepoint, revision/command idempotency và fencing khi worker ghi dữ liệu. I/O bất đồng bộ chạy ngoài transaction. Giữ nguyên event/error codes, HTTP JSON, hành vi parse/default/error của Zod tại adapter, artifacts/packets và frozen bundles.

Chuyển từng phần chức năng; compatibility facade chỉ tồn tại trong quá trình chuyển và toàn bộ đường legacy phải được xóa khi kết thúc. Policy dùng hàm; class dành cho state/lifecycle. Không thêm provider, DI framework, base service/repository, migration hoặc dual write.

Kiểm chứng bằng dependency fixtures và các test về hành vi model/settings/task, typed persistence/rollback/fencing, agent packet/approval/cancel, crash recovery, verification/delivery và HTTP/E2E. Chạy native Codex smoke trong repo tạm; runtime fixture không thay thế smoke thật.

## Ngoại lệ constants được duyệt ngày 2026-10-11

Theo yêu cầu refactor v2, constants dùng class chứa `static readonly`, có constructor private và nằm trong thư mục `constants` của layer/module sở hữu. Đây là ngoại lệ của quy tắc dùng class cho state/lifecycle; policy vẫn dùng hàm. Giữ chiều dependency hướng vào trong, các contract HTTP/persistence/runtime và toàn bộ giá trị hiện hành. Chi tiết nằm trong [plan refactor v2](../plans/2026-10-11-backend-refactor-v2.md).
