# Kiến trúc backend

Backend dùng Clean Architecture, giữ HTTP API, SQLite schema/record keys, serialization, frozen bundles và packet/artifact format. Không migration dữ liệu. Web và worker là hai tiến trình riêng; bootstrap dùng chung factory services nhưng worker nhận repository view trên connection đã lease-fence.

```mermaid
flowchart TD
  P[Presentation: HTTP và worker entrypoint] --> A[Application: use cases và ports]
  A --> D[Domain: types và business policies]
  I[Infrastructure: SQLite, Codex, Git, process, filesystem] --> A
  I --> D
  B[Bootstrap: cấu hình, composition và lifecycle] --> P
  B --> A
  B --> I
```

Mũi tên là dependency của source code. Domain/application không import framework hoặc infrastructure, kể cả type imports. Các module nghiệp vụ trong application giao tiếp qua public `index.ts`; shared port/contracts nằm tại application root để tránh vòng phụ thuộc type. Không có DI framework, generic base service/repository hoặc legacy compatibility facade.

| Lớp            | Vị trí và trách nhiệm                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain         | `src/domain`: task initialization/immutability, transition, approval, model/effort policy, story selection/replan, acceptance và evidence rules. TypeScript thuần; không Zod/Next/Node I/O.                                   |
| Application    | `src/application`: models, tasks, planning, stories, repositories, agent-execution, pipeline, verification, delivery, dashboard, sessions, system và artifacts. Sở hữu ports, transaction boundaries và input/output types.   |
| Infrastructure | `src/infrastructure`: SQLite repositories/lease, Codex RPC/login/native receipts, semantic Git operations, context loader, process/evidence parsers và filesystem adapters. Zod/JSON Schema conversion ở validation adapters. |
| Presentation   | `src/presentation`: HTTP request parsing/response/error/cookie mapping, public dashboard DTO, worker entrypoint. Không đọc database/Git/filesystem.                                                                           |
| Bootstrap      | `src/bootstrap`: nối services và adapters, chọn agent/test fixture, cấu hình data directory, startup/shutdown. Next route files gọi composition root; worker chạy `worker-main.ts`.                                           |

## Model và agent execution

`ModelService` dùng SettingsRepository và ModelCatalogPort. Settings/tạo task kiểm tra catalog; task lưu snapshot model/execution mode độc lập với settings mới. Configure giữ stage-boundary gate và chỉ normalize effort; trước attempt runtime kiểm tra lại parent và role model. Không fallback. Mặc định plan dùng gpt-6-astra/high, role khác gpt-6-luna/medium, parent gpt-6-luna/medium. Prepare conflict dùng repair role; UI verification dùng review role.

Application tách ContextPreparation, packet preparation, StageAgentExecutor, ApprovalBroker và RuntimeRecording. Adapter chịu source snapshot, file hash, bundle snapshot, ghi packet bất biến, Zod codec và RPC. Giữ validation errors và thời điểm giải mã output. Bundle provenance identifier cũ giữ nguyên để không thay frozen artifact contract.

```mermaid
sequenceDiagram
  participant W as Application executor
  participant P as Codex parent session
  participant C as Native child
  W->>W: Ghi packet với stage, attemptId và schema
  W->>P: Assignment + packetPath
  P->>C: Spawn con mới, fork_turns=none
  C-->>P: Terminal output envelope
  P-->>W: Receipt stage + attemptId
  W->>C: Adapter đọc trực tiếp thread con đã xác minh
  W->>W: Đối chiếu identity/schema/settings và lưu evidence
```

Một task giữ một parent; mỗi attempt dùng con mới. Native child khác story child task có pipeline riêng. Receipt có thể đến trước child completion. Cancel phải chờ startup settle, ngắt cây và xác nhận terminal. Mất visibility giữ runtime_state_unknown và chặn writer mới. Repair không giới hạn số vòng; các approval, scope, environment và evidence gates vẫn giữ nguyên.

## Persistence, verification và delivery

ApplicationStore có named typed slices cho task/plan/story/settings/attempt/runtime/event/command/evidence. SQLite adapter giữ getRecord(kind,id), JSON casts và serialization ở phía ngoài. UnitOfWork.atomic đồng bộ; nested savepoint dùng cùng connection. Không RPC/Git bất đồng bộ trong transaction. Repository removal giữ trình tự transaction và synchronous artifact cleanup hiện có.

Typed repository view được tạo từ fencedStore, không từ raw connection. Mọi task/record/event/command/effect write của worker giữ lease fencing. Optimistic revision, command idempotency và recovery exclusions không đổi.

Application sở hữu check orchestration và visual verdict policy. Process runner, TAP/JUnit parser, bounded report reads, screenshot collection/hash và image verification là adapters. Required skipped/failing checks, stale fingerprint và evidence thay đổi tiếp tục chặn delivery.

