# Một agent cha và các subagent theo stage

Ngày: 2026-10-05. Trạng thái: người dùng đã duyệt bằng yêu cầu “implement đi”; triển khai theo [báo cáo](../../verification/2026-10-05-parent-subagents.md). Bổ sung spec gốc, thay cơ chế session độc lập theo stage.

Cập nhật đã duyệt ngày 2026-10-06: worker dùng JSON trực tiếp từ subagent đã xác minh; cha chỉ trả receipt `stage`/`attemptId`. Yêu cầu cha chép lại toàn bộ output được bỏ vì lần chạy thật cho thấy cha đổi ký tự trong Plan, gây `subagent_output_mismatch`.

## Mục tiêu và phạm vi

Mỗi task có đúng một Codex agent cha giữ bối cảnh điều phối. Cha giao các stage AI cho subagent native; mỗi con chỉ làm một nhiệm vụ và không nhận lịch sử của cha. Pipeline cố định, approval, feature tests, repair budget và worktree riêng theo spec `2026-09-23-agent-harness-design.md` tiếp tục có hiệu lực.

Thay đổi này thay thế cơ chế tạo session độc lập trực tiếp cho từng stage. Không thêm chạy song song, UI cấu hình đội agent, runtime/provider mới hoặc model fallback.

## Khả năng đã kiểm tra

- CLI trên máy: `0.159.0-alpha.12.1`; `multi_agent=true`, `multi_agent_v2=false` trong cấu hình hiệu lực mặc định.
- Probe riêng qua app-server với override theo thread `features.multi_agent=true`, `features.multi_agent_v2=true`: một agent cha `gpt-6-luna/medium` spawn một con cùng model/effort, chờ và nhận báo cáo thành công.
- Interface spawn báo các tham số `task_name`, `message`, `fork_turns`, `model`, `reasoning_effort`. Kiểm tra sâu khi triển khai xác nhận con vẫn kế thừa developer instructions; đã tách instructions theo vai trò root/subagent. Probe marker ban đầu không đủ để kết luận developer instructions bị loại bỏ.
- Quan sát thực tế `subAgentActivity` chứa child thread ID và agent path; có `agentMessage` của con, parent turn hoàn tất `completed`.
- Protocol được sinh trực tiếp từ CLI có `Thread.parentThreadId`, child thread metadata, model/effort trong collaboration events và phương thức interrupt/read/list thread.
- Live smoke tiếp theo xác nhận cùng parent qua analyze/plan/implement/review, đổi cwd/sandbox, child Astra/high và Luna/medium, khởi động lại app-server giữa plan/implement, và cancel cả cây. Chi tiết IDs và trạng thái kiểm chứng trong báo cáo liên kết trên.

