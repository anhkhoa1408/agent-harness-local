# Skills đóng gói cùng Harness

Worker đọc trực tiếp các file trong thư mục này; không cần plugin cache, installer hoặc cấu hình Skill roots trên máy. `src/context/skills.ts` quyết định file nào đi vào context của mỗi stage. Các file hỗ trợ còn lại được giữ cùng bản gốc để truy xuất nguồn, không tự động thực thi.

- Superpowers 6.4.2: writing-plans, test-driven-development, requesting-code-review, receiving-code-review, systematic-debugging, verification-before-completion.
- Matt Pocock skills 1.2.3: grilling.

Đây là bản phân phối `openai-curated-remote`, không tuyên bố version là Git commit upstream. `sources.json` ghi URL repo nguồn, phiên bản distribution và SHA256 từng file; mỗi thư mục provider giữ MIT LICENSE. Agent profiles ECC/VoltAgent ở `../agents/` có manifest nguồn riêng.

Khi cập nhật: chọn bản distribution cụ thể, thay trọn thư mục skill được dùng và các tài liệu phụ thuộc, giữ license, cập nhật version/SHA256 trong manifest, review diff và chạy tests context/portability cùng pipeline E2E. Không sửa bản gốc để đổi hành vi; sửa registry/adaptations của harness. Context đã snapshot của task cũ không bị thay đổi.
