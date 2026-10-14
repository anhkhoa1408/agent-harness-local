# Thiết kế UI shadcn/ui và Atomic Design

Ngày: 2026-10-05. Trạng thái: chờ người dùng duyệt bản spec này.

## Mục tiêu và phạm vi

Phạm vi triển khai là chuyển toàn bộ UI sang shadcn/ui và chia component theo Atomic Design, theo lựa chọn của người dùng. Các màn Login, Tổng quan, Settings và Task detail đều nằm trong phạm vi, gồm form, pipeline, yêu cầu đầu vào/approval, Plan feedback, evidence, timeline và kết quả bàn giao.

Giữ tông tối xanh đã đề xuất, thống nhất cách trình bày, điều chỉnh bố cục theo kích thước màn hình và hỗ trợ thao tác bằng bàn phím. Không thêm nghiệp vụ, route, dark/light toggle, tìm kiếm hoặc lọc task ngoài yêu cầu. Thiết kế tuân theo spec `2026-09-23-agent-harness-design.md` và các bổ sung đã duyệt.

## Lựa chọn kỹ thuật

Tích hợp Tailwind CSS v4, cấu hình PostCSS và shadcn/ui vào Next.js hiện có. Thêm alias `@/*` trỏ đến `src/*`, file `components.json` và utility `cn`. Trước khi triển khai, đọc hướng dẫn Next.js trong `node_modules/next/dist/docs/`. Lấy component từ registry chính thức của shadcn/ui và chỉ thêm component cần cho UI hiện tại.

Dùng CSS variables theo vai trò giao diện: background, foreground, primary, muted, border, destructive và focus ring. Chuyển màu hiện tại sang các token này. CSS toàn cục giữ reset/theme. Chỉ xóa selector cũ sau khi toàn bộ component dùng selector đó đã được chuyển. Giữ CSS riêng cho pipeline nếu utility classes không diễn đạt rõ hơn.

## Cấu trúc Atomic Design

| Tầng             | Vị trí                                             | Trách nhiệm và ví dụ                                                                                                                                    |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primitive shadcn | `src/components/ui/`                               | Component registry chính thức: Button, Input, Textarea, Label, Badge, Card, Select, Tabs, Alert, Collapsible, Separator; số lượng thực tế theo consumer |
| Atoms            | `src/components/atoms/`                            | Đơn vị trình bày nhỏ đặc thù Harness như StageIndicator; tái sử dụng trực tiếp primitive shadcn, không tạo wrapper chỉ đổi tên                          |
| Molecules        | `src/components/molecules/`                        | Tổ hợp nhỏ như FormField, StatusBadge, EmptyState, ModelSelector, thông báo trạng thái                                                                  |
| Organisms        | `src/components/organisms/`                        | RepositoryForm, NewTaskForm, TaskList, WorkspaceOverview, Pipeline, TaskRequests, TaskPlan, TaskEvidence, TaskTimeline và các khối cấu hình model       |
| Templates        | `src/components/templates/`                        | WorkspaceLayout, AuthLayout và TaskDetailLayout, chịu trách nhiệm bố cục, không gọi API                                                                 |
| Pages            | `src/app/**/page.tsx` cùng `src/components/pages/` | Route Next.js và các page controller ghép template/organism với state, polling và mutation                                                              |

`components/ui` là nền tảng của Atomic Design, gồm primitive ở mức atom và tổ hợp dùng chung như Card/Tabs. Component shadcn không bắt buộc thuộc tầng atoms. Component của Harness được phân tầng theo trách nhiệm thực tế; không thêm file rỗng chỉ để đủ năm tầng.

Helper không phải UI, gồm API client, labels và type task detail, nằm ở vị trí dùng chung phù hợp, ngoài atoms/molecules. Chiều import: page → template/organism → molecule/atom → ui. UI cấp thấp không import page controller hoặc nghiệp vụ worker.

## Bố cục và hành vi

