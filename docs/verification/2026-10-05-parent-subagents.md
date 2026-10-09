# Kiểm chứng một cha và subagents theo stage

Ngày: 2026-10-05. Workspace: `codex/portable-pipeline-ui`. Runtime thật: `codex-cli 0.159.0-alpha.12.1` trên máy, không dùng API/provider thay thế. Chỉ bật `multi_agent` và `multi_agent_v2` cho parent thread; không sửa cấu hình Codex toàn máy.

## Kết quả

| Kiểm tra                                                                            | Trạng thái       | Bằng chứng                                                                                                  |
| ----------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Adapter, pipeline, feedback, quyền, worker recovery và model/context                | **passed**       | 10 file Vitest, **59 tests**                                                                                |
| Typecheck                                                                           | **passed**       | `tsc --noEmit`, exit 0 sau sửa lỗi inference của page metadata                                              |
| E2E lifecycle và plan feedback                                                      | **passed**       | Playwright, **12 tests**; fixture mô phỏng quan hệ cha/con, không gọi model thật                            |
| Read-only → plan Astra/high → implement → review, cùng cha                          | **passed**       | Native app-server, bốn child IDs riêng; hành vi filesystem thật và settings audit                           |
| Restart app-server giữa plan và implement                                           | **passed**       | Parent ID giữ nguyên, native spawn được đối chiếu từ durable rollout                                        |
| Cancel khi con đang thực thi command                                                | **passed**       | Cả parent và child turn được đọc lại là `interrupted`                                                       |
| Không fork lịch sử stage trước                                                      | **passed**       | Native smoke: cha giữ kết quả có marker; con mới báo `sawHistory=false`, không đọc packet trước             |
| Resume sau khi snapshot cũ bị xóa                                                   | **passed**       | Smoke riêng cùng test marker, chuyển cwd sang snapshot mới                                                  |
| Diff whitespace                                                                     | **passed**       | `git diff --check`                                                                                          |
| Legacy suite ngoài phạm vi, build production, Docker/native runtime trong container | **skipped**      | Không phải thay đổi UI/Next APIs hoặc deployment; không suy diễn kết quả local sang Docker                  |
| Abrupt crash app-server khi child đang thực thi                                     | **passed**       | Run trả unknown; restart đọc cả cây là interrupted; cùng cha, con mới chỉ sau terminal reconciliation       |
| Kill worker process thực tế khi child đang ghi                                      | **skipped** live | Worker exclusion/recovery và runtime mất xác nhận được test bằng fixture; live crash áp dụng cho app-server |

Lệnh feature suite:

```sh
node --import tsx node_modules/vitest/vitest.mjs run \
  tests/integration/subagents.test.ts tests/integration/codex.test.ts \
  tests/integration/pipeline.test.ts tests/integration/plan-feedback.test.ts \
  tests/integration/worker.test.ts tests/integration/execution.test.ts \
  tests/integration/agent-profiles.test.ts tests/unit/execution-mode.test.ts \
  tests/unit/planning.test.ts tests/unit/pipeline-progress.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/@playwright/test/cli.js test \
  tests/e2e/lifecycle.spec.ts tests/e2e/plan-feedback.spec.ts
```

## Native stage smoke

Parent: `01a10a0b-2168-7d00-a0da-c5a28f00a85f`, model `gpt-6-luna/medium`.

| Stage     | Child ID                               | Model/effort      | Kiểm tra thật                                                     |
| --------- | -------------------------------------- | ----------------- | ----------------------------------------------------------------- |
| analyze   | `01a10a0b-3eee-7bc0-83f7-0c21065ea542` | gpt-6-luna/medium | Lệnh ghi bị chặn; fixture đích không tồn tại                      |
| plan      | `01a10a0b-9096-7211-b4e5-f31535cd3d84` | gpt-6-astra/high  | Lệnh ghi bị chặn; fixture đích không tồn tại                      |
| implement | `01a10a0b-fed0-7bb2-9408-82178de6990f` | gpt-6-luna/medium | Sau restart và đổi cwd, ghi `probe.txt`; worker đọc lại đúng `ok` |
| review    | `01a10a0c-4907-70c2-bad8-264b2a9bce2b` | gpt-6-luna/medium | Loaded parent được cập nhật về read-only; lệnh ghi bị chặn        |

Script/log tạm: `/private/tmp/agent-harness-native-stage-smoke.mts`, `/private/tmp/harness-native-stage-smoke.log`. Đây là smoke adapter thực, không phải toàn pipeline dùng model thật. Pipeline gates/repair/feedback được kiểm chứng bằng integration và E2E fixtures.

Cancel smoke parent `01a10a18-5e7d-7fb2-8b3f-b2444fc5c4d0`, child `01a10a18-d1c5-74a1-b2a0-6b738ff50b5c`. Abort được gửi khi child bắt đầu command. Adapter chỉ trả `interrupted` sau khi đọc lại terminal state của cả hai. Log: `/private/tmp/harness-native-cancel-smoke.log`.

Context smoke parent `01a10a1a-85a4-7fe2-9690-1da7aab7c8c9`, children `01a10a1a-d72c-72e3-9582-81ab7f485cad` và `01a10a1b-a843-75b0-8078-e949e18dac95`. Cha nhận marker trong kết quả lượt đầu, con thứ hai không được cung cấp marker và báo `sawHistory=false`. Log: `/private/tmp/harness-native-context-smoke.log`. Đây là probe không kế thừa lịch sử, không phải kiểm toán mọi token trong model context.

