# Sửa runtime startup trong Docker

Ngày 2026-10-05, Codex CLI `0.159.0-alpha.12.1`, Node `24.18.0`.

## Nguyên nhân và thay đổi

- Native child vừa spawn đôi khi trả `list_turns is not supported yet` cho `thread/resume`. Probe Manual trong container tái hiện được lỗi; sau khi rollout durable, settings đọc lại thành công. Adapter trước đây dừng cả stage và có thể giữ exclusion. `childRequest` nay retry đúng lỗi này trong deadline hiện có, giống race `no rollout found`; không tạo child thay thế hoặc bỏ audit.
- Docker seccomp mặc định chặn namespace của Codex bubblewrap. Probe `unshare(CLONE_NEWUSER)` trả EPERM; native child không đọc được packet. Compose dùng default profile Moby được vendored, chỉ bổ sung syscall cho nested sandbox. Không cấp `SYS_ADMIN`, không tắt seccomp hoặc sandbox Codex.
- Exclusion cũ của task đã hủy được gỡ sau read-back parent/child đều `interrupted`, lưu record `recovery` và event `recovery.stopped`. Không thêm auto-recovery khi writer chưa rõ trạng thái.

## Kiểm chứng

| Kiểm tra                                             | Kết quả                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Regression race child startup                        | RED trước sửa, GREEN sau sửa                                           |
| Persistent startup failure, không xác nhận được stop | Giữ `runtime_state_unknown`                                            |
| Subagents, Codex adapter, worker, pipeline           | **42 tests passed**, 4 files                                           |
| Docker sandbox trên image đã build                   | **1 test passed**: đọc thành công; ghi bị chặn; network socket bị chặn |
| Typecheck                                            | **passed**                                                             |
| Production build trong Docker                        | **passed**                                                             |
| Task thật `07c71270-1d6a-4529-9535-56c347ebdcc2`     | `discover` hoàn tất; chuyển `analyze`, cùng parent, child đã xác minh  |
| Toàn pipeline thật / UI E2E / legacy suite           | **skipped**; không suy diễn từ kiểm chứng startup                      |

Parent task thật: `01a10b8d-343b-7322-b4a0-99a70e957cdf`. Child discover: `01a10b8d-7189-70c3-b8b6-708aefd8c66a`. Runtime read-back và database event xác nhận stage hoàn tất, không chỉ dựa vào lời của model.

Lệnh lặp lại:

```sh
npm test -- tests/integration/subagents.test.ts tests/integration/codex.test.ts tests/integration/worker.test.ts tests/integration/pipeline.test.ts
npm run typecheck
docker compose build harness
HARNESS_DOCKER_SANDBOX_TEST=1 npm test -- tests/integration/docker-sandbox.test.ts
```

## Bổ sung lỗi review

Review gặp biến thể startup khác: `thread/resume` trả lỗi đọc session metadata vì rollout mới còn rỗng (`rollout at … is empty`). Probe trên packet review thật tái hiện được lỗi này; parent bị ngắt trước khi worker nhận verdict. Bản sửa ban đầu chỉ xử lý rollout chưa tồn tại và `list_turns`, nên chưa bao phủ trường hợp file đã tạo nhưng chưa ghi.

Thêm retry trong cùng deadline cho đúng thông báo rollout rỗng, không retry mọi lỗi metadata. Regression test RED trước sửa và GREEN sau sửa; test metadata hỏng xác nhận bị từ chối ngay. Feature suite sau bổ sung: **44 tests passed**, typecheck và Docker production build **passed**.

Sau read-back 7 threads đều terminal, resume task tại `review` với cùng parent; child mới `01a10b9a-454d-7271-9aff-64bc7d378a92` được audit thành công. Không chạy lại implement, không dùng verdict của probe thay cho worker review.

Read-back cuối: review **pass**, delivery **completed**, reason `null`. Commit local do Harness tạo: `54e60aaac6099faa99e98fca44bfee2081f87a28`; report trong container: `/data/artifacts/07c71270-1d6a-4529-9535-56c347ebdcc2/delivery-v1.md`. Sandbox regression trên image cuối **1 test passed**; tổng feature checks **45 tests passed**.
