# Sandbox trong Docker

## Git qua SSH trên Docker Desktop

Compose kết nối SSH agent của máy qua `/run/host-services/ssh-auth.sock` theo cơ chế Docker Desktop cho macOS/Linux. Private key nằm trên máy; container chỉ yêu cầu agent ký xác thực. File `~/.ssh/known_hosts` được mount chỉ đọc tại `/etc/ssh/ssh_known_hosts`; Git giữ `StrictHostKeyChecking=yes` và không hỏi mật khẩu trong worker.

Trước khi chạy Harness, nạp đúng key GitHub vào agent trên máy, ví dụ `ssh-add ~/.ssh/id_ed25519`. Agent phải có key đã được đăng ký với GitHub; file `known_hosts` phải có host GitHub đã xác minh. Không mount toàn bộ `~/.ssh` hoặc copy private key vào image. Docker Engine không dùng Desktop cần điều chỉnh source socket thành socket agent phù hợp của host.

Kiểm tra cấu hình thực tế bằng `HARNESS_DOCKER_RUNTIME_TEST=1 HARNESS_DOCKER_SSH_AGENT_TEST=1 npm test -- tests/integration/docker-ssh.test.ts` sau khi khởi động container. Các test này yêu cầu Docker Desktop và agent đã có key, không đọc private key.

## Sandbox của Codex

`docker-seccomp.json` dựa trên [default profile của Moby](https://github.com/moby/profiles/blob/main/seccomp/default.json), lấy ngày 2026-10-05, theo Apache-2.0.

SHA256 bản upstream trước khi bổ sung rule: `6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6`. License đi kèm tại [MOBY-LICENSE.txt](MOBY-LICENSE.txt).

Giữ default deny và các rule của Moby; bổ sung allow cho `clone`, `unshare`, `mount`, `umount2`, `pivot_root` để Codex bubblewrap tạo namespace con. Không cấp `CAP_SYS_ADMIN`, không dùng container privileged hoặc tắt seccomp. Quyền mount trong kernel vẫn phụ thuộc capabilities của namespace; cấu hình này mở thêm bề mặt syscall cho container, nên chỉ áp dụng cho service Harness.

Sandbox của mỗi lượt Codex vẫn kiểm soát filesystem và network. Kiểm chứng với đúng image đang dùng:

```sh
HARNESS_DOCKER_SANDBOX_TEST=1 npm test -- tests/integration/docker-sandbox.test.ts
```

Test chạy container tạm, không mount repo/credentials, không gọi model; yêu cầu đọc file thành công, ghi ngoài vùng cho phép bị từ chối và tạo network socket bị từ chối. Khi nâng Docker/Codex hoặc profile, chạy lại test này.
