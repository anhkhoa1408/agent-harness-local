# Kiểm chứng agent mapping — 2026-10-03

Branch: `codex/agent-stage-mapping`, phát triển từ `4256cce` của MVP trong worktree riêng.

## Kết quả

- 43 unit/integration tests, 16 files: pass.
- 7 Playwright E2E tests trên production build: pass.
- TypeScript, production build và git diff --check: pass.
- Live Codex catalog xác nhận gpt-6-astra/high và gpt-6-luna/medium khả dụng.
- UI production ở cổng 3001 hiển thị effort cố định, profile mapping; lưu model mặc định và skill roots thật thành công.
- Tests chứng minh profile vào prompt đúng stage, reviewer read-only, snapshot optional E2E, plan approval và repair; hai feature có worktree độc lập và retry giữ edits.

## Review độc lập

Không có finding actionable cần chặn. Reviewer kiểm tra policy ingress/runtime/log, snapshot cũ, E2E activation/replan, 11 SHA256 upstream và license. Đề xuất test bổ sung trực tiếp persisted attempt/configure/POST task là tùy chọn; các đường này đã được đọc code, policy và pipeline được kiểm chứng. Không tuyên bố fixture tests đánh giá chất lượng suy luận model thật.

## Giới hạn và các quyết định

- E2E dùng fake agent với Git/SQLite/runner/browser thật. Chưa chạy pipeline code bằng model thật hay tạo PR thật cho thay đổi này.
- Nguồn agent được pin commit; bản adapted ngắn là nội dung runtime. Không chạy installer upstream hay nạp metadata Claude vào runtime Codex.
- Model tiết kiệm là default cấu hình, không phải cam kết quota hoặc số tiền tiết kiệm đã đo.
- Stack detection từ committed manifests/source; repo hỗn hợp hoặc chưa nhận diện dùng generic implementer. Không ép mọi repo dùng Next.js.
- Task cũ giữ model/profile snapshot; effort thực thi của attempt mới theo code policy. Không sửa lịch sử attempt cũ.
- Giới hạn snapshot và recovery của MVP giữ nguyên; review không chứng nhận lại phần ngoài diff.
- Build đầu gặp symlink node_modules ra ngoài worktree; đã thay bằng npm ci từ cache theo lockfile và build pass. Không đổi dependency versions.
- E2E Settings đầu mở trước session bootstrap nên về dashboard. Test đã đi qua dashboard/session rồi mở Settings; cả 7 tests pass.