- Workspace dùng icon thống nhất cho sidebar và topbar, hiển thị rõ route hiện tại. Desktop giữ sidebar; màn nhỏ dùng navigation gọn, không che nội dung.
- Tổng quan hiển thị số liệu bằng card, thống nhất form tạo task và đăng ký repo. Danh sách task có status và pipeline. Giữ bộ chọn thư mục native, input đường dẫn dự phòng và dữ liệu form hiện có.
- Settings dùng card cho chế độ thực thi và model theo stage. Effort vẫn cố định theo policy; payload và thông báo lưu giữ nguyên.
- Task detail có header, status, pipeline, action bar, khối approval/feedback, evidence tabs và timeline. Desktop chia cột, mobile xếp dọc. Tabs có semantics và hỗ trợ đầy đủ thao tác bàn phím. Không khôi phục tab Diff đã bỏ.
- Login dùng AuthLayout và Button shadcn, giữ nội dung tối giản với nút đăng nhập và feedback hiện tại. Popup OAuth, polling và redirect giữ nguyên.

Label phải liên kết với input tương ứng. Form dùng Select shadcn vẫn giữ `name` và value cần cho FormData. Hành vi submit, required validation và disabled/busy phải tương đương hiện tại. Màu trạng thái luôn đi kèm text hoặc icon. Nội dung dài và timeline không được tràn viewport. Các khối loading, empty, error và success dùng style nhất quán và role phù hợp.

## Dữ liệu và ranh giới

Giữ nguyên API endpoints, payload, polling interval, event cursor, expectedRevision, command ID, policy approval, pause/resume/cancel và hành vi worker. Page controller quản lý state và side effect; organism nhận dữ liệu và callback qua props. Không thêm state framework, design-system package hoặc API layer.

Tại thời điểm lập spec, workspace có các thay đổi chưa commit về login guard, folder picker, Plan feedback và execution mode. Triển khai phải dựa trên nội dung hiện tại, không reset hoặc thay bằng phiên bản HEAD. Chỉ sửa backend khi có vấn đề trực tiếp chặn migration và phần sửa đã được xác định trong phạm vi riêng.

## Kiểm chứng và điều kiện hoàn thành

1. Typecheck và production build phải pass.
2. Chạy E2E Login, lifecycle, Plan feedback và folder picker vì cả bốn màn và control liên quan đều thay đổi. Điều chỉnh locator theo accessible role/name, không giảm assertion nghiệp vụ để test pass.
3. Thêm E2E UI cho navigation hiện tại, evidence tabs bằng bàn phím, select/form submission và không tràn ngang ở viewport 390px/1280px. Tái sử dụng fixture/test mode; không gọi tài khoản Codex thật.
4. Kiểm tra trực quan Login, Tổng quan, Settings và Task detail trên desktop/mobile; kiểm tra loading/error/empty, focus và nội dung dài bằng dữ liệu test. Báo rõ trạng thái nào chưa quan sát được.
5. Kiểm tra import để không còn UI consumer dùng component cũ hoặc đường dẫn đã di chuyển; kiểm tra diff để không xóa các thay đổi có sẵn và không sửa runtime ngoài phạm vi.

Test backend cũ ngoài phạm vi UI không cần chạy hàng loạt. Báo pass/fail/blocked/skipped theo kết quả thực tế; test chưa chạy không được coi là pass. Migration chỉ hoàn thành khi các control cũ đều dùng nền tảng shadcn và mọi kiểm chứng bắt buộc nêu trên có bằng chứng.

## Rủi ro và biện pháp

- Tailwind preflight có thể thay style native. Chuyển từng màn và kiểm tra trực quan trước khi xóa CSS cũ.
- Custom Select có thể làm mất FormData hoặc validation. Kiểm chứng bằng tương tác và mutation payload.
- Di chuyển component có thể làm sai ranh giới client/server. Giữ use-client tại entry point phù hợp và xác nhận bằng production build.
- Dependency mới có thể không tương thích với phiên bản React/Next. Kiểm tra package metadata trước khi cài; không nâng phiên bản framework trong task này.
