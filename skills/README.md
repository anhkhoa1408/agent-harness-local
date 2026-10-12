# Skills và reference của Harness

Worker đọc các skill **đóng gói trong repo này**, không cần plugin cache, installer hoặc cấu hình Skill roots trên máy. [Registry](../src/infrastructure/context/skills.ts) chọn chính xác file được ghép vào context của từng stage.

Skill là hướng dẫn thực hiện công việc; worker giữ quyền chuyển stage, duyệt plan, chọn model, kiểm chứng test và bàn giao. Skill có lời yêu cầu spawn reviewer/subagent cũng không tạo thêm agent: adaptations của Harness giao điều phối cho worker.

## 1. Skill/reference nào được nạp ở mỗi stage?

Mỗi đường dẫn trong bảng là tương đối với thư mục `skills/` này. `SKILL.md` là hướng dẫn chính; các file `.md` còn lại là reference phụ được registry nạp cùng nó.

Mọi stage AI (`discover`, `analyze`, `plan`, `implement`, `review`, `repair`) nạp thêm một [hướng dẫn context-mode rút gọn](context-mode/context-mode/SKILL.md). Hướng dẫn này bao gồm routing cho xử lý output, index, search và stats; ba skill tiện ích không được ghép sẵn vào bundle.

| Stage                          | File thực sự nạp                                                                                                                                                     | Mục đích                                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analyze`                      | [grilling/SKILL.md](mattpocock-skills/grilling/SKILL.md)                                                                                                             | Làm rõ quyết định ảnh hưởng triển khai; không hỏi lại điều có thể đọc từ repo                                                                                       |
| `plan`                         | [writing-plans/SKILL.md](superpowers/writing-plans/SKILL.md)                                                                                                         | Kế hoạch cụ thể theo bước, file và kiểm chứng; dùng schema Harness                                                                                                  |
| `implement`                    | [test-driven-development/SKILL.md](superpowers/test-driven-development/SKILL.md), [writing-good-tests.md](superpowers/test-driven-development/writing-good-tests.md) | Red → green cho feature/bug; test hành vi có ý nghĩa                                                                                                                |
| `review`                       | [requesting-code-review/SKILL.md](superpowers/requesting-code-review/SKILL.md), [code-reviewer.md](superpowers/requesting-code-review/code-reviewer.md)              | Hướng dẫn review plan/diff/evidence trong phiên reviewer độc lập                                                                                                    |
| `repair`                       | [receiving-code-review/SKILL.md](superpowers/receiving-code-review/SKILL.md)                                                                                         | Kiểm chứng finding và xử lý bằng căn cứ                                                                                                                             |
| `repair`                       | [systematic-debugging/SKILL.md](superpowers/systematic-debugging/SKILL.md), [root-cause-tracing.md](superpowers/systematic-debugging/root-cause-tracing.md)          | Tái hiện, thu bằng chứng và truy nguyên lỗi trước khi vá                                                                                                            |
| `repair`                       | [test-driven-development/SKILL.md](superpowers/test-driven-development/SKILL.md), [writing-good-tests.md](superpowers/test-driven-development/writing-good-tests.md) | Test hồi quy và sửa tối thiểu                                                                                                                                       |
| `repair`                       | [verification-before-completion/SKILL.md](superpowers/verification-before-completion/SKILL.md)                                                                       | Báo cáo theo command/evidence đã chạy, tránh tuyên bố thành công thiếu căn cứ                                                                                       |
| `discover`                     | [context-mode/SKILL.md](context-mode/context-mode/SKILL.md)                                                                                                            | Dùng contract discovery, profile inline và hướng dẫn xử lý context của Harness                                                                                       |
| `prepare`, `verify`, `deliver` | Không nạp skill riêng                                                                                                                                                | Worker/runner giữ gate; prepare conflict dùng model repair và prompt giới hạn file, verify ảnh UI dùng model review và prompt đọc ảnh rút gọn; deliver không gọi AI |

Các file còn lại trong thư mục skill được giữ cùng distribution gốc để đọc khi cần và đối chiếu nguồn. **Có file trong repo không có nghĩa file đó tự được registry nạp.** Link từ một `SKILL.md` tới reference phụ cũng không đồng nghĩa worker tự ghép reference đó vào bundle; agent có thể đọc thêm nếu công cụ/quyền cho phép.

Ví dụ `defense-in-depth.md`, `condition-based-waiting.md`, `test-pressure-*.md`, `test-academic.md` và `CREATION-LOG.md` trong `systematic-debugging/` không nằm trong registry nạp tự động. Không coi chúng là stage hay cơ chế kiểm thử của Harness.

### Context-mode

- [context-mode](context-mode/context-mode/SKILL.md): bản tích hợp rút gọn cho stage AI; giữ nguyên quyền, test plan, output schema và snapshot của Harness.
- [ctx-index](context-mode/ctx-index/SKILL.md): index file/thư mục cần tra cứu nhiều lần bằng đường dẫn, tránh đưa nội dung thô vào context.
- [ctx-search](context-mode/ctx-search/SKILL.md): tìm trong dữ liệu đã index, gộp câu hỏi và giới hạn theo nguồn.
- [ctx-stats](context-mode/ctx-stats/SKILL.md): đọc thống kê khi được yêu cầu; không tự chạy mỗi stage.

Đóng gói skill không đồng nghĩa cài MCP server. Tool context-mode cần được cấp bởi runtime chạy worker; có plugin trong phiên Codex phát triển chưa chứng minh agent của Harness có các tool đó. Khi thiếu tool, agent dùng công cụ đọc/lệnh được phép với phạm vi và output giới hạn, ghi `context_mode_unavailable` trong summary. Không tự cài plugin hoặc đổi cấu hình hệ thống.

Các tiện ích là tài liệu cho người vận hành; trong attempt, agent dùng hướng dẫn rút gọn đã đóng băng. Stats của context-mode phản ánh output qua công cụ này, không phải toàn bộ token hay chi phí của Harness. Chưa kiểm chứng mức tiết kiệm thực tế trong runtime Harness.

## 2. Nguồn và ngôn ngữ

| Bộ skill           | Phiên bản distribution đóng gói | Skill được dùng                                                                                            |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Superpowers        | `6.4.2`                         | writing-plans, TDD, requesting/receiving-code-review, systematic-debugging, verification-before-completion |
| Matt Pocock skills | `1.2.3`                         | grilling                                                                                                   |
| Context-mode       | `1.0.169`                       | context-mode rút gọn cho Harness; ctx-index, ctx-search, ctx-stats giữ nguyên nguồn                            |

Superpowers và Matt Pocock dùng distribution `openai-curated-remote`; Context-mode dùng distribution plugin `context-mode`. Đây không phải tuyên bố Git commit upstream. [sources.json](sources.json) ghi repo nguồn, phiên bản distribution và SHA256 từng file. Superpowers/Matt Pocock giữ MIT LICENSE; Context-mode giữ [Elastic License 2.0](context-mode/LICENSE) và ghi rõ file đã rút gọn. Agent profiles ECC/VoltAgent có [manifest riêng](../agents/sources.json).

README hướng dẫn dùng tiếng Việt. Các file gốc skill/reference giữ tiếng Anh để bảo toàn nội dung và hash nguồn. Bản context-mode rút gọn có thông báo sửa đổi và hash riêng trong manifest; ba tiện ích giữ nguyên nguồn. Adaptations yêu cầu agent trả lời bằng tiếng Việt, giữ thuật ngữ tech.

## 3. Snapshot và cập nhật

Worker đóng băng context theo task, gồm nội dung file, đường dẫn nguồn và SHA256. Task đã có snapshot giữ nguyên nội dung; cập nhật bundle phục vụ snapshot mới. Không cần tải skill từ upstream khi chạy.

Khi cập nhật:

1. Chọn một distribution cụ thể; thay trọn thư mục skill và reference phụ thuộc, giữ LICENSE.
2. Cập nhật version/SHA256 trong `sources.json` và review diff nguồn.
3. Nếu muốn đổi cách Harness dùng skill, sửa registry/adaptations; không sửa bản gốc upstream.
4. Chạy kiểm tra context/portability; nếu đổi routing hoặc quy trình, chạy thêm pipeline integration và E2E liên quan.

```sh
npm test -- tests/integration/context-mode.test.ts tests/integration/skills.test.ts tests/integration/portable-skills.test.ts tests/integration/agent-profiles.test.ts
```

Xem [README chính](../README.md) để tra sơ đồ luồng, mapping model/agent và vị trí code quyết định gate.