Nguồn chính thức: [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [App server](https://learn.chatgpt.com/docs/app-server). Tài liệu có thể khác phiên bản alpha đã cài; schema và live smoke của bản thực chạy là căn cứ triển khai.

## Kiến trúc

Worker → agent cha của task → đúng một subagent của stage attempt hiện tại.

Worker tạo hoặc resume parent thread, truyền stage envelope và theo dõi child threads. Agent cha giao nhiệm vụ bằng native `spawn_agent` với `fork_turns="none"` và model/effort được khai báo rõ. Cha chờ con, nhận kết quả rồi phản hồi worker. Worker kiểm tra trực tiếp kết quả của con trước khi chấp nhận output của cha.

Các stage `discover`, `analyze`, `plan`, `implement`, `review`, `repair` dùng subagent mới cho mỗi attempt. `prepare`, `verify`, `deliver` vẫn do worker/runner thực thi, không cần subagent AI. Mỗi task có parent riêng; các repository và task không dùng chung một parent.

Model của parent được cố định trong code là `gpt-6-luna`, effort `medium`, không có tùy chọn trên UI. Subagent dùng model theo stage của task và policy hiện tại: plan/replan `high`, các AI stage khác `medium`. Worker kiểm tra catalog cho cả cha và con. Nếu thiếu khả năng runtime, model hoặc effort cần thiết, task chuyển sang blocked; không tự thay model hoặc quay lại cơ chế session cũ.

## Context và hợp đồng kết quả

Parent nhận stage hiện tại, attempt ID, model/effort, lời giao việc và đường dẫn packet chứa frozen bundle/input/output schema. Worker ghi packet trước khi giao việc. Cha không cần đọc bundle, tool log hoặc code; cha giữ lịch sử điều phối và kết quả có cấu trúc qua nhiều stage.

Con chỉ nhận nhiệm vụ stage, dữ liệu cần thiết từ handler hiện tại, frozen rules/profile/skills và output schema. Không truyền toàn bộ task object, lịch sử chat, comments ngoài version liên quan hoặc context của stage khác. Plan có thể nhận profile, requirement/answers và feedback của version hiện tại. Implement nhận plan đã duyệt; repair nhận plan cùng checks/findings. Reviewer nhận requirement/plan, diff và evidence, không nhận lời tự đánh giá của implementer.

`fork_turns="none"` loại bỏ lịch sử của cha. Con vẫn nhận system/runtime instructions, sandbox và repo instructions cần thiết, nên context có thể chứa nhiều hơn một message.

CLI hiện tại có giới hạn kiểm chứng: raw events và durable rollout mã hóa `spawn_agent.message`; thread/read không trả task message nguyên văn. Worker kiểm tra task_name, fork_turns, model/effort và metadata native, rồi đối chiếu plaintext nếu runtime cung cấp. Ciphertext chưa đủ để chứng minh message khớp nguyên văn packet hoặc không chứa nội dung bổ sung. Instructions yêu cầu cha chỉ truyền lời giao việc đã cấp, nhưng yêu cầu này là ràng buộc hành vi. Test marker chỉ kiểm chứng việc không fork lịch sử, chưa kiểm chứng đầy đủ mọi token trong context. Cơ chế này không cam kết giảm token: con vẫn có system/tools/developer context và cha cần thêm một lượt điều phối.

Con trả JSON envelope đúng schema của stage. Worker xác minh parent ID của child thread, đọc output cuối và validate schema. Cha chỉ trả receipt gồm `stage` và `attemptId`; worker đối chiếu receipt với assignment và envelope của con, lấy `result` trực tiếp từ con. Parent không được tự tạo kết quả stage khi thiếu child evidence. Stage không thành công nếu child chưa hoàn tất, receipt sai stage/attemptId, JSON của con không hợp lệ hoặc con dùng sai model/effort hay stage. Nếu receipt đến sớm, worker vẫn chờ child hoàn tất.

## Quyền và giới hạn

Trước mỗi lượt của cha, worker áp dụng cwd hiện tại và sandbox của stage lên parent thread; subagent kế thừa quyền này. Trước approval, agent dùng committed snapshot với quyền read-only. Sau prepare, agent dùng worktree đã lưu. Implement/repair có quyền workspace-write; reviewer và các stage phân tích có quyền read-only. Approval policy Manual/Auto giữ nguyên.

Instructions giới hạn agent cha ở việc điều phối, không trực tiếp sửa code hoặc chạy kiểm tra. Cha không có sandbox riêng: trong lượt implement/repair, cha có cùng sandbox workspace-write cần cho con và vẫn có khả năng ghi file. Worker từ chối hoàn tất stage nếu cha dùng công cụ sửa code thay cho child evidence. Nếu có side effect ngoài hợp đồng, worker chuyển sang reconciliation.

Mỗi attempt không được spawn cháu hoặc child thứ hai. Instructions quy định giới hạn; worker theo dõi descendant events/metadata. Khi phát hiện vi phạm, worker ngắt các lượt liên quan và từ chối kết quả. Nếu runtime không cung cấp đủ thông tin để kiểm tra, task chuyển sang blocked trước khi chạy stage có quyền ghi file.

Agent cha không được thay approval, stage order, repair budget, plan version, test verdict, tạo worktree hay bàn giao PR. Quyết định chuyển stage nằm trong worker; parent điều phối công việc AI trong stage mà worker đã cấp.

## Lifecycle và dữ liệu

Harness lưu parent thread ID bền vững theo task. Mỗi attempt lưu parent turn ID, child thread/turn ID, stage, model/effort thực tế, bundle hash và trạng thái. Usage của cha và con được lưu riêng nếu runtime cung cấp; không trộn usage hai phiên hoặc suy ra chi phí subscription.

Pause/cancel phải ngắt cha cùng tất cả child/descendant đang chạy và chờ xác nhận dừng. Việc ngắt cha chưa xác nhận con đã dừng. Nếu mất kết nối, timeout hoặc không xác định được writer, Harness giữ `runtime_state_unknown` và exclusion hiện có. Chỉ được tạo parent/child thay thế sau khi đối chiếu trạng thái thực tế.

Resume giữ parent thread của task. Sau khi xác nhận writer/process đã dừng, attempt mới tạo con mới với input cập nhật. Nếu cwd hoặc sandbox thay đổi, worker xác nhận settings trước khi giao nhiệm vụ. Committed snapshot tạm đã bị xóa không được dùng lại.

Task cũ chưa có parent được cấp parent ở attempt mới, sau khi xác nhận không còn runtime hoạt động. Attempt history, approvals, frozen bundles và output cũ giữ nguyên. Task đã hoàn tất không bị migration hồi tố. Nếu record runtime riêng đủ lưu mapping, giữ nguyên schema Task.

## Phạm vi thay đổi dự kiến

- `src/codex/client.ts`: runtime config, resume parent, native child event/metadata theo dõi, output verification và interrupt cả cây; tách helper thành file nhỏ nếu cần.
- `src/worker/stages.ts`: task/attempt identity, mapping parent, stage envelope và input tối thiểu; không đổi nghiệp vụ transition.
- `src/worker/engine.ts`, `src/worker/main.ts`: chỉ cập nhật phần runtime exclusion/control hoặc interface wiring thực sự cần.
- `src/context/prompts.ts`: instructions điều phối và instructions nhiệm vụ riêng cho con.
- Test adapters/fixtures: biểu diễn cả parent và child; mock output của cha riêng lẻ chưa đủ làm bằng chứng subagent.
- README/spec gốc: cập nhật cơ chế chạy sau khi thiết kế được duyệt và kiểm chứng.

## Điều kiện nghiệm thu

1. Live read-only smoke hai stage trên cùng parent: hai child IDs khác nhau, đúng parent ID, context không có marker của stage trước.
2. Parent resume với cwd/sandbox mới; child read-only không thể sửa fixture, implement child sửa được fixture; reviewer sau đó trở về read-only. Model/effort child đúng cấu hình, không fallback.
3. Integration test: một parent/task; con chỉ nhận input stage; parent fake success, child incomplete/error/invalid JSON, receipt sai stage/attemptId, child thứ hai/cháu hoặc sai identity đều bị chặn. Result lấy trực tiếp từ con, không phụ thuộc vào cha chép lại nội dung.
4. Pause/cancel trước spawn, khi con đang chạy và khi cha trả kết quả: không có writer còn sống bị xem là đã dừng; lỗi mất phản hồi giữ unknown state.
5. Pipeline feature tests: approval bắt buộc, replan/version feedback, verify/review gates và ba repair rounds vẫn đúng. Không tạo nhiều worktree hoặc PR trùng do lifecycle mới.
6. Khởi động lại/resume giữ mapping, không spawn trùng khi child chưa dừng; task cũ tiếp tục ở attempt mới sau reconciliation.
7. Typecheck và tests liên quan pass. Live smoke bất kỳ phần bắt buộc chưa chạy phải ghi `skipped/blocked`, không báo chuyển đổi đã hoàn tất.

Nếu native runtime không đáp ứng yêu cầu về quyền hoặc lifecycle, dừng và ghi rõ bằng chứng trước khi đề xuất thiết kế khác. Thread độc lập không được coi là native subagent; không mở rộng quyền chỉ để làm test pass.
