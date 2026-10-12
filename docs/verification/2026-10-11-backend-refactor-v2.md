# Kiểm chứng backend refactor v2 — 11/10/2026

## Phạm vi và revision

Baseline `b76bce4`; code cuối `cf47aab5669838e4a537dec6ed936aa5360dccea`, nhánh `codex/refactor-v2`. Worktree gốc giữ nguyên trên main. Node **24.18.0**, dependencies/lockfile không đổi.

Constants class theo ownership, utils dùng chung, typed dashboard records và tách phần control flow khó đọc. HTTP JSON/status, SQLite schema/keys/order, event/error strings, model policy, retry/cancellation và hash inputs giữ nguyên. Không thay UI, không migration, không cache dữ liệu giữa requests.

## Kết quả

| Kiểm tra                                     | Kết quả                                            | Bằng chứng                                                |
| -------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| Baseline backend                             | 220 pass, 4 skip                                   | `/tmp/refactor-v2-baseline.log`                           |
| Backend cuối                                 | **229 pass, 4 skip**                               | `/tmp/refactor-v2-final-tests.log`                        |
| Typecheck, lint                              | **PASS**                                           | `/tmp/refactor-v2-types.log`, `/tmp/refactor-v2-lint.log` |
| Production build                             | **PASS**                                           | `/tmp/refactor-v2-build.log`                              |
| Full E2E baseline                            | 54 pass, 5 fail                                    | `/tmp/refactor-v2-baseline-e2e.log`                       |
| Full E2E sau refactor                        | 54 pass, cùng 5 fail baseline                      | `/tmp/refactor-v2-final-e2e.log`                          |
| E2E lifecycle/story sau chỉnh ownership cuối | **15 pass**                                        | `/tmp/refactor-v2-review-e2e.log`                         |
| Native Codex smoke                           | **PASS**: analyze, implement, review, cancellation | `/tmp/refactor-v2-native.log`                             |

9 tests mới bảo vệ record key/null version, error fallback, hash text/base64, symlink/path containment, retry delay/deadline, dashboard ordering/repair/replan và record statements/rollback/connections. Performance tests quan sát RED trước sửa: 288 taskId reads thay vì tối đa 48; 8 SQL preparations thay vì 4. Sau sửa các test pass. Các kiểm tra có sẵn tiếp tục bảo vệ nested transactions, fenced writes, malformed metadata, approval và cancellation.

4 Docker tests được skip vì chưa bật các opt-in flags: sandbox, compose, runtime và SSH agent. Không có kết luận runtime Docker từ đợt này.

### Các E2E failure đã đối chiếu

Cả 5 test dưới đây cùng fail trên baseline mới chạy và nhánh refactor, với cùng assertion/error:

- `lifecycle.spec.ts:191`: locator role status khớp hai phần tử.
- `plan-feedback.spec.ts:54`: locator role status khớp hai phần tử.
- `ui.spec.ts:129`: payload expectation khi tạo task không khớp.
- `ui.spec.ts:376`: thiếu accessible description cho execution mode.
- `workspace-dialogs.spec.ts:102`: không tìm thấy text `1 task` trong recent activity.

Không báo toàn bộ E2E xanh; không phát hiện E2E regression mới. Lượt cuối chỉ đổi các tên constants tương đương trong story state và trả JUnit wire key về literal, sau đó chạy lại backend/build và 15 E2E lifecycle/story. Full E2E ở `0928997`; các sửa cuối không chạm UI hoặc các assertion đang fail. Test settings lỗi baseline được loại bằng grep ở lượt focused, đã chạy đầy đủ ở hai lượt full.

### Native runtime

Một parent được dùng lại cho ba child khác nhau; quyền lần lượt read-only/workspace-write/read-only. File output do implement tạo được đối chiếu thật. Cancellation chỉ pass sau khi adapter xác nhận parent và các child terminal. Chạy trong Git repo tạm, không commit/push/PR lên repo người dùng. Smoke này không chứng minh toàn bộ delivery end-to-end bằng provider thật.

## Performance

Đo liên tiếp baseline và code cuối bằng cùng script, cùng Node 24.18 và cùng fixture. Hai vòng warmup, median của bảy mẫu; dashboard chỉ đo projection trong bộ nhớ, SQLite dùng `:memory:`.

| Workload                          | Baseline median | Sau refactor median | Tỷ lệ |
| --------------------------------- | --------------: | ------------------: | ----: |
| 1.500 tasks / 30.000 attempts     |       159.43 ms |             2.75 ms | 57.9× |
| 10.000 vòng record put/get/delete |       141.10 ms |            31.97 ms |  4.4× |

Đây là benchmark tổng hợp, không phải độ trễ HTTP hoặc tốc độ pipeline/Codex thực tế. Bằng chứng cấu trúc: grouping giảm quét lịch sử từ mỗi task xuống các lượt tuyến tính; bốn SQL statements tái sử dụng theo vòng đời connection, không thêm data cache. Có thể tái chạy:

```sh
node --import tsx scripts/backend-refactor-benchmark.mjs /path/to/baseline
node --import tsx scripts/backend-refactor-benchmark.mjs
```

## Review

Reviewer độc lập đọc toàn diff `b76bce4..0928997`, không thấy P0–P2. Hai P3 được xác nhận và sửa để hoàn tất yêu cầu ownership: story state dùng `StoryRunState`, task status dùng `TaskStatus`; tên phần tử JUnit `skipped` không gắn với domain status. Các giá trị không đổi. Tác giả kiểm tra delta cuối và chạy lại các kiểm chứng nêu trên; không có reviewer thứ hai.

Tài liệu/benchmark do tác giả kiểm tra; reviewer không tự chạy lại test/build/native/E2E. Không sửa các lỗi UI baseline ngoài phạm vi. Không có finding còn hoãn do thay đổi này.
