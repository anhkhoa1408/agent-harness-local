# Thiết kế UI shadcn/ui và Atomic Design

Ngày: 2026-10-05. Trạng thái: chờ người dùng duyệt bản spec này.

## Mục tiêu và phạm vi

Người dùng yêu cầu mở rộng UI bằng shadcn/ui, chia component theo Atomic Design và đã chọn chuyển toàn bộ UI. Áp dụng cho Login, Tổng quan, Settings và Task detail, gồm các form, pipeline, yêu cầu đầu vào/approval, Plan feedback, evidence, timeline và kết quả bàn giao.

Giữ tông tối xanh đã đề xuất. Cải thiện sự nhất quán, responsive và khả năng thao tác bằng bàn phím. Không bổ sung nghiệp vụ, route, dark/light toggle, tìm kiếm hoặc lọc task ngoài yêu cầu. Tiếp tục tuân thủ spec `2026-09-23-agent-harness-design.md`, bao gồm các bổ sung đã được duyệt.

## Lựa chọn kỹ thuật

Tích hợp Tailwind CSS v4, cấu hình PostCSS và shadcn/ui vào Next.js hiện có; thêm alias `@/*` trỏ đến `src/*`, `components.json` và utility `cn`. Đọc hướng dẫn Next.js được đóng gói trong `node_modules/next/dist/docs/` trước triển khai. Lấy component từ registry chính thức shadcn/ui và chỉ thêm những component UI hiện tại cần dùng.

Dùng CSS variables semantic cho background, foreground, primary, muted, border, destructive và focus ring. Chuyển màu hiện tại sang các token này. CSS toàn cục giữ reset/theme; loại bỏ các selector cũ khi toàn bộ consumer tương ứng đã được chuyển. CSS riêng cho pipeline chỉ giữ nếu utility classes không diễn đạt rõ hơn.

## Cấu trúc Atomic Design

| Tầng             | Vị trí                                             | Trách nhiệm và ví dụ                                                                                                                                    |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primitive shadcn | `src/components/ui/`                               | Component registry chính thức: Button, Input, Textarea, Label, Badge, Card, Select, Tabs, Alert, Collapsible, Separator; số lượng thực tế theo consumer |
| Atoms            | `src/components/atoms/`                            | Đơn vị trình bày nhỏ đặc thù Harness như StageIndicator; tái sử dụng trực tiếp primitive shadcn, không tạo wrapper chỉ đổi tên                          |
| Molecules        | `src/components/molecules/`                        | Tổ hợp nhỏ như FormField, StatusBadge, EmptyState, ModelSelector, thông báo trạng thái                                                                  |
| Organisms        | `src/components/organisms/`                        | RepositoryForm, NewTaskForm, TaskList, WorkspaceOverview, Pipeline, TaskRequests, TaskPlan, TaskEvidence, TaskTimeline và các khối cấu hình model       |
| Templates        | `src/components/templates/`                        | WorkspaceLayout, AuthLayout và TaskDetailLayout, chịu trách nhiệm bố cục, không gọi API                                                                 |
| Pages            | `src/app/**/page.tsx` cùng `src/components/pages/` | Route Next.js và các page controller ghép template/organism với state, polling và mutation                                                              |

`components/ui` là nền tảng của Atomic Design, gồm cả primitive ở mức atom và tổ hợp generic như Card/Tabs; không ép tất cả component shadcn vào atoms. Component của Harness chỉ được phân tầng khi có trách nhiệm thực tế; không thêm file rỗng để đủ năm tầng.

Các file helper không phải UI (API client, labels và type task detail) ở vị trí dùng chung thích hợp, không xếp vào atoms/molecules. Chiều import: page → template/organism → molecule/atom → ui; UI cấp thấp không import page controller hoặc nghiệp vụ worker.

## Bố cục và hành vi

