# AGENTS.md

Hướng dẫn hành vi để giảm lỗi lập trình phổ biến của LLM. Kết hợp với hướng dẫn riêng của dự án khi cần. Ưu tiên sự thận trọng hơn tốc độ; với tác vụ đơn giản, dùng mức quy trình phù hợp.

## 1. Suy nghĩ trước khi code

Không phỏng đoán hoặc che giấu sự mơ hồ. Nêu rõ các đánh đổi.

- Nêu rõ giả định trước khi triển khai. Nếu không chắc về một quyết định ảnh hưởng hành vi, hãy hỏi.
- Nếu có nhiều cách hiểu, trình bày các cách hiểu thay vì âm thầm chọn một.
- Nếu có cách tiếp cận đơn giản hơn, hãy nói ra và phản biện khi cần.
- Khi requirement chưa rõ, nêu cụ thể điểm mơ hồ và làm rõ trước khi sửa phần code phụ thuộc vào quyết định đó.

## 2. Ưu tiên sự đơn giản

Viết code tối thiểu để giải quyết đúng yêu cầu.

- Không thêm tính năng ngoài yêu cầu.
- Không tạo abstraction cho code chỉ dùng một lần.
- Không thêm tính linh hoạt hoặc cấu hình chưa được yêu cầu.
- Không xử lý lỗi cho các tình huống không thể xảy ra.
- Nếu 50 dòng giải quyết rõ ràng cùng một vấn đề mà đang dùng 200 dòng, hãy đơn giản hóa.
- Tự kiểm tra: một senior engineer có đánh giá cách làm này quá phức tạp không?

## 3. Thay đổi có mục tiêu

Chỉ chạm vào những gì cần thiết; chỉ dọn dẹp phần dư thừa do thay đổi của mình tạo ra.

- Giữ nguyên phong cách code hiện tại.
- Không cải thiện code, comment hoặc định dạng xung quanh ngoài phạm vi task.
- Không refactor phần không liên quan hoặc không bị hỏng.
- Nếu phát hiện dead code có sẵn không liên quan, báo lại thay vì xóa.
- Xóa import, biến hoặc hàm trở thành thừa do chính thay đổi của mình.
- Mỗi dòng thay đổi phải liên hệ được với yêu cầu của người dùng.

## 4. Thực thi theo mục tiêu

Xác định tiêu chí thành công có thể kiểm chứng và lặp đến khi có bằng chứng đáp ứng, trong giới hạn thực thi đã thống nhất.

- Thêm validation: viết test cho input không hợp lệ, quan sát failure phù hợp, rồi làm test pass.
- Sửa bug: tái hiện lỗi, tìm nguyên nhân, viết test hồi quy và chứng minh test pass sau sửa.
- Refactor được yêu cầu: kiểm tra hành vi liên quan trước và sau thay đổi.
- Với tác vụ nhiều bước, nêu kế hoạch ngắn: mỗi bước đi kèm điều kiện kiểm tra.
- Nếu mục tiêu chỉ là “làm cho nó chạy”, làm rõ hành vi mong đợi trước khi triển khai.
- Báo kết quả theo bằng chứng thực tế; phân biệt pass, fail, blocked và skipped.

Đối với Agent Harness này, phạm vi bắt buộc là test của feature hoặc bug đang xử lý. Có thể bỏ qua test cũ ngoài phạm vi; ghi rõ phần không chạy. Viết test cho tính năng mới và bug đang sửa, không bổ sung test hàng loạt cho code cũ. Không bỏ qua test bắt buộc của feature chỉ để báo thành công.

## 5. Ngôn ngữ

Trả lời bằng tiếng Việt, giữ nguyên thuật ngữ tech khi cần. Viết ngắn gọn, rõ ràng, đúng trọng tâm, ưu tiên tính thực tế. Dùng bullet khi giúp đọc dễ hơn.

## 6. Quy tắc theo loại dự án

Chỉ khi task chỉnh sửa Liquid/Shopify theme hoặc tối ưu Core Web Vitals cho theme, đọc `rules/lighthouse-performance.md` trong repo đích trước khi thay đổi phần liên quan. Nếu file chưa có, báo rõ rule còn thiếu và yêu cầu nội dung; không tự suy diễn rule. Những repo và task khác không cần rule này.

## 7. Thiết kế của workspace này

Khi thiết kế hoặc triển khai Agent Harness, đọc [spec](docs/superpowers/specs/2026-09-23-agent-harness-design.md) và dùng phiên bản đã được người dùng duyệt. Đề xuất sửa spec nếu có xung đột; không âm thầm thay requirement.

`AGENTS.md` này có hiệu lực cho workspace Agent Harness. Khi xây chức năng điều phối repo khác, lấy các quy tắc hành vi ở mục 1–6 làm baseline được quản lý bởi harness, kết hợp với hướng dẫn của repo đích; không chép mục 7 hoặc ghi đè `AGENTS.md` của repo đích.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
