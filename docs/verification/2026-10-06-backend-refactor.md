# Kiểm chứng backend refactor

Hoàn tất kiểm chứng ngày **2026-10-07**, trên nhánh `codex/refactor`.
Base: `c19541f0d31444e5aa4bb8fac4dc2735b63390f8` từ `origin/codex/portable-pipeline-ui`.
Source và test đã kiểm tra: `4e47083` (commit tài liệu bàn giao theo sau).
Môi trường: macOS, Node **24.18.0**, Next.js **16.3.6**, native Codex CLI **0.159.0-alpha.12.1**.

## Thay đổi được bàn giao

- Application services dùng chung cho HTTP/worker; PlanService giữ transaction/versioning, StoryService giữ selection/baseline/evidence, TaskService giữ tạo task.
- Lifecycle cha–con, executor, approval broker, worker scheduling/control/recovery và chín stage handlers được tách theo trách nhiệm.
- HTTP routing theo resource; storage repositories cùng SQLite connection; delivery tách GitHub CLI; execution tách evidence parser.
- Agent API phân biệt direct/delegated, types dùng chung riêng khỏi implementation, event có discriminated union, constants theo owner giữ nguyên giá trị.
- Không migration dữ liệu, không đổi HTTP/persisted/error/event/artifact contracts, không sửa frontend sản phẩm. [Sơ đồ và trách nhiệm](../backend-architecture.md).

## Kết quả

| Check                | Kết quả                       | Phạm vi / bằng chứng                                                                                                                                             |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline `npm test`  | **PASS: 158**, **SKIPPED: 4** | Chạy trước refactor trên Node 24.18. Lượt Node 23.4 bị loại khỏi bằng chứng do không đáp ứng engines.                                                            |
| `npm run typecheck`  | **PASS**                      | Types, callers, fixtures và script smoke mới.                                                                                                                    |
| `npm test` cuối      | **PASS: 160**, **SKIPPED: 4** | 38 files pass, 3 files skipped. Thêm dependency guard và characterization giới hạn sáu failure excerpts; không thêm test hàng loạt cho code cũ.                  |
| Dependency guard     | **PASS**                      | RED trên các hướng phụ thuộc cũ; GREEN sau refactor. Chặn core → adapter, server ↔ worker, application/adapters → server/worker và vòng runtime import tĩnh.     |
| `npm run build` cuối | **PASS**                      | Production compilation, TypeScript, static generation và các route hiện có.                                                                                      |
| E2E sáu bộ yêu cầu   | **PASS: 25**                  | Lifecycle, plan feedback, stories, repository registration, login, screenshot artifacts. Agent là fixture; browser, Git và check runner chạy thật.               |
| Smoke native         | **PASS**                      | Parent reuse, read-only → workspace-write → read-only, ba child mới, kết quả đọc trực tiếp, file ghi đúng marker và cancellation được adapter xác nhận terminal. |
| Review độc lập       | **PASS**                      | Fresh reviewer đối chiếu source/diff với baseline và spec; không có finding cần sửa. Reviewer không tự chạy suites; kết quả chạy do implementer xác minh.        |

Bốn test Docker opt-in vẫn **SKIPPED**: Compose config, sandbox startup, SSH client trong image và host SSH agent. Không có test bắt buộc của phần refactor bị bỏ qua. Các E2E ngoài sáu bộ trên không chạy trong lượt nghiệm thu này; không tạo PR hoặc thử delivery trên GitHub thật.

## Hai assertion E2E có sẵn

Lượt đầu: **23 pass, 2 fail**. Hai lỗi được tái hiện trên checkout tạm của chính base `c19541f` trước khi sửa test:

1. Test dashboard tìm task đã hoàn thành trong bộ lọc mặc định “Đang chạy”. Test chọn “Tất cả trạng thái” trước khi kiểm tra deliver/repair.
2. Test đăng ký repository chờ `request_failed`, trong khi baseline đã trả `repository_path_unavailable`. Test kiểm tra đúng mã hiện có.

Commit riêng `4e47083` chỉ sửa assertion và unused import fixture. Không đổi hành vi backend để làm test pass. Hai test chạy lại pass, sau đó cả sáu bộ E2E đạt **25 pass**.

## Smoke với runtime thật

Script tái sử dụng: `scripts/parent-subagents-smoke.ts`. Nó tạo fixture tạm có marker ngẫu nhiên, kiểm tra kết quả và nội dung file, rồi đóng client và dọn fixture. Chạy bằng Node 24.18, sau khi đăng nhập Codex:

```sh
node --import tsx scripts/parent-subagents-smoke.ts
```

Nếu cần binary cụ thể, đặt `CODEX_BIN` trỏ tới Codex CLI có native subagents. Lượt này dùng binary đi kèm desktop app, không dùng agent fixture.

Parent: `01a11489-f694-71a3-997e-4b71e56311c5`.

| Assignment | Native child                                | Kết quả                                                               |
| ---------- | ------------------------------------------- | --------------------------------------------------------------------- |
| analyze    | `01a1148a-0977-7643-918e-63a7582c0216`      | Read-only, đọc đúng marker.                                           |
| implement  | `01a1148a-3530-7960-9d76-85a0d9cc7dee`      | Cùng parent, workspace-write, tạo `copied.txt` đúng nội dung.         |
| review     | `01a1148a-80ee-76b1-ba1d-4e0342d2dd6f`      | Cùng parent, trở lại read-only, child mới và đọc đúng file.           |
| cancel     | Child mới được adapter xác minh trước abort | Run reject `interrupted` sau xác nhận parent và descendants terminal. |

Lượt smoke trước bị quota ngắt sau analyze/implement; lượt hoàn chỉnh trên đây thay thế bằng chứng còn dang dở. Smoke chứng minh settings transitions và cancellation đã nêu; không phải phép thử đầy đủ mọi khả năng sandbox.

## Quyết định và giới hạn review

Reviewer đặt ba phần ngoài kết luận source review; implementer xử lý như sau:

- E2E: đóng bằng đối chứng baseline fail và final pass. Rủi ro đổi assertion được giới hạn bằng việc giữ nguyên kiểm tra pipeline state và error contract.
- Native cancellation: đóng bằng smoke app-server thật; tests giả lập vẫn kiểm tra pending start, completion race, mất visibility và tree reconciliation.
- Encrypted spawn message và giới hạn công cụ của parent: giữ đúng baseline/spec. Khi message được mã hóa, adapter không xác minh được plaintext nguyên văn. Refactor không bổ sung enforcement mới cho hạn chế công cụ của parent; đây là giới hạn đã có, không được coi là bằng chứng mới về sandbox.

Không có Critical/Important finding bị bỏ lại hoặc Minor finding được trì hoãn. Các regression phát sinh khi tách code được phát hiện bởi test và sửa trước commit nghiệm thu; không có thay đổi hành vi ngoài scope.

## Chạy lại checks

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e -- tests/e2e/lifecycle.spec.ts tests/e2e/plan-feedback.spec.ts tests/e2e/stories.spec.ts tests/e2e/repository-registration.spec.ts tests/e2e/login.spec.ts tests/e2e/ui-verification-artifacts.spec.ts
node --import tsx scripts/parent-subagents-smoke.ts
```

Nhánh bàn giao: `codex/refactor`. Không merge, force-push hoặc tạo PR. Remote SHA được đối chiếu với HEAD khi push.
