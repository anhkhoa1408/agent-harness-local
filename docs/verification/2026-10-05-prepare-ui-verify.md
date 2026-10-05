# Kiểm chứng Prepare và UI Verify — 2026-10-05

Hai stage hiện có được mở rộng theo yêu cầu đã chốt. Spec chính và README đã cập nhật; không thêm stage hoặc lựa chọn model mới.

- Prepare: fetch base remote rồi merge trong worktree riêng; repo gốc giữ nguyên. AI chỉ resolve file conflict, worker stage/commit. Baseline đổi vô hiệu approval và evidence, chạy lại discovery/plan trước implement. Worktree dirty được giữ và blocked. Retry sau lỗi merge commit dùng resolution đã xác minh, không gọi AI lại.
- Verify: runner chạy required checks; chỉ khi chúng pass và plan có `uiVerification` mới gọi một lượt AI đọc tối đa 6 ảnh PNG. Lưu verdict, fingerprint và hash ảnh; review/delivery kiểm tra bằng chứng này. Repair nhận lỗi với log tail rút gọn. Dashboard hiển thị selection và link mở ảnh.

## Kết quả thực tế

- **Passed:** `npm run typecheck`.
- **Passed:** 67 tests trong 13 file unit/integration liên quan: `prepare-base`, `prepare-verify-stages`, `ui-verification`, `screenshot-artifact`, `failure-evidence`, `ui-verification-plan`, `pipeline`, `execution`, `delivery`, `acceptance`, `checks`, `http`, `subagents`.
- **Passed:** `npx playwright test --config tests/support/ui-verification-playwright.config.ts` — 1 browser test; ảnh Chromium thật tại viewport 390×844 được copy/hash, selection hiển thị và link ảnh đúng. Test dùng fixture HTML, không khởi chạy dashboard/worker.
- **Passed:** `git diff --check`.
- **Skipped:** full legacy suite, production build, full dashboard E2E và task thật qua tài khoản Codex. Agent calls trong stage tests dùng client giả lập; chưa chứng minh chất lượng đánh giá ảnh hoặc resolution nghiệp vụ của model thật.

Browser ban đầu không khởi động được trong sandbox macOS; chạy ngoài sandbox đã được phép và pass. Typecheck từng thấy lỗi ở timeline trong phần UI đang chỉnh song song; lần kiểm tra cuối đã pass.

Task/plan cũ không có selection vẫn dùng runner-only. Plan UI mới cần command E2E thật tạo PNG viewport-only với deviceScaleFactor=1, map required check/criteria và chỉ rõ reference local nếu có. Thiếu screenshot/reference hoặc sai viewport không được tính là pass.
