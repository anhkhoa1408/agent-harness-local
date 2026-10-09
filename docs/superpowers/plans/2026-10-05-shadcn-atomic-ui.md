# shadcn/ui và Atomic Design — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans hoặc superpowers:subagent-driven-development theo phương thức người dùng chọn. Triển khai từng task và đánh dấu checkbox theo bằng chứng.

**Goal:** Chuyển toàn bộ UI Harness sang shadcn/ui, giữ tông tối xanh, tổ chức theo Atomic Design và bảo toàn các luồng hiện tại.

**Architecture:** Component shadcn gốc ở `components/ui`; component đặc thù Harness ở atoms, molecules, organisms, templates và pages. Page controller sở hữu state/API/polling; template chỉ bố cục; organism nhận dữ liệu và callback qua props.

**Tech Stack:** Next.js 16.3.6, React 19.3.0, TypeScript, Tailwind CSS v4, shadcn/ui, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-shadcn-atomic-ui-design.md` — đã được người dùng duyệt.

## Global Constraints

- Áp dụng cho Login, Tổng quan, Settings và Task detail; giữ tông tối xanh.
- Không bổ sung nghiệp vụ, route, dark/light toggle, tìm kiếm hoặc lọc task ngoài yêu cầu.
- Không khôi phục tab Diff đã bị bỏ; effort model cố định theo policy.
- Giữ API endpoints, payload, polling interval, event cursor, expectedRevision, command ID và worker behavior.
- Không reset các thay đổi chưa commit; dựa trên nội dung workspace hiện tại, không lấy lại file từ HEAD.
- Đọc guide Next.js đóng gói trước khi sửa code; không nâng phiên bản Next.js/React trong task này.
- Không tạo wrapper chỉ đổi tên primitive; không tạo state framework hoặc design-system package.
- Kiểm tra desktop/mobile ở viewport 1280px/390px; không gọi tài khoản Codex thật trong test.
- Test bắt buộc phải có bằng chứng; không chạy hàng loạt test backend ngoài phạm vi UI.

## Review Focus

1. Select chuyển khỏi HTML native: FormData phải giữ đúng value/name và required validation phải ngăn submit thiếu dữ liệu — task 2 và 3.
2. Folder picker cancel/error: không mất path đã nhập, vẫn cho retry/manual input — task 2.
3. Task title/branch/evidence dài: không gây tràn ngang ở 390px — task 4.
4. Auth check failure/loading: không lộ workspace và nút Login vẫn ở giữa màn hình — task 1.
5. Polling cập nhật detail: không reset tab hoặc bản góp ý đang nhập; action busy không gửi mutation trùng — task 4.

## File map và dependency

- Cấu hình mới: `components.json`, `postcss.config.mjs`, `src/lib/utils.ts`.
- Sửa: `package.json`, lockfile hiện có, `tsconfig.json`, `src/app/globals.css`, `src/app/layout.tsx`, các route page hiện có.
- Shared data helper: chuyển `src/components/api.ts` sang `src/lib/api.ts`; type `src/components/task-detail/types.ts` sang `src/components/organisms/task-detail/types.ts`.
- `src/components/ui/`: Button, Input, Textarea, Label, Badge, Card, Select, Tabs, Alert, Collapsible, Separator từ registry chính thức, chỉ thêm component có consumer.
- `src/components/atoms/stage-indicator.tsx`: StageIndicator, trình bày marker stage.
- `src/components/molecules/`: `form-field.tsx`, `status-badge.tsx`, `empty-state.tsx`, `feedback-message.tsx`, `model-selector.tsx`.
- `src/components/templates/`: `workspace-layout.tsx`, `auth-layout.tsx`, `task-detail-layout.tsx`.
- `src/components/pages/`: `workspace-page.tsx`, `settings-page.tsx`, `task-detail-page.tsx`, `login-page.tsx`; di chuyển controller hiện tại, giữ side effect và handler.
- `src/components/organisms/`: `workspace-navigation.tsx`, `pipeline.tsx`, `workspace/` (bốn component hiện tại), `settings/stage-model-row.tsx`, `task-detail/` (plan, requests, evidence, timeline, types).
- Test thêm: `tests/e2e/ui.spec.ts`; điều chỉnh test hiện có khi selector phụ thuộc HTML native/CSS cũ, giữ assertion nghiệp vụ.

Task chạy tuần tự 1 → 2 → 3 → 4 → 5 vì dùng chung theme và interface. Tái sử dụng managed worktree hiện tại; không tạo checkout mới làm mất local edits. Nếu commit, chỉ stage diff thuộc migration, không gộp các thay đổi có sẵn.

### Task 1: Nền tảng UI, layout và Login

**Files:** Cấu hình, theme, utils/ui primitives; template WorkspaceLayout/AuthLayout; organism WorkspaceNavigation; page Login; `src/app/layout.tsx`, `src/app/login/page.tsx`; `tests/e2e/login.spec.ts`, `tests/e2e/ui.spec.ts`.

**Interfaces:**

- `cn(...inputs: ClassValue[]): string` ở `src/lib/utils.ts`.
- `WorkspaceLayout({ children }: { children: ReactNode }): ReactElement` và `AuthLayout` cùng props; WorkspaceLayout giữ auth guard đang có, AuthLayout chỉ bố cục.
- `WorkspaceNavigation({ pathname }: { pathname: string }): ReactElement` có active link `aria-current="page"`.
- `LoginPage(): ReactElement` giữ GET/POST codex-auth, popup và redirect hiện tại.
- `FeedbackMessage({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }): ReactElement`; error có role alert, thông báo khác có role status.

- [ ] Đọc local guides `01-app/01-getting-started/11-css.md` và `05-server-and-client-components.md`; kiểm tra compatibility/registry chính thức của dependency trước cài.
- [ ] Bổ sung test navigation: `/` đánh dấu Tổng quan active, `/settings` đánh dấu Model & skills active; auth loading/failure không render navigation; Login giữ centered button ở hai viewport. Chạy test mới để xác nhận đỏ do active navigation chưa có.
- [ ] Cài dependency tối thiểu, tạo alias/PostCSS/components.json/cn, thêm primitives chính thức và semantic theme. Giữ CSS cũ tạm thời, giới hạn selector cũ để không ghi đè primitive mới.
- [ ] Triển khai layout/navigation; chuyển login controller sang page, thay nút/feedback bằng component mới và cập nhật route import. Giữ nội dung Login tối giản và nguyên luồng OAuth.
- [ ] Chạy `npm run typecheck` và `npm run test:e2e -- tests/e2e/login.spec.ts tests/e2e/ui.spec.ts -g 'navigation|auth|login|OAuth'`; chỉ đánh dấu pass theo output.

### Task 2: Tổng quan và form

**Files:** `src/components/pages/workspace-page.tsx`; organisms workspace và Pipeline; molecules FormField/StatusBadge/EmptyState; atom StageIndicator; `src/app/page.tsx`, `src/lib/api.ts`; tests folder-picker/UI.

**Interfaces:**

- `WorkspacePage(): ReactElement` giữ state và handler từ TaskForm.
- `FormField({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }): ReactElement`; Label htmlFor=id và hint id liên kết control qua aria-describedby tại caller.
- `StatusBadge({ status }: { status: Status }): ReactElement`, dùng type Status trong contracts.
- `EmptyState({ title, description }: { title: string; description: string }): ReactElement`.
- Các props NewTaskForm, RepositoryForm, TaskList, WorkspaceOverview và Pipeline giữ interface hiện tại; StageIndicator dùng node type từ props Pipeline, không tạo model stage mới.

- [ ] Thêm test UI: chưa chọn repo/title/requirement thì không POST tasks; chọn repo, nhập form, chọn delivery mode thì payload giữ `repositoryId`, `title`, `requirement`, `deliveryMode`. Kiểm tra fixture repo/catalog đáp ứng tên accessible hiện tại trước khi chạy đỏ.
- [ ] Di chuyển controller/organism/helper, cập nhật imports; thêm molecules/atom và thay controls/card/badge/alert/collapsible bằng shadcn. Giữ folder picker cancel/error/busy và native path input.
- [ ] Select có `name`, controlled value, required/disabled và label rõ ràng; xác nhận FormData có value. Sửa locator native `selectedOptions` sang accessible option/trigger; không giảm kiểm chứng repo thật.
- [ ] Chạy `npm run typecheck` và E2E folder-picker/UI cho Tổng quan; xác nhận create/register payload và required-validation assertions pass.

### Task 3: Settings và model selector

**Files:** `src/components/pages/settings-page.tsx`, `src/components/organisms/settings/stage-model-row.tsx`, `src/components/molecules/model-selector.tsx`, `src/app/settings/page.tsx`; tests UI/lifecycle liên quan settings.

**Interfaces:**

- `SettingsPage(): ReactElement`, giữ GET models/settings và PUT settings hiện tại.
- `ModelSelector({ id, value, catalog, onSelect, disabled }: { id: string; value: string; catalog: ModelInfo[]; onSelect: (value: string) => void; disabled?: boolean }): ReactElement`.
- StageModelRow giữ props stage/model/catalog/onSelect hiện tại; effort vẫn lấy stageEffort.

- [ ] Viết test chọn executionMode/model và Save: PUT settings đúng value, effort của plan là high và các AI stage khác medium; lỗi lưu hiển thị alert, dữ liệu đã chọn vẫn giữ để retry. Chạy test trước sửa để quan sát thiếu semantics/error role phù hợp.
- [ ] Di chuyển controller/row, dùng Card/Select/Button và ModelSelector; dùng placeholder cho value rỗng, không truyền Select.Item value rỗng. Tách tone error/success cho feedback thay vì đưa mọi message vào notice.
- [ ] Chạy `npm run typecheck` và E2E Settings/UI; xác nhận catalog thiếu option hoặc API error không tự chọn model thay thế.

### Task 4: Task detail, Plan, evidence và timeline

**Files:** page TaskDetail, template TaskDetailLayout; toàn bộ organisms task-detail; `src/app/tasks/[id]/page.tsx`; `tests/e2e/plan-feedback.spec.ts`, `tests/e2e/lifecycle.spec.ts`, `tests/e2e/ui.spec.ts`.

**Interfaces:**

- `TaskDetailPage({ id }: { id: string }): ReactElement` giữ polling/controller từ TaskDetail.
- `TaskDetailLayout({ primary, timeline }: { primary: ReactNode; timeline: ReactNode }): ReactElement`, hai cột desktop/một cột mobile.
- TaskPlan/TaskRequests/TaskEvidence/TaskTimeline giữ interface hiện tại và type TaskCommand; TaskEvidence dùng Tabs controlled value để không reset khi polling.

- [ ] Thêm test keyboard: focus Plan tab, ArrowRight chọn Tests, panel tương ứng visible, không có Diff tab. Thêm test feedback đang nhập vẫn giữ sau snapshot polling; busy action không phát mutation thứ hai. Chạy đỏ trước chuyển Tabs.
- [ ] Di chuyển page/template/organisms/types, chuyển toàn bộ button/input/textarea/select/card/status/feedback sang shadcn; giữ command expectedRevision và ID, action availability và disabled logic.
- [ ] Chuyển evidence sang Tabs/TabsContent; giữ Plan version/comments, Context artifact link, review/acceptance output, kết quả test và delivery report. Giữ timeline sequence và pipeline status/text.
- [ ] Chạy typecheck và E2E lifecycle/plan-feedback/UI. Assertions phải chứng minh approve, comment→replan, pause/resume và delivery vẫn hoạt động; test không gọi live Codex.

### Task 5: Hoàn tất migration và kiểm chứng trực quan

**Files:** `src/app/globals.css`, tất cả UI imports, `tests/e2e/ui.spec.ts`, `docs/verification/2026-10-05-shadcn-atomic-ui.md`.

**Interfaces:** Không thêm API/component mới. Dùng các component và fixture đã có.

- [ ] Thêm assertions ở 390px/1280px: `document.documentElement.scrollWidth <= window.innerWidth`; title/branch/context dài vẫn trong viewport, navigation/control thao tác được. Chạy test và sửa overflow tại component sở hữu layout.
- [ ] Xóa file/component/CSS cũ sau khi xác nhận không còn consumer; kiểm tra chiều import, mọi control dùng nền tảng shadcn và không có wrapper chỉ đổi tên.
- [ ] Chạy `npm run typecheck`, `npm run build`, `npm run test:e2e -- tests/e2e/login.spec.ts tests/e2e/lifecycle.spec.ts tests/e2e/plan-feedback.spec.ts tests/e2e/folder-picker.spec.ts tests/e2e/ui.spec.ts`; output exit 0 và mọi required assertion pass mới được đánh dấu hoàn thành.
- [ ] Xem screenshots Login, Tổng quan, Settings, Task detail ở hai viewport và trạng thái loading/error/empty/focus/nội dung dài bằng fixture; sửa lỗi được quan sát rồi chạy lại các check bị ảnh hưởng.
- [ ] Kiểm tra diff/whitespace, đối chiếu local edits ban đầu; ghi report với check pass/fail/blocked/skipped và screenshot paths. Không tự commit/push toàn bộ workspace; giao kết quả cho người dùng review.

## Tự review kế hoạch

Các yêu cầu spec đều có task sở hữu: theme/layout/login ở task 1, Tổng quan ở task 2, Settings ở task 3, detail/evidence/approval ở task 4, responsive/visual QA và loại bỏ CSS cũ ở task 5. Năm Review Focus đều được gắn test vào task tương ứng. Kế hoạch không thay backend hoặc framework version, không có yêu cầu chưa chốt. Chỉ bắt đầu thực thi sau khi người dùng duyệt kế hoạch và chọn phương thức.
