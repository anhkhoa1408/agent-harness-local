# Agent profiles của Harness

Agent profile là **hướng dẫn vai trò được nạp vào context**, không phải một agent/subagent chạy riêng. Một phiên implement có thể nhận specialist, TDD và E2E profile cùng lúc; worker vẫn chỉ mở một phiên Codex cho stage đó. Reviewer được worker mở trong phiên riêng, chỉ đọc.

## 1. File nào được dùng?

| Vị trí | Vai trò | Nạp vào instructions? |
| --- | --- | --- |
| `profiles/*.md` | Bản rút gọn và điều chỉnh cho contract của Harness | Có, khi registry chọn profile |
| `upstream/ecc/*.md` | Bản gốc từ Everything Claude Code (ECC) | Không; giữ để đối chiếu |
| `upstream/voltagent/*.md` | Bản gốc từ VoltAgent | Không; giữ để đối chiếu |
| [sources.json](sources.json) | URL pin theo Git commit, revision và SHA256 bản gốc | Metadata nguồn, không phải instructions |
| `upstream/*/LICENSE` | Giấy phép MIT của từng nguồn | Không |

Profile runtime và upstream giữ tiếng Anh; bảng bên dưới giải thích bằng tiếng Việt. ID là tên tham chiếu ổn định, không phải tên process. Ví dụ `ecc/planner` tương ứng file [profiles/ecc-planner.md](profiles/ecc-planner.md).

## 2. Vai trò và thời điểm nạp

| Stage/điều kiện | Profile và file | Trách nhiệm |
| --- | --- | --- |
| `discover` | `harness/repo-explorer` — inline trong [registry](../src/context/agents.ts) | Đọc snapshot repo, ghi stack/convention/command và căn cứ; không chạy setup |
| `analyze` | [voltagent/business-analyst](profiles/voltagent-business-analyst.md) | Làm rõ actor, input, quy tắc nghiệp vụ, outcome và quyết định còn thiếu |
| `plan` | [ecc/planner](profiles/ecc-planner.md) | Lập các bước, file, dependency, test command và tiêu chí nghiệm thu theo schema Harness |
| `implement`, Next.js | [voltagent/nextjs-developer](profiles/voltagent-nextjs-developer.md) | Theo Next.js đang cài, router/convention và ranh giới server/client của repo |
| `implement`, frontend React/Vue/Angular | [voltagent/frontend-developer](profiles/voltagent-frontend-developer.md) | Triển khai UI, trạng thái và accessibility liên quan feature |
| `implement`, Python | [voltagent/python-pro](profiles/voltagent-python-pro.md) | Theo phiên bản Python, framework, resource/test convention hiện có |
| `implement`, Spring Boot | [voltagent/spring-boot-engineer](profiles/voltagent-spring-boot-engineer.md) | Theo controller/service/repository, validation, transaction và persistence liên quan |
| `implement`, chưa rõ hoặc nhiều stack | `harness/implementer` — inline trong [registry](../src/context/agents.ts) | Theo ngôn ngữ và convention từng vùng code trong phạm vi plan |
| Mọi `implement`/`repair` | [ecc/tdd-guide](profiles/ecc-tdd-guide.md) | Test failure có ý nghĩa → sửa tối thiểu → pass; test theo phạm vi feature |
| `implement`/`repair`, plan có E2E | [ecc/e2e-runner](profiles/ecc-e2e-runner.md) | Hướng dẫn test hành vi người dùng; command sở hữu server/readiness/cleanup |
| `review` | [ecc/code-reviewer](profiles/ecc-code-reviewer.md) | Review độc lập plan, diff và evidence; chỉ đọc, trả finding có căn cứ |
| `repair` | [voltagent/debugger](profiles/voltagent-debugger.md) | Tái hiện lỗi, tìm root cause và kiểm chứng giả thuyết trước khi sửa |
| `repair` | [ecc/build-error-resolver](profiles/ecc-build-error-resolver.md) | Xử lý lỗi build/typecheck trong phạm vi đã duyệt, không tắt check để né lỗi |

`prepare`, `verify`, `deliver` do worker/runner thực hiện. Prepare chỉ dùng model repair khi conflict, với baseline/rule repo và prompt giới hạn file; verify chỉ dùng model review khi plan chọn ảnh UI, với prompt đọc ảnh rút gọn. Hai lượt này không nạp toàn bộ profile/skill và không có lựa chọn model riêng. Deliver không gọi AI. Stack routing dùng manifest/source của repo nguồn; nhiều stack ứng viên sẽ dùng generic implementer.

## 3. Harness điều chỉnh gì so với upstream?

Các file `profiles/` giữ quy trình liên quan đến vai trò, bỏ metadata model/tool riêng của Claude, lời gọi context-manager không có trong Harness, mục tiêu coverage chung và yêu cầu kiến trúc/bàn giao ngoài phạm vi.

Schema, plan đã duyệt, sandbox và chuyển stage do Harness quyết định. Profile không được tự spawn subagent, đổi model, commit/push, deploy hoặc mở rộng phạm vi. E2E profile được snapshot trước và chỉ kích hoạt nếu plan đã duyệt có E2E.

Routing nằm ở [src/context/agents.ts](../src/context/agents.ts); ghép skill/rule và adaptations nằm ở [src/context/skills.ts](../src/context/skills.ts). Snapshot lưu nội dung adapted, SHA256 của nội dung đó, URL và hash upstream. Task đã có snapshot không tự đổi khi sửa profile.

## 4. Cập nhật profile

1. Chọn revision nguồn và review upstream diff.
2. Cập nhật bản gốc trong `upstream/`, giữ LICENSE, cập nhật URL/revision/SHA256 trong `sources.json`.
3. Điều chỉnh riêng file tương ứng trong `profiles/`; không coi bản upstream mới là instructions runtime mặc định.
4. Chạy kiểm tra routing/context và portability:

```sh
npm test -- tests/integration/agent-profiles.test.ts tests/integration/skills.test.ts tests/integration/portable-skills.test.ts
```

Nếu thay điều kiện kích hoạt hoặc phạm vi stage, kiểm tra thêm [pipeline integration](../tests/integration/pipeline.test.ts) và luồng E2E liên quan. Runtime không tải profile upstream từ mạng khi chạy.
