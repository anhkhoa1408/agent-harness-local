# Agent Harness

Công cụ chạy local để điều phối Codex trên repository Git: từ yêu cầu và kế hoạch được duyệt đến triển khai, kiểm thử, review và bàn giao.

Dashboard dùng Next.js; worker Node.js chạy độc lập và lưu trạng thái bằng SQLite.

## Tính năng

- Duyệt kế hoạch và phạm vi kiểm thử trước khi sửa code.
- Mỗi task có branch và worktree riêng; xử lý một task tại một thời điểm.
- Chọn model theo stage; agent profiles và skills đi kèm repository.
- Theo dõi tiến độ, diff, kết quả kiểm thử và review trên dashboard.
- Tạm dừng, tiếp tục và bàn giao bằng báo cáo local hoặc GitHub pull request.

## Chạy bằng Docker

Yêu cầu Docker Desktop đang chạy.

```sh
docker compose up -d --build
```

Mở [http://127.0.0.1:3000](http://127.0.0.1:3000), chọn **Đăng nhập Codex** và bấm **Đăng nhập với OpenAI**. Hoàn tất đăng nhập trong cửa sổ OpenAI; dashboard tự cập nhật khi thành công. Không cần nhập API key hoặc đăng nhập bằng terminal.

Compose chạy cả dashboard và worker. Phiên Codex và dữ liệu được giữ trong volumes khi dừng hoặc tạo lại container. Cổng dashboard và OAuth callback chỉ mở trên máy local.

Các repository trong `~/Documents/Personal` xuất hiện tại `/repos`. Ví dụ, `~/Documents/Personal/my-app` được đăng ký là `/repos/my-app`. Đổi thư mục chia sẻ khi cần:

```sh
HARNESS_REPOS_DIR=/absolute/path/to/projects docker compose up -d
```

```sh
docker compose logs -f   # Xem log
docker compose down      # Dừng, giữ dữ liệu
```

Runtime trong image gồm Node.js, Python, Git và GitHub CLI. Repo cần Java hoặc toolchain khác phải bổ sung runtime vào image. Bàn giao GitHub cần đăng nhập `gh` và quyền push riêng.

## Chạy trực tiếp

- Node.js **24.18.0 trở lên, thuộc nhánh 24**, npm và Git.
- Codex CLI hỗ trợ `app-server`, đã đăng nhập.
- GitHub CLI (`gh`) và quyền push nếu cần tạo pull request.

Môi trường đã kiểm chứng: macOS. Windows chưa được kiểm chứng.

```sh
nvm use
npm ci
codex login
npm run dev
```

Mở [http://127.0.0.1:3000](http://127.0.0.1:3000). `npm run dev` khởi động cả dashboard và worker; dùng `Ctrl+C` để dừng.

1. Kiểm tra model trong **Model & skills**.
2. Đăng ký repository Git có commit và nhánh nguồn.
3. Tạo task, trả lời câu hỏi và duyệt plan.
4. Theo dõi kiểm thử, review và kết quả bàn giao.

## Dữ liệu và giới hạn

Khi chạy trực tiếp, dữ liệu, artifacts và worktrees được lưu trong `.harness/`, không được commit. Trong Docker, chúng được lưu tại `/data` trong volume `harness-data`. Đặt `HARNESS_DATA_DIR` để đổi nơi lưu; dashboard và worker phải dùng cùng thư mục.

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
