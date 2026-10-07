# Bỏ giới hạn repair — 2026-10-07

Theo thiết kế người dùng đã chốt, verify/review fail tiếp tục đưa task vào repair mà không giới hạn số vòng. Worker giữ repair count và lịch sử; UI hiển thị `Repair N`. Approval, scope, runtime/môi trường, evidence, pause/cancel giữ nguyên.

## Thay đổi

- Bỏ guard theo số vòng trong worker, verify (required checks và visual checks), và review transition.
- Giữ việc tăng bộ đếm một lần khi worker mở attempt repair. Task cũ blocked bởi `repair_limit` tiếp tục được qua lệnh resume; không tự chạy lại task khi cập nhật.
- Runtime bổ sung policy hiện hành sau skill/adaptation đã frozen: không hỏi hoặc dừng chỉ vì ba lần sửa thất bại. Giữ yêu cầu điều tra nguyên nhân và hỏi khi thực sự thiếu quyết định.
- Cập nhật nhãn UI, spec chung và spec story delivery.

## Bằng chứng trên workspace ban đầu

- RED: 6 assertion Unit/Integration thất bại do `repair_limit`; E2E feature cần 4 repair dừng ở `Repair 3/3`; test instructions phát hiện bundle cũ thiếu policy override.
- GREEN: 40 test thuộc 8 file Unit/Integration pass. Kiểm tra review và worker ở count 3/8, resume task blocked cũ, visual/test failure sau vòng thứ ba, giữ plan/worktree/story checkpoints và scope guard.
- E2E: 14 pass trên luồng lifecycle, plan feedback và stories. Feature chỉ sửa đúng ở vòng thứ 4 đã bàn giao local và hiển thị `Repair 4 · Plan v1`.
- Typecheck và `git diff HEAD --check`: pass. Runtime dùng Node 24.18.0.
- Review độc lập: không còn finding sau khi bổ sung override cho bundle frozen.

Lượt E2E rộng hơn có 14 pass và 4 fail ngoài phạm vi repair. Cả 4 được tái hiện với cùng lỗi trên bản sao giữ các thay đổi khác của workspace và khôi phục code repair trước thay đổi:

1. `settings hide catalog hint and effort badges, preserving models on save`: locator `role=status` khớp cả thông báo trình duyệt và trạng thái lưu Settings.
2. `pipeline circles track pause, completion and skipped repair on dashboard and detail`: locator card/pipeline không tìm được node deliver.
3. `repository registration reports errors and selects the registered repository`: test còn đợi `request_failed`, UI trả `repository_path_unavailable`.
4. `default execution mode is saved in Settings and inherited by new tasks`: trùng locator `role=status` như ca Settings.

Lượt cuối bỏ qua 4 ca này và chạy 14 ca liên quan; không sửa các lỗi ngoài phạm vi. Không chạy toàn bộ legacy suite hoặc production build. E2E dùng fixture agent với worker/runner thật; chưa kiểm chứng hành vi model thật qua inference mới.

## Kiểm chứng bản bàn giao trên main

Người dùng yêu cầu push lên `main`. Bản bàn giao dựa trên `origin/main` tại `e1e490db6a60a6828668eadf454da468cd8f645a`, gồm refactor backend đã merge. Checkout riêng chỉ nhận thay đổi repair; các thay đổi UI/thông báo khác trong workspace ban đầu được giữ nguyên.

Guard được bỏ tại `src/worker/runtime.ts`, `src/worker/handlers/verify.ts` và `src/core/transitions.ts`; xóa constant/import `MAX_REPAIR_ROUNDS` không còn dùng. Giữ nguyên các module và AgentClient của bản refactor.

- RED trên main: 7 test thất bại đúng nguyên nhân repair limit hoặc thiếu runtime policy.
- GREEN: toàn bộ Unit/Integration có 164 pass, 4 skipped. Các ca skipped là Docker Compose, sandbox, runtime và SSH agent theo biến opt-in của suite.
- E2E lifecycle/plan feedback/stories: 18 pass, gồm vòng repair thứ 4. Bốn lỗi của workspace ban đầu không xuất hiện trên bản main đã đồng bộ.
- Typecheck và diff check: pass. Review độc lập không còn finding.
- Không chạy thêm production build hoặc live inference ngoài phạm vi feature.

## Trạng thái triển khai và task Canvas

Code được chuẩn bị để bàn giao lên main; chưa rebuild container đang chạy và chưa thay đổi dữ liệu task thật.

Task `5ae011d5-19a6-42a4-9793-a736519b9e41` vẫn cần xử lý `tsconfig.json` ngoài plan. Bỏ repair limit không bỏ scope gate. Evidence đã đọc từ container cho thấy E2E/build pass, nhưng reviewer desktop đòi xác minh metadata/hydration từ screenshot và cả 3 repair dừng bởi `scope_changed_requires_plan`.
