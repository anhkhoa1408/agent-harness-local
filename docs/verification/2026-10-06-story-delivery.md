# Kiểm chứng story delivery — 2026-10-06

## Phạm vi đã triển khai

- Tạo task có lựa chọn chia story; planner đề xuất point 1/2/3/5/8, tiêu chí và dependency.
- Story picker có hai chế độ: PR riêng từng story hoặc một PR chung; mặc định dừng sau mỗi story, tùy chọn tiếp tục tự động.
- PR riêng có task/branch riêng và gate xác minh dependency đã tích hợp; base thay đổi quay lại discover/plan để duyệt.
- PR chung có commit/checkpoint riêng, evidence gắn với story/baseline và verify/review tổng hợp trên snapshot cuối.
- Approval gắn version/revision; scope/mode đã bắt đầu bị khóa; replan giữ checkpoint và repair count.
- Pause/cancel feature dừng task con; gián đoạn story sau không làm mất checkpoint trước.
- Task cũ không bật split giữ pipeline cũ. Không thêm quota estimate hoặc tự merge.

## Kết quả

- **PASS:** typecheck.
- **PASS:** 56 unit/integration tests trong 11 files: stories, planning, acceptance, coordinator, checkpoint/delivery, prepare/verify, worker, plan feedback, HTTP và pipeline.
- **PASS:** 5 E2E stories: PR chung pause/resume, PR riêng chọn phạm vi, tự tiếp tục, replan sau checkpoint, quota interruption rồi resume.
- **PASS:** 2 E2E regression plan-feedback/settings trong lượt kiểm tra trước.
- **PASS:** visual QA ảnh picker, desktop và mobile 390px; không có horizontal overflow của trang trong test.
- **PASS:** Git diff whitespace check.
- **SKIPPED:** legacy tests ngoài phạm vi đã chọn, production build, agent subscription thật và GitHub thật.

Unit/integration dùng temporary Git repositories và SQLite thật. E2E dùng browser, worker, Git và test runner thật; agent được mô phỏng. GitHub delivery dùng port mô phỏng với bare Git remote local, bao gồm tình huống mất response khi tạo PR. Không tạo PR hoặc dùng quota tài khoản thật trong kiểm chứng này.

## Bằng chứng hồi quy

Các test chứng minh: cycle/mapping/selection sai bị từ chối; approval lỗi không persist selection; checkpoint replay sau crash không thêm commit; PR replay không tạo trùng; HEAD ngoài checkpoint bị chặn; story sau làm hỏng story trước bị final verify phát hiện; report/artifact checkpoint cũ vẫn dùng được sau replan; từng story nạp đúng AGENTS trong thư mục sửa; pause/cancel giữ completed checkpoints; required checks dùng chung không bị mất khi project plan; coordinator không tạo child trước approval; dependency squash chưa chứng minh ancestry bị chặn.

## Quyết định triển khai

- Giữ sourceCommit của feature và dùng task/plan projection theo baseline story trong stage: nếu projection sai có thể dùng nhầm evidence, nên được kiểm chứng bằng stale-evidence và aggregate-regression tests.
- Story cần base mới sau dependency merge yêu cầu duyệt plan con mới: người dùng có thêm một bước duyệt để giữ gate base-update.
- Khi PR chung đã bắt đầu, prepare giữ baseline và nạp lại rules theo story, không đồng bộ base mới vào checkpoint cũ: conflict với nhánh đích sau đó cần xử lý bằng quy trình Git bình thường.
- Story evidence identity nằm ở sidecar, attempt metadata và checkpoint chứa đầy đủ checks/review: gate review/checkpoint từ chối sidecar cũ.
- Rà soát cuối do tác giả thực hiện theo plan đã duyệt; không có reviewer độc lập. Không commit/push từ workspace đang có thay đổi khác.

## Cách chạy lại

```sh
npm run typecheck
npx vitest run tests/unit/stories.test.ts tests/unit/planning.test.ts tests/unit/acceptance.test.ts tests/integration/story-coordinator.test.ts tests/integration/story-delivery.test.ts tests/integration/delivery.test.ts tests/integration/prepare-verify-stages.test.ts tests/integration/worker.test.ts tests/integration/plan-feedback.test.ts tests/integration/http.test.ts tests/integration/pipeline.test.ts
npx playwright test tests/e2e/stories.spec.ts tests/e2e/plan-feedback.spec.ts
```

Môi trường hạn chế quyền mở local port cần cấp quyền chạy E2E. Lượt sandbox ban đầu bị EPERM; các lượt E2E sau chạy với quyền được cho phép và pass.