Smoke snapshot bị xóa: parent `01a10a1e-3c4e-7ba0-99a7-d03f88011933`, con đầu `01a10a1e-7066-7011-9578-1afb749e5449`, con mới `01a10a1e-d94f-7482-9e18-5795a070c32c`. Xóa snapshot0 trước lượt tiếp theo; native settings xác nhận cwd snapshot1, con mới không thấy marker. Log: `/private/tmp/harness-native-context-deleted-cwd-smoke.log`.

Crash smoke: parent `01a10a23-660d-7d83-aed9-71cd582778f3`, child `01a10a23-98a7-7430-b117-328e53723416`. Kill app-server bằng SIGKILL khi child bắt đầu command; adapter trả `runtime_state_unknown`. Sau restart, read-back cả hai turns là `interrupted`; chỉ sau xác nhận terminal mới thử một attempt fixture khác, giữ cha và tạo con `01a10a23-ecb8-7dd0-a47e-1b6eaaab9b78`. Đây là reconciliation adapter trong probe; Harness vẫn giữ exclusion do worker lưu cho tới reconciliation, không tự retry sau crash. Log: `/private/tmp/harness-native-crash-smoke.log`.

## Review và sửa lỗi

Review độc lập bằng subagent đọc diff đã phát hiện:

1. Cancel lúc `turn/start` chưa trả lời có thể báo đã dừng trước khi parent thực sự bắt đầu. Test tái hiện thất bại; sửa bằng barrier đợi start settle rồi reconcile/interrupt. **passed**.
2. Child completion đến trong khi xử lý một status read cũ có thể mất wakeup và báo incomplete. Test tái hiện thất bại; sửa bằng hàng đợi kiểm chứng lại. **passed**.
3. Spawn evidence không đối chiếu `message`. Đã từ chối message thiếu hoặc plaintext sai; runtime thật mã hóa message nên không có API để đối chiếu ciphertext với packet. Đây là **giới hạn visibility**, không tuyên bố đã kiểm chứng nguyên văn nội dung mã hóa. Spec/README đã ghi rõ.

Kiểm tra thêm phát hiện lỗi preflight tree read chưa được chuyển thành `runtime_state_unknown`; test RED trước sửa, GREEN sau sửa. Exclusion được giữ nếu không xác định được writer. Test rollout file không đọc được cũng xác nhận promise reject, không có stream error không xử lý.

Hai regression tests bổ sung chặn việc cha reactivate con của stage trước qua collaboration call hoặc native `subAgentActivity.interacted`; cả hai RED trước sửa, GREEN sau sửa. Writer cũ phát sinh cũng được đưa vào cancellation, không bỏ qua vì thuộc lịch sử task.

## Giới hạn và căn cứ triển khai

- `fork_turns="none"` không loại bỏ developer instructions. Native runtime kế thừa instructions của cha nên chúng phải phân vai root/subagent; planner được phép đọc packet và làm nhiệm vụ.
- Thread/resume của parent đã load có thể giữ sandbox cũ. Adapter cập nhật bằng `thread/settings/update` rồi đọc lại settings trước spawn; không mở rộng quyền để smoke pass.
- Sau restart, resume không khôi phục raw-event streaming. Adapter dùng đúng rollout path do app-server trả, lọc native spawn theo turn/call ID. Không lấy path evidence từ repo đích và không dùng independent session fallback.
- Cha và con cùng sandbox của stage. Cha chỉ điều phối là ràng buộc instructions và kiểm tra tools, không phải cách ly quyền tuyệt đối.
- Runtime mã hóa `spawn_agent.message` trong event/log và không expose task message ở thread/read. Format ciphertext chỉ giúp nhận diện representation, không chứng minh nội dung hoặc loại trừ text bổ sung. Kiểm tra nhiệm vụ dựa thêm vào stage/attempt envelope, metadata, child output và test marker.
- Không có số liệu so sánh chi phí/token trước–sau. Fresh context tránh fork hội thoại nhưng con vẫn có system/tools/developer instructions, và cha thêm lượt điều phối. Không hứa migration giảm token.
- Cấu hình native/protocol phụ thuộc bản alpha đã kiểm chứng; khi settings/evidence không đáp ứng, pipeline blocked hoặc giữ unknown exclusion, không tự fallback.

## Snapshot dùng để push — 2026-10-05

Commit được tách từ HEAD `415cd8a`, chỉ chứa runtime cha–con, backend task mode/versioned feedback cần cho stage packets, fixtures/tests liên quan và tài liệu của feature. Các thay đổi UI, đăng nhập, folder picker và `.DS_Store` không được đưa vào commit.

Kiểm chứng riêng đúng snapshot: **58 tests / 9 files passed**, **10 lifecycle E2E passed**, **typecheck passed** trên Node `24.18.0`. Test Settings UI và E2E plan-feedback của workspace đầy đủ chưa thuộc snapshot này; số 59/12 ở phần trên là kiểm chứng lịch sử của workspace đầy đủ trước khi tách commit.

Hai lỗi môi trường trong lúc chuẩn bị snapshot đã được xử lý: shell ở thư mục tạm chọn Node 23 (thiếu SQLite transaction metadata cần thiết); Turbopack từ chối symlink node_modules ra ngoài project root. Chạy lại bằng Node 24.18 và bản sao dependencies trong root đều pass. Không sửa code để bỏ qua các lỗi này.
