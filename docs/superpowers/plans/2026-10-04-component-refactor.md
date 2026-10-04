# Refactor dashboard components

Goal: Tách UI theo trách nhiệm, giữ nguyên giao diện, polling, API payload và pipeline đã duyệt.
Spec: ../specs/2026-09-23-agent-harness-design.md
Scope: portable-pipeline-ui, giữ thay đổi chưa commit; không sửa worker, API hay dependency.

- [x] Baseline: npm test (52 tests) và npm run test:e2e (8 tests).
- [x] Bổ sung E2E cho đăng ký repo, lỗi đăng ký, các tab evidence và lỗi lưu model; chạy trước refactor.
- [x] Workspace: tách NewTaskForm, RepositoryForm, TaskList và WorkspaceOverview, props có type; state/API giữ ở TaskForm.
- [x] Detail: tách TaskRequests, TaskPlan, TaskEvidence và TaskTimeline; khai báo TaskDetailData/TaskCommand cho props; state/API giữ ở TaskDetail.
- [x] Settings: tách StageModelRow; lựa chọn model và lưu cấu hình giữ ở ModelSettings.
- [x] Verify: cùng unit/integration và E2E, typecheck, production build; review diff để xác nhận giữ nguyên hành vi và thay đổi cũ.

Không thêm feature, không thay polling/lifecycle; kiểm tra bằng fixture agent, không chạy task thật qua tài khoản Codex/GitHub.

## Kết quả kiểm chứng

- Baseline: 52/52 unit/integration; 8/8 E2E.
- Test bổ sung chạy trên UI trước refactor: evidence tabs, repository registration và model save errors đều pass.
- Sau refactor: 52/52 unit/integration; 10/10 E2E; production build và typecheck pass với Node 24.18.0.
- Review diff: JSX/class/nhãn/payload/API/polling giữ nguyên; chuyển state tab vào TaskEvidence; thay any bằng type ở chi tiết task.
- Giữ nguyên thay đổi chưa commit về nội dung layout/settings/workspace và assertion settings có sẵn.
- Không thêm dependency; không sửa backend/worker; không commit/push.
- Live Codex/GitHub: skipped; E2E dùng fixture agent và repo Git tạm.
