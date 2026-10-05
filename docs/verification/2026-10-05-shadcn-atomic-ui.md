# Kiểm chứng migration UI shadcn/ui và Atomic Design

Ngày: 2026-10-05. Phạm vi: toàn bộ Login, Tổng quan, Settings và Task detail.

## Kết quả triển khai

- Component chính thức shadcn/ui: Button, Input, Textarea, Label, Badge, Card, Select, Tabs, Alert, Collapsible, Separator; Tailwind CSS v4 và theme tối xanh bằng semantic tokens.
- Atomic Design: `components/ui` là primitives generic; atoms trình bày stage; molecules gồm field/status/feedback/model selector; organisms chứa form/list/pipeline/plan/evidence/timeline; templates chứa layout; pages chứa state/API/polling và auth guard. Route Next.js chỉ ghép page controller.
- Giữ API/payload/polling/event cursor và luồng OAuth, approval, Plan feedback, pause/resume/cancel, folder picker, cấu hình model/execution mode và bàn giao.
- Giữ tính năng kiểm chứng ảnh UI đang có trong workspace: UiVerificationPlan và ScreenshotLinks. Không thêm tab Diff.
- Giữ thay đổi chưa commit có sẵn; không sửa backend để phục vụ migration, không commit/push hoặc thay container Docker đang chạy.

## Bằng chứng

| Kiểm tra | Kết quả |
| --- | --- |
| Typecheck | PASS |
| Production build Next.js | PASS: compile, TypeScript và page generation exit 0 |
| E2E đầy đủ cho 6 file UI | PASS: 29/29, trước bổ sung kiểm chứng mô tả form |
| E2E `ui.spec.ts` sau accessibility fix cuối | PASS: 8/8; mô tả form đã có RED → GREEN |
| Unit hiển thị UI Verify và screenshot links | PASS: 2/2 |
| Whitespace diff | PASS |
| Responsive | PASS: scrollWidth không vượt viewport 390px/1280px trên cả bốn màn, kể cả title/branch/evidence dài |
| Timeline | PASS: giữ 40 sự kiện mới nhất; cuộn riêng, tối đa 480px desktop/350px dưới 1100px; End không di chuyển heading |
| Review độc lập cuối | 2 finding P2 đã sửa; cả hai có E2E RED → GREEN; đang chạy suite đầy đủ với output riêng |
| Test backend cũ ngoài phạm vi | SKIPPED |
| OAuth/tài khoản Codex thật | SKIPPED: dùng fixture/test mode |
| Rebuild và restart Docker hiện có | SKIPPED: image hiện tại chưa chứa migration; dùng `docker compose up -d --build` để cập nhật khi sẵn sàng |

Lệnh kiểm chứng chính:

```sh
npm run typecheck
npm run build
npm run test:e2e -- tests/e2e/login.spec.ts tests/e2e/folder-picker.spec.ts tests/e2e/ui.spec.ts tests/e2e/lifecycle.spec.ts tests/e2e/plan-feedback.spec.ts tests/e2e/timeline.spec.ts
npm run test:e2e -- tests/e2e/ui.spec.ts
npx vitest run tests/unit/ui-verification-plan.test.ts
```

Test E2E đầy đủ đã quan sát RED ở navigation active và keyboard tabs trước migration, rồi GREEN sau migration. Test lỗi Settings đã quan sát RED vì feedback không có role alert, rồi GREEN với selection được giữ. Test repo/model cho thấy Radix phát callback rỗng lúc option async remount; sau xử lý, repo vừa đăng ký và model đã cấu hình không bị mất. Test không giảm assertion nghiệp vụ khi chuyển selector native sang accessible option.

## Ảnh kiểm tra

Ảnh nằm trong thư mục `docs/verification/2026-10-05-shadcn-atomic-ui/`:

- `overview-390.png`, `overview-1280.png`
- `settings-390.png`, `settings-1280.png`
- `detail-390.png`, `detail-1280.png`
- `login-390.png`, `login-1280.png`
- `empty-offline.png`, `loading.png`, `auth-error.png`

Đã xem ảnh của cả bốn màn ở desktop/mobile và các trạng thái empty/offline/loading/error. Dữ liệu dài và model fixture trong ảnh là dữ liệu test, không phải phiên người dùng thật. Review sau đó phát hiện comment không có khoảng trắng cần wrapping bổ sung; đã thêm regression test và sửa ở TaskPlan. Các ảnh đã xem không có control bị che hoặc lỗi màu/chữ. Marker Next.js Dev Tools trong ảnh thuộc dev server.

## Quyết định khi triển khai

1. Tái sử dụng worktree hiện tại và không tự commit các local edits hỗn hợp. Chi phí: người dùng cần chọn scope khi commit sau này.
2. Component CLI sinh import `cn` thành package riêng dù đã có alias; chuẩn hóa sang `@/lib/utils` và bỏ dependency thừa. Kiểm chứng: typecheck/build pass.
3. SelectField bỏ qua callback giá trị rỗng do native select nội bộ của Radix khi async options remount. Không có option rỗng cho người dùng chọn; caller vẫn có thể đặt value rỗng chủ động. Chi phí: nếu bổ sung khả năng clear/reset Select sau này, cần định nghĩa hành vi riêng và test.
4. Auth guard nằm trong page controller WorkspaceAccess; WorkspaceLayout chỉ bố cục theo spec. Kiểm chứng: loading/error không lộ navigation/workspace.
5. Tabs giữ panel mounted và ẩn panel không active để giữ bản nháp góp ý khi đổi tab. Chi phí: panel ẩn vẫn tồn tại trong DOM; test và consumer phải scope panel hiện tại hoặc phần tử visible.
6. Giữ toàn bộ DOM form repository khi panel ẩn, tránh mất base/remote chưa submit. Chi phí: form ẩn vẫn mounted; field không tham gia focus khi panel đóng. Đã kiểm chứng collapse/reopen giữ path/develop/upstream.
7. Khôi phục overflow-wrap:anywhere tại biên TaskPlan để comment/scope/metadata dài không tràn. Đã quan sát RED: viewport 390px có scrollWidth 9228px; sau sửa test comment pass.
8. Timeline E2E dùng route fixture trên trang thật thay vì render HTML cùng CSS Tailwind chưa compile. Giữ toàn bộ assertion số lượng/thứ tự sự kiện, giới hạn chiều cao và thao tác End.

9. Tách thư mục Playwright output cho kiểm chứng cuối: một lượt test khác xóa trace chung gây ENOENT khi đóng browser, dù assertion nghiệp vụ pass. Không sửa config dự án hoặc dừng process của task khác.

## Giới hạn

Bằng chứng xác nhận UI và luồng fixture trong checkout hiện tại. Test backend cũ và deployment Docker không nằm trong lần kiểm chứng này. Container trên cổng 3000 chạy image build trước đó nên refresh browser chưa cập nhật source; cần rebuild image để thấy UI mới trên container.
