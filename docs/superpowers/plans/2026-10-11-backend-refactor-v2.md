# Backend refactor v2

Được người dùng duyệt ngày 2026-10-11. Baseline: b76bce4.

Giữ Clean Architecture, HTTP API, SQLite schema/record keys, error/event codes, model/timeout policy, runtime recovery, hash inputs và artifacts. Không UI changes, dependencies, migrations hoặc data cache. Constants là class static readonly/constructor private theo layer sở hữu, ngoại lệ có chủ đích cho quy tắc class lifecycle trong spec 2026-10-09.

## Task 1: Constants
Gom limits, task status/stages/model defaults, RPC methods, persistence record kinds, HTTP statuses và error/event codes vào constants theo ownership. Giữ literal types/tuple ordering. Không gom SQL, text hiển thị và mọi 0/1. Kiểm chứng backend tests, boundaries và typecheck.

## Task 2: Utils và readability
Gom plan/story keys, error message fallback, content hash, path containment và delay/backoff; giữ retry decisions tại caller. Tách phần khó đọc, giữ public interfaces. Thêm tests cho keys/hash/path/timing và chạy backend.

## Task 3: Performance
Dashboard nhóm attempts theo task một lần/request, giữ thứ tự. Record CRUD reuse bốn prepared statements/connection, giữ transaction/fencing/ordering. Test nhiều task, empty/repair/replan, statement reuse/connections/rollback/fencing. Đo dashboard projection và record CRUD trước/sau cùng fixture.

## Task 4: Verification và delivery
Backend suite, typecheck, lint, build, E2E đối chiếu baseline, native Codex delegation/cancellation smoke. Review độc lập toàn diff; sửa regression trong phạm vi. Commit theo nhóm, push origin/codex/refactor-v2, xác minh remote SHA. Không tạo PR/merge.