Delivery/checkpoint orchestration dùng semantic Git, GitHub và artifact ports. Intent/confirmed effects vẫn reconcile commit/push/PR sau crash hoặc mất response; retry không tạo commit/push/PR trùng. Report và checkpoint naming/content giữ nguyên.

## Guardrails và kiểm chứng

`tests/support/dependencies.ts` dùng TypeScript compiler API resolve relative/alias imports, re-export, dynamic import, CommonJS require và import types. `tests/unit/backend-boundaries.test.ts` audit toàn domain/application/infrastructure/presentation/bootstrap, cả vòng phụ thuộc type, không dùng danh sách ngoại lệ. Fixtures trong clean-dependencies test chứng minh checker bắt vi phạm, gồm chặn presentation import trực tiếp Node builtins và các package SQLite/Git/GitHub đã nhận diện; framework/request validation vẫn được phép.

Node 24.18 là runtime bắt buộc. Chạy `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e`. E2E dùng fixture; `scripts/parent-subagents-smoke.ts` dùng Codex thật trong Git repo tạm riêng. Báo cáo cập nhật tại [verification](verification/2026-10-09-clean-architecture.md). Rollback theo commit đã kiểm chứng; không chạy hai phiên bản worker cùng dữ liệu.

## Constants, utils và performance (refactor v2)

Cập nhật được duyệt ngày 2026-10-11: constants dùng class với `static readonly` và constructor private. Đây là ngoại lệ có chủ đích cho quy tắc class dành cho state/lifecycle; hàm policy và service instance không chuyển thành constants.

- Constants nằm trong `constants/` của layer/module sở hữu. Domain giữ stage/task/check/attempt/story state, execution mode, policy defaults và validation limits. Application chia sẻ timing, event/error contracts qua public `constants/index.ts`. Adapter sở hữu RPC methods/permissions, record kinds, HTTP status, PNG header và I/O limits.
- `domain/contracts` giữ export danh sách stage/status tương thích với consumer hiện có; giá trị lấy từ class constants, không có bản sao literal. String constants dùng literal types, danh sách giữ tuple order để Zod/type unions không thay đổi.
- Utils thuần: record keys ở domain; error-message fallback ở application (qua public `utils/index.ts`). Hash, path containment và delay ở infrastructure. Retry helper chỉ chờ và tính delay kế tiếp; từng caller giữ điều kiện retry, deadline, cancellation và loại lỗi.
- Hash tiếp tục nhận đúng text UTF-8; ảnh vẫn hash chuỗi base64. Không chuẩn hóa key hoặc đổi bytes đã lưu.
- Dashboard nhóm attempts theo task trong từng request, giữ insertion order. Không cache giữa requests. Record repository tạo bốn prepared statements trên connection do store sở hữu; transaction, nested savepoint và fencing vẫn đi qua store.

Đo mẫu bằng `node --import tsx scripts/backend-refactor-benchmark.mjs [checkout]`. Script đo projection trong bộ nhớ và SQLite `:memory:`; số đo không đại diện toàn bộ HTTP/Git/Codex latency. Kết quả và giới hạn tại [verification refactor v2](verification/2026-10-11-backend-refactor-v2.md).

## Stories và pipeline control (refactor ngày 2026-10-17)

`StoryService` giữ constructor, public methods và exports hiện có; tiếp tục sở hữu truy vấn/projection và điều phối nghiệp vụ. Logic nội bộ chia theo trách nhiệm:

- `selection.ts`: validation khi replan, selection lock và approval; giữ completed checkpoints, active baseline và thứ tự stories.
- `shared-pr.ts`: evidence, checkpoint completion và kiểm tra HEAD khi bàn giao chung một PR.
- `separate-pr.ts`: tạo child task, kiểm tra dependency ancestry và reconciliation khi bàn giao từng story. Thay cho `orchestration.ts` cũ.
- `state.ts`: contract truy vấn nội bộ `StoryStatePort`, dùng chung giữa các helper; không import ngược service hoặc thêm public export.

Pipeline giữ `processControlCommand()` làm entrypoint: load task, kiểm tra revision/terminal status, dispatch, xử lý `grant` và ghi command outcome/rejection. `task-control.ts` xử lý pause/cancel/configure/resume/start; `plan-control.ts` xử lý approve/comment/revise/answer. Các helper không tự finish command hoặc thêm transaction bao quanh command.

Việc tách module giữ nguyên vị trí transaction/nested savepoint, thứ tự record/event writes, child command IDs, abort timing và error serialization. Git I/O vẫn ở ngoài transaction. Worker loop, lease fencing, recovery và Codex lifecycle không đổi. Không migration hoặc thay đổi HTTP API/artifact format.

`tests/integration/control-commands.test.ts` bổ sung characterization tests cho command outcomes, revisions/events, enqueue trước abort và nested approval rollback trên SQLite thật. Các test này chạy pass trên implementation cũ trước khi tách. Kết quả trước/sau và giới hạn kiểm chứng tại [verification stories/pipeline](verification/2026-10-17-stories-pipeline-refactor.md).
