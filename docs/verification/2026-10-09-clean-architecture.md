# Kiểm chứng refactor Clean Architecture — 9–10/10/2026

## Phạm vi và trạng thái

Đã chuyển backend sang `domain`, `application`, `infrastructure`, `presentation`, `bootstrap` trên nhánh `codex/clean-architecture`, worktree riêng `clean-architecture`. Baseline là `2bded2d` sau khi công việc trước đã commit. Không merge/push, không migration SQLite, không đổi HTTP API hoặc chính sách pipeline.

Domain/application sở hữu nghiệp vụ, ports và transaction boundaries; SQLite, Codex, Git, process, filesystem và validation codecs ở infrastructure. Routes/worker entrypoint gọi application qua dependency được bootstrap tạo. Đã xóa các đường gọi legacy và compatibility facades. Checker không còn ngoại lệ; kiểm tra cả type imports, alias, re-export, dynamic import, require và vòng phụ thuộc. Presentation bị chặn import trực tiếp Node hoặc các package I/O đã nhận diện.

Các commit triển khai:

| Commit                  | Nội dung                                                        |
| ----------------------- | --------------------------------------------------------------- |
| `c07b576`               | Domain và dependency contracts                                  |
| `4519c34`               | Model settings và catalog ports                                 |
| `a8068ec`               | Typed persistence và task/plan/story/repository services        |
| `0bae88d`               | Context, packet, execution và runtime recording                 |
| `6cb74c1`               | Pipeline, verification, delivery, HTTP và bootstrap; xóa legacy |
| Commit chứa báo cáo này | Siết guardrail presentation và lưu bằng chứng cuối              |

## Kết quả

Các lệnh chạy bằng Node **24.18.0**. Không dùng Node 23 để kết luận transaction behavior vì phiên bản đó thiếu `DatabaseSync.isTransaction`.

| Kiểm tra                          | Kết quả                            | Bằng chứng/phạm vi                                                                                   |
| --------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Backend `npm test` sau sửa review | **PASS: 220**, **SKIPPED: 4**      | 47 files pass, 3 files skipped; `/tmp/harness-clean-reviewed-backend.log`                            |
| Architecture và fixture checker   | **PASS: 18**                       | Hai files; fixtures presentation I/O đã quan sát 6 failures trước sửa, rồi pass                      |
| `npm run typecheck`               | **PASS**                           | Chạy sau sửa guardrail cuối                                                                          |
| `npm run lint`                    | **PASS**                           | Chạy sau sửa guardrail cuối                                                                          |
| `npm run build`                   | **PASS**                           | Production source tại `6cb74c1`; `/tmp/harness-clean-build2.log`; thay đổi sau đó chỉ test/docs      |
| Toàn bộ E2E fixture               | **PASS: 54, FAIL: 5**              | 59 tests; `/tmp/harness-clean-e2e.log`; cả 5 failures tái hiện trên baseline                         |
| Codex native smoke                | **PASS**                           | Analyze, implement, review và cancellation; [receipt summary](evidence/2026-10-09-native-smoke.json) |
| Review độc lập toàn branch        | **PASS; không Critical/Important** | Reviewer chạy thêm 38 tests/9 files và diff check; một P3 guardrail đã sửa                           |

Backend tests bao gồm model defaults/override/snapshot/role mapping, typed persistence/nested transactions/revisions/idempotency/fencing, parent-child/receipt/output/approval/cancellation, scheduler/recovery, story/checkpoint/evidence/delivery và HTTP contracts. Baseline backend ghi nhận 195 pass, 4 skipped; OAuth test được chạy lại ngoài sandbox và pass.

Bốn tests Docker được skip vì chưa bật `HARNESS_DOCKER_SANDBOX_TEST`, `HARNESS_DOCKER_COMPOSE_TEST`, `HARNESS_DOCKER_RUNTIME_TEST`, `HARNESS_DOCKER_SSH_AGENT_TEST`. Không có kết luận runtime Docker từ các tests này.

### Phân loại 5 E2E failures

Đã dựng snapshot riêng từ đúng `2bded2d`, dùng dependencies được copy riêng và port 3101 để không chia sẻ dữ liệu với checkout refactor. Chạy lại đủ 5 tests và tái hiện cùng lỗi. Không sửa UI/tests cũ ngoài phạm vi refactor giữ hành vi.

| Test                            | Failure tồn tại ở baseline                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `lifecycle.spec.ts:191`         | Locator `getByRole("status")` match hai elements                                   |
| `plan-feedback.spec.ts:54`      | Locator `getByRole("status")` match hai elements                                   |
| `ui.spec.ts:129`                | Payload thực tế có `splitIntoStories: false`, expected equality không có field này |
| `ui.spec.ts:376`                | Accessible description của execution-mode combobox rỗng                            |
| `workspace-dialogs.spec.ts:102` | Không tìm thấy text `1 task` theo assertion hiện tại                               |

Bằng chứng baseline: `/tmp/harness-clean-baseline-e2e.log` (3 failures) và `/tmp/harness-clean-baseline-e2e2.log` (2 failures). Vì vậy không báo toàn bộ E2E xanh; hiện không có E2E regression mới được phát hiện trong suite này.

### Native smoke và giới hạn bằng chứng

Smoke chạy Codex thật trên Git repo tạm riêng: một parent được dùng lại, ba child khác nhau đã được adapter xác minh trực tiếp, quyền read-only/workspace-write/read-only; nội dung file do implement tạo được đối chiếu. Cancellation chỉ pass sau khi adapter xác nhận parent và children terminal. Repo tạm được dọn sau chạy.

Native smoke này chứng minh delegation/output/cancellation của ba stages; không chứng minh một pipeline delivery end-to-end dùng provider thật. E2E dùng fixture không thay thế native runtime evidence. Không chạy commit/push/PR trên repo người dùng để kiểm chứng.

## Review và quyết định trong triển khai

Review độc lập trên `2bded2d..6cb74c1` không phát hiện regression nghiệp vụ cần sửa. P3 duy nhất: checker cho presentation import external Node I/O. Đã bổ sung chặn Node builtins và các package SQLite/Git/GitHub nhận diện, thêm fixtures denied/allowed; full backend, typecheck và lint pass sau sửa. Không còn finding được hoãn từ review này. Reviewer không tự chạy lại build/native/full E2E; các kết quả đó là bằng chứng của lượt triển khai.

Hai quyết định đã dùng trong lúc triển khai:

1. Chốt baseline `2bded2d`, là commit sạch mới nhất sau khi phần việc trước hoàn tất. Nếu baseline sai, việc đối chiếu regression có thể bỏ sót thay đổi trước refactor; đã giữ checkout gốc và đối chiếu đúng commit.
2. Domain nhận objects đã qua structural validation; giữ shape/default/error validation ở gateway và adapter codecs, còn domain kiểm tra business rules. Nếu gateway bị bỏ qua, invalid-input behavior có thể thay đổi; HTTP/codec contracts và dependency checks kiểm chứng đường vào hiện tại.

Các invariants giữ nguyên: task model snapshot không đổi theo settings mới; không model fallback; prepare dùng repair role, UI verify dùng review role; một task thực thi tại một thời điểm; repair không giới hạn vòng; sync UnitOfWork/nested savepoint; tất cả worker writes qua lease fence; `runtime_state_unknown` chặn writer mới; approval/evidence/required-check gates và delivery effect reconciliation giữ nguyên.

Rollback theo từng commit trên baseline; không chạy worker cũ và mới cùng dữ liệu. Worktree và branch được giữ để review/tích hợp theo quyết định tiếp theo của người dùng.
