# Kiểm chứng thông báo duyệt quyền

Ngày: 2026-10-07. Phạm vi đã duyệt: thông báo hệ điều hành cho quyền thực thi khi còn ít nhất một tab Harness mở; nhấn để quay về đúng task/yêu cầu trên web.

## Kết quả

| Kiểm tra | Trạng thái | Bằng chứng |
| --- | --- | --- |
| Unit của feature | Passed | 9 tests: chống lặp, nhiều lần polling/reload, URL có encoding, đóng yêu cầu đã xử lý, permission default/denied, response sau abort, lỗi constructor/feed và lỗi native bất đồng bộ |
| Integration của feature | Passed | 1 test: feed có session local, từ chối origin ngoài/session thiếu, lọc task manual đang chạy, không lộ command/params, loại request đã quyết định/hủy và detail hết hiệu lực |
| HTTP regression liên quan | Passed | 2 tests trong `tests/integration/http.test.ts`; tổng Unit/Integration chọn lọc 12 passed |
| E2E của feature | Passed | 7 tests: bật bằng click, mở/focus card, nhiều tab, reload tab khác và tab tạo thông báo, yêu cầu mới, link cũ, permission denied, lỗi native bất đồng bộ |
| Native Notifications API | Passed | Một trong 7 E2E dùng constructor thật trong Chromium có cửa sổ: nhận sự kiện `show`, không nhận `error`; browser context test được cấp permission notifications |
| Login/navigation liên quan | Passed | 3 signed-out routes và 1 navigation test; tổng lượt E2E chọn lọc cuối 11 passed |
| Typecheck | Passed | `npm run typecheck`, exit 0 |
| Production build | Passed | `npm run build`, exit 0; Next.js 16.3.6 biên dịch và tạo routes thành công |
| Format/diff | Passed | Prettier cho các file feature; `git diff --check`, exit 0 |
| Review độc lập | Passed | Đã sửa finding async `Notification.onerror`, thêm regression test; không còn Critical/Important trong review follow-up |
| Banner và thao tác nhấn của hệ điều hành | Skipped | Chưa quan sát banner hoặc nhấn banner macOS thủ công. E2E click/focus dùng notification giả; native `show` không chứng minh thao tác này |
| Legacy UI empty-state | Failed, ngoài phạm vi | `tests/e2e/ui.spec.ts` — `empty, offline, loading and error feedback remain accessible` tìm “Workspace đang sẵn sàng”. Source ở HEAD đã mặc định filter `running`, nên màn hình hiển thị “Không có hoạt động phù hợp”. Không sửa test hoặc behavior cũ trong feature này |
| Các test cũ còn lại | Skipped trong lượt kiểm chứng cuối | Không phải bằng chứng pass cho toàn bộ repo |

## Cách chạy lại

```sh
npm exec -- vitest run tests/unit/approval-notifications.test.ts tests/integration/approval-notifications.test.ts tests/integration/http.test.ts
npm exec -- playwright test tests/e2e/approval-notifications.spec.ts tests/e2e/login.spec.ts tests/e2e/ui.spec.ts --grep 'notification|expired deep link|signed-out visitor|navigation marks'
npm run typecheck
npm run build
```

Spec E2E thông báo dùng `headless: false`, cần desktop có cửa sổ. Server E2E chạy loopback với data test riêng. Các test ứng dụng giả feed và auth để không chạy agent/cấp quyền thật; test native chỉ quan sát Notifications API thật. Bản đầu không nhận request mới sau khi đóng hết tab; browser có thể trì hoãn polling khi tab bị treo hoặc máy ngủ.

## Bằng chứng phát hiện lỗi trước khi sửa

- Feed mới ban đầu trả 404; test Integration kỳ vọng 200 đã fail rồi pass sau bổ sung endpoint.
- E2E ban đầu không tìm thấy nút “Bật thông báo”; pass sau thêm control và bộ polling.
- Detail của task cancelled còn trả approval chưa dọn; assertion fail rồi pass sau đồng bộ filter với feed.
- Native notification constructor thành công rồi phát `error` chưa cho retry; regression Unit fail rồi pass sau xóa claim dưới Web Lock.
- Native `show` không xuất hiện trong browser headless; test được chạy với cửa sổ thật và pass. Đây là điều kiện chạy của native smoke, không phải bằng chứng banner đã được xem thủ công.
- Test OAuth proxy cũ bị sandbox chặn mở loopback ở lượt integration ban đầu; đã chạy lại riêng với quyền chạy server local và pass.

Thay đổi Plan đang có trong cùng checkout thuộc công việc khác; không nằm trong phạm vi review và kiểm chứng feature này.
