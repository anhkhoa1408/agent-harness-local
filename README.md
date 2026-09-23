# Agent Harness · local MVP

Dashboard Next.js và worker Node.js độc lập, dùng SQLite. Pipeline cố định: discover → analyze → plan → prepare → implement → verify → review → repair/deliver. Mỗi feature có branch/worktree riêng; chỉ một task chạy tại một thời điểm.

## Chạy local

Yêu cầu: macOS (môi trường đã kiểm tra), Node **24.18+ trong nhánh 24**, npm, Git, Codex CLI có `app-server`. GitHub CLI chỉ cần nếu bàn giao PR.

```sh
nvm use
npm ci
codex login
npm run dev
```

Mở `http://127.0.0.1:3000`. Lần mở đầu tạo session HttpOnly cùng origin. Chỉ bind loopback; không triển khai lên public server. Đóng browser không dừng worker; Ctrl+C trong terminal dừng cả web/worker.

1. Trong **Model & skills**, chọn model + effort cho tất cả AI stages từ catalog của Codex đang đăng nhập. Chọn model mạnh cho **plan** (bao gồm replan), model trung bình cho **implement**. Không tự fallback hoặc chuyển sang API tính phí.
2. Điền thư mục skill roots: thư mục chứa `writing-plans/`, `test-driven-development/`, `systematic-debugging/`… của Superpowers và `grilling/` của Matt Pocock. Đường dẫn tùy phiên bản plugin cài trên máy. `baseline` tùy chọn, mặc định dùng AGENTS.md của harness, mục 1–6.
3. Đăng ký đường dẫn repo Git có commit và nhánh nguồn. Repo đích có thể là JavaScript, Python hoặc ngôn ngữ khác; harness không mặc định chạy npm trong repo đích.
4. Tạo task, trả lời câu hỏi, đọc plan và duyệt command/test scope trước khi code.
5. Xem tests, review, timeline và báo cáo. Có thể đổi model của task tại stage boundary bằng cách lưu Settings rồi áp dụng vào task.

Codex dùng login/subscription hiện có. Model khả dụng và giới hạn do tài khoản/runtime quyết định; giá gói không được dùng để suy ra quota hay quyền model. Khi quota hoặc model lỗi, task bị chặn để bạn xử lý rồi resume.

## Dữ liệu và Git

Mặc định: `.harness/harness.db`, `.harness/artifacts/<task-id>/`, `.harness/worktrees/<task-id>/`. Đổi bằng `HARNESS_DATA_DIR=/absolute/path`. Web và worker phải dùng cùng thư mục. Có thể chạy riêng bằng `npm run web` và `npm run worker`.

Repo gốc không được sửa; worktree tạo từ commit đã chọn. Các skill/rule được snapshot theo task. Mỗi plan có version riêng; plan mới hủy approval cũ. Không tự merge, deploy, force-push hoặc xóa worktree.

Local delivery tạo commit và báo cáo. GitHub delivery cần `gh auth login`, remote GitHub, quyền push và nhánh target tồn tại. PR có marker để tìm lại sau mất kết nối; branch/PR bị đổi bên ngoài sẽ bị chặn. Không có remote thì bàn giao local. Có thể chuyển task delivery lỗi sang local trong UI.

## Test scope và evidence

Chỉ checks trong plan đã duyệt là bắt buộc. Test cũ ngoài feature được bỏ qua, **không ghi nhận là passed**. Report hỗ trợ TAP/JUnit; command trả exit 0 nhưng không chạy đủ test hoặc skip test bắt buộc vẫn bị chặn. Với tool không có report, plan cần successPattern literal và review evidence. Build/typecheck dùng exit code.

Command dùng executable + argv, cwd nằm trong worktree, environment allowlist và timeout. E2E command/script của repo chịu trách nhiệm chọn port, chờ readiness và dừng server; process runner dừng process group khi kết thúc hoặc abort. Các prerequisites/dependency install phải thể hiện trong plan; agent yêu cầu quyền bổ sung qua UI nếu Codex runtime cần approval.

Tối đa 3 repair attempts; TDD red trong implement không tiêu budget. Review dùng conversation mới, read-only. Delivery kiểm tra lại approval, fingerprint, required checks và acceptance criteria.

## Pause, crash và giới hạn MVP

- Pause hoặc Ctrl+C: chờ interrupt/process hoàn tất rồi mới cho resume, giữ nguyên branch/worktree. Stage đang dở có thể chạy lại trong conversation mới với plan/evidence đã lưu.
- Crash/SIGKILL hoặc mất kết nối khi chưa xác nhận runtime đã dừng: `runtime_state_unknown` khóa toàn bộ writer, kể cả khi task bị hủy. Không tự đoán rằng hết lease nghĩa là process đã chết.
- **Recovery bảo thủ:** phiên bản này xác nhận toàn bộ process cũ đã dừng sau khi máy khởi động lại (boot identity trên macOS/Linux), rồi đưa task về paused để bạn resume. Chưa có cơ chế tự thu hồi mọi subprocess Codex còn sót khi chỉ restart worker. Không chỉnh DB để bỏ khóa khi process cũ có thể còn chạy.
- Mỗi stage giới hạn 30 phút. Git subprocess và toolchain vẫn chạy local; đây không phải môi trường cô lập dành cho repo không đáng tin cậy.
- Discovery chỉ lấy file text từ commit, tối đa 64 KB/file và 500 KB tổng; bỏ các tên secret phổ biến. File thiếu/bị cắt cần được coi là unknown. Chưa có semantic index cho monorepo rất lớn.
- Chưa kiểm chứng Windows; không tuyên bố mọi toolchain/format report đều được hỗ trợ.

## Kiểm chứng

```sh
npm run test:unit
npm run test:integration
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E tự tạo repo/data tạm và dùng fake agent; Git/process/test runner thật. `HARNESS_TEST_MODE=1` chỉ dành cho fixture, không bật khi dùng thật. Không có endpoint HTTP bật test mode. PR tests dùng fake GitHub + bare remote, không tạo PR thật.

Smoke runtime, không inference:

```sh
node --import tsx scripts/codex-smoke.ts --catalog
```

Smoke read-only có sử dụng model (chọn ID/effort từ catalog):

```sh
node --import tsx scripts/codex-smoke.ts --read-only --model MODEL_ID --effort EFFORT
```

Xem thiết kế và implementation plan trong `docs/superpowers/`.
