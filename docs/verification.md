# Kiểm chứng Agent Harness MVP

Branch: `codex/agent-harness-mvp`. Triển khai Native theo spec và plan trong `docs/superpowers/`.

## Kết quả

- 40 unit/integration tests: pass.
- 6 Playwright E2E: pass (repo JavaScript/Python tạm; fake agent, Git và test runner thật).
- TypeScript và production build: pass.
- Catalog Codex thật và một lượt read-only `gpt-6-sol`, effort `medium`, trên repo tạm: pass trong lượt kiểm chứng trước.
- Dashboard và Settings đã được kiểm tra trực quan trong browser; Settings lấy catalog thật.
- Chưa chạy pipeline ghi code bằng model thật hoặc tạo GitHub PR thật. PR retry được kiểm tra bằng fake GitHub và bare Git remote.

## Review độc lập và sửa lỗi

Reviewer độc lập dùng model mạnh; review đầu bị gián đoạn nên được tiếp tục bằng reviewer mới trên cùng baseline. Bốn findings quan trọng đã được tái hiện bằng test và sửa:

1. Mất response `turn/start`: giữ `runtime_state_unknown` và khóa writer, phân biệt với explicit RPC rejection.
2. TAP lồng nhau: đếm leaf assertions, bỏ closing suite; skip/todo và suite rỗng không tính thành test đã chạy.
3. Replan sau repair: giữ continuation stage và repair budget, không quay lại initial implement để vượt giới hạn.
4. Delete/rename: fingerprint dùng inventory của source commit cùng trạng thái hiện tại, ổn định qua stage/commit; local delivery retry pass.

Final build còn phát hiện SQLite mở lúc module import gây lock giữa build workers. Đã có regression test và chuyển sang mở database khi request đến; busy timeout thiết lập trước WAL.

Không có minor finding bị hoãn từ review. Không dispatch re-review sau fix; các fixes được kiểm chứng bằng regression tests và bộ test cuối.

## Các quyết định trong quá trình thực thi

1. Missing-module RED trong plan chỉ là bước bootstrap; cần behavioral assertions khi GREEN. Đánh đổi: thêm focused runs.
2. Ưu tiên phạm vi test feature theo yêu cầu người dùng. Harness mới không có legacy tests nên toàn bộ tests hiện tại đều liên quan.
3. Dùng Node 24 từ PATH rõ ràng vì shell ngoài sandbox từng chọn Node 23. Đánh đổi: môi trường phải dùng đúng Node floor.
4. RPC tests dùng JSONL thật trên PassThrough, cộng live catalog và read-only smoke. Recovery có thêm SIGKILL/restart worker process thật; không coi fake transport là bằng chứng live inference.
5. E2E command/script đã duyệt sở hữu readiness, port và cleanup; harness quản lý process group. Đánh đổi: repo cần command E2E tự quản lý server, chưa có service DSL riêng.
6. Runtime không rõ trạng thái khóa mọi writer, cả khi task bị hủy. Boot identity mới chứng minh process cũ đã dừng. Đánh đổi: crash chưa xác nhận có thể cần reboot; chưa tự reconcile mọi orphan trong cùng boot.
7. Discovery snapshot giới hạn 64 KB/file, 500 KB tổng, bỏ tên secret/binary phổ biến. Đánh đổi: repo lớn có thể thiếu context và cần làm rõ thêm.
8. Giữ block AGENTS và tsconfig do Next tự sinh. Baseline gửi sang repo đích vẫn chỉ lấy mục 1–6.

## Phạm vi reviewer không chứng nhận thêm

- Same-boot orphan reconciliation, snapshot lớn và service DSL: giữ các giới hạn công khai ở trên; không tuyên bố đã triển khai phần ngoài MVP đó.
- Live inference/GitHub: reviewer không chạy; chỉ có live read-only smoke do executor thực hiện, chưa có live write/PR.
- Không chứng nhận mọi OS, toolchain hoặc Git submodule; môi trường chạy kiểm chứng là macOS với Node 24.

Hướng dẫn chạy, dữ liệu, pause/resume và các giới hạn vận hành nằm trong [README](../README.md).
