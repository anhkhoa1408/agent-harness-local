# Agent Harness

Công cụ chạy local để điều phối Codex trên repository Git: từ yêu cầu và kế hoạch được duyệt đến triển khai, kiểm thử, review và bàn giao.

Dashboard dùng Next.js; worker Node.js chạy độc lập và lưu trạng thái bằng SQLite.

## Tính năng

- Duyệt kế hoạch và phạm vi kiểm thử trước khi sửa code.
- Mỗi task có branch và worktree riêng; xử lý một task tại một thời điểm.
- Chọn model theo stage; agent profiles và skills đi kèm repository.
- Theo dõi tiến độ, diff, kết quả kiểm thử và review trên dashboard.
- Tạm dừng, tiếp tục và bàn giao bằng báo cáo local hoặc GitHub pull request.

## Yêu cầu

- Node.js **24.18.0 trở lên, thuộc nhánh 24**, npm và Git.
- Codex CLI hỗ trợ `app-server`, đã đăng nhập.
- GitHub CLI (`gh`) và quyền push nếu cần tạo pull request.

Môi trường đã kiểm chứng: macOS. Windows chưa được kiểm chứng.

## Chạy local

```sh
nvm use
npm ci
codex login
npm run dev
```

Mở [http://127.0.0.1:3000](http://127.0.0.1:3000). Nếu không dùng nvm, hãy chọn phiên bản Node.js phù hợp trước khi cài dependencies.

1. Mở **Model & skills** và kiểm tra model khả dụng.
2. Đăng ký repository Git có commit và nhánh nguồn.
3. Tạo task, trả lời câu hỏi làm rõ và duyệt plan.
4. Theo dõi kiểm thử, review và kết quả bàn giao.

`npm run dev` khởi động cả dashboard và worker. Đóng trình duyệt không dừng task; dùng `Ctrl+C` trong terminal để dừng ứng dụng.

## Dữ liệu và giới hạn

Dữ liệu, artifacts và worktrees được lưu trong `.harness/`, không được commit. Đặt `HARNESS_DATA_DIR` để đổi nơi lưu; dashboard và worker phải dùng cùng thư mục.

- Ứng dụng chỉ lắng nghe trên loopback và dành cho sử dụng local.
- Không tự merge, deploy hoặc xóa worktree; tối đa ba vòng sửa tự động.
- Kiểm thử bắt buộc theo plan đã duyệt. Test bị bỏ qua không được tính là pass.
- Model hoặc quota không khả dụng sẽ chặn task; không tự đổi model.
- Sau crash, task có thể bị khóa đến khi xác nhận runtime cũ đã dừng.

## Kiểm tra

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E dùng fixture agent và repository tạm để kiểm tra luồng ứng dụng; không xác nhận lượt chạy Codex hoặc tạo pull request thật.

## Tài liệu

- [Thiết kế và phạm vi MVP](docs/superpowers/specs/2026-09-23-agent-harness-design.md)
- [Kết quả kiểm chứng](docs/verification.md)
- [Agent profiles](agents/README.md)
- [Skills và cách cập nhật](skills/README.md)