- Workspace: sidebar và topbar dùng icon thống nhất, trạng thái route hiện tại rõ ràng; desktop giữ sidebar, màn nhỏ chuyển thành navigation gọn, không che nội dung.
- Tổng quan: các số liệu thành card, form tạo task và đăng ký repo nhất quán; danh sách task có status và pipeline. Giữ chọn thư mục native, input đường dẫn dự phòng và dữ liệu form hiện có.
- Settings: card chế độ thực thi và model theo stage; model vẫn có effort cố định theo policy, giữ payload và thông báo lưu.
- Task detail: header, status, pipeline, action bar, khối approval/feedback, evidence tabs và timeline; desktop chia cột, mobile xếp dọc. Tabs có semantics và thao tác bàn phím đầy đủ. Không khôi phục tab Diff đã bị bỏ.
- Login: dùng AuthLayout và Button shadcn, giữ nội dung tối giản với nút đăng nhập và feedback hiện tại. Giữ popup OAuth, polling và redirect.

Label/input phải liên kết rõ ràng. Form dùng Select shadcn vẫn giữ `name` và value cần cho FormData; submit, required validation và disabled/busy phải tương đương hành vi hiện tại. Màu trạng thái luôn đi kèm text/icon. Nội dung dài và timeline không làm tràn viewport. Các khối loading, empty, error và success có style nhất quán và role phù hợp.

## Dữ liệu và ranh giới

Giữ API endpoints, payload, polling interval, event cursor, expectedRevision, command ID, policy approval, pause/resume/cancel và worker behavior. Page controller sở hữu state và side effect; organism nhận dữ liệu/callback qua props. Không xây state framework, design-system package hoặc API layer mới.

Workspace hiện có nhiều thay đổi chưa commit, gồm login guard, folder picker, Plan feedback và execution mode. Triển khai dựa trên nội dung hiện tại, không reset hay thay bằng phiên bản HEAD. Chỉ sửa backend nếu phát hiện vấn đề trực tiếp ngăn migration và được xác định trong phạm vi riêng.

## Kiểm chứng và điều kiện hoàn thành

1. Typecheck và production build phải pass.
2. Chạy E2E Login, lifecycle, Plan feedback và folder picker vì cả bốn màn và control liên quan đều thay đổi. Điều chỉnh locator theo accessible role/name, không giảm assertion nghiệp vụ để test pass.
3. Thêm E2E UI cho navigation hiện tại, evidence tabs bằng bàn phím, select/form submission và không tràn ngang ở viewport 390px/1280px. Tái sử dụng fixture/test mode; không gọi tài khoản Codex thật.
4. Kiểm tra trực quan Login, Tổng quan, Settings và Task detail trên desktop/mobile; kiểm tra loading/error/empty, focus và nội dung dài bằng dữ liệu test. Báo rõ trạng thái nào chưa quan sát được.
5. Kiểm tra import để không còn UI consumer dùng component cũ hoặc đường dẫn đã di chuyển; kiểm tra diff để không xóa các thay đổi có sẵn và không sửa runtime ngoài phạm vi.

Không chạy hàng loạt test backend cũ ngoài phạm vi UI. Báo pass/fail/blocked/skipped theo kết quả thực tế; không coi test chưa chạy là pass. Chỉ hoàn thành migration khi các control cũ đều dùng nền tảng shadcn và mọi kiểm chứng bắt buộc phía trên có bằng chứng.

## Rủi ro và biện pháp

Tailwind preflight có thể thay style native: chuyển từng màn và kiểm tra trực quan trước khi xóa CSS cũ. Custom Select có thể làm mất FormData hoặc validation: kiểm chứng bằng tương tác và mutation payload. Di chuyển component có thể làm sai ranh giới client/server: giữ use-client tại entry point phù hợp và xác nhận bằng production build. Dependency mới có thể không tương thích phiên bản React/Next: kiểm tra package metadata trước khi cài và không nâng phiên bản framework trong task này.
