# Một agent cha và các subagent theo stage

Ngày: 2026-10-05. Trạng thái: người dùng đã duyệt bằng yêu cầu “implement đi”; triển khai theo [báo cáo](../../verification/2026-10-05-parent-subagents.md). Bổ sung spec gốc, thay cơ chế session độc lập theo stage.

## Mục tiêu và phạm vi

Theo yêu cầu người dùng, mỗi task có đúng một Codex agent cha giữ bối cảnh điều phối. Các stage AI được giao cho subagent native, mỗi con chỉ làm một nhiệm vụ và không nhận lịch sử của cha. Pipeline cố định, approval, feature tests, repair budget và worktree riêng theo spec `2026-09-23-agent-harness-design.md` tiếp tục có hiệu lực.

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

Worker tạo/resume parent thread, truyền stage envelope và quan sát các child threads. Agent cha giao nhiệm vụ bằng native `spawn_agent` với `fork_turns="none"`, model và effort khai báo rõ, chờ con, nhận kết quả và trả lại worker. Worker kiểm tra kết quả của con trực tiếp trước khi chấp nhận output của cha.

Các stage `discover`, `analyze`, `plan`, `implement`, `review`, `repair` dùng subagent mới cho mỗi attempt. `prepare`, `verify`, `deliver` vẫn do worker/runner thực thi; không cần subagent AI. Mỗi task có parent riêng, không có một parent chung cho tất cả repository/task.

Parent model cố định trong code: `gpt-6-luna`, effort `medium`; không thêm tùy chọn UI. Subagent giữ model theo stage của task và policy hiện tại: plan/replan `high`, các AI stage khác `medium`. Kiểm tra catalog cho cả cha và con; thiếu khả năng/model/effort phải blocked, không thay model hoặc quay lại sessions cũ âm thầm.

## Context và hợp đồng kết quả

Parent nhận stage hiện tại, attempt ID, model/effort, lời giao việc và đường dẫn packet chứa frozen bundle/input/output schema. Worker ghi packet trước khi giao việc; cha không cần đọc bundle hoặc tool log/code. Parent giữ lịch sử điều phối và kết quả có cấu trúc qua nhiều stage.

Con chỉ nhận nhiệm vụ stage, dữ liệu cần thiết do handler hiện tại cung cấp, frozen rules/profile/skills và output schema. Không truyền toàn bộ task object, lịch sử chat, comments ngoài version liên quan hoặc context của stage khác. Plan có thể nhận profile, requirement/answers và feedback version hiện tại; implement nhận plan đã duyệt; repair nhận plan và checks/findings; reviewer nhận requirement/plan, diff và evidence, không nhận lời tự đánh giá của implementer.

`fork_turns="none"` loại bỏ lịch sử, không loại bỏ system/runtime instructions, sandbox hoặc repo instructions cần thiết. Không hứa con chỉ có duy nhất một message trong context.

Giới hạn kiểm chứng của CLI hiện tại: raw events và durable rollout mã hóa `spawn_agent.message`; thread/read không trả task message nguyên văn. Worker kiểm tra task_name, fork_turns, model/effort và metadata native, đối chiếu plaintext khi runtime có cung cấp. Ciphertext không chứng minh nguyên văn message đúng packet hoặc không kèm nội dung bổ sung. Instructions yêu cầu cha chỉ truyền lời giao việc đã cấp; đây là ràng buộc hành vi. Test marker kiểm chứng không fork lịch sử, không phải chứng minh đầy đủ mọi token trong context. Không hứa giảm token vì con vẫn có system/tools/developer context và cha thêm một lượt điều phối.

Con trả JSON đúng schema của stage. Worker đọc output cuối của child thread đã xác minh parent ID, đối chiếu output do cha trả và validate schema. Parent không được tự tạo kết quả stage nếu không có child evidence. Cha trả xong khi con chưa hoàn tất, output lệch nhau, con sai model/effort hoặc stage đều không được coi là thành công.

## Quyền và giới hạn

Trước mỗi lượt cha, worker áp dụng cwd hiện tại và sandbox của stage lên parent thread; subagent kế thừa quyền này. Trước approval dùng committed snapshot read-only; sau prepare dùng worktree đã lưu; implement/repair workspace-write; reviewer và các stage phân tích read-only. Approval policy Manual/Auto giữ nguyên.

Agent cha chỉ điều phối theo instructions, không trực tiếp sửa code/chạy kiểm tra. Đây là giới hạn hành vi, không phải sandbox riêng: trong lượt implement/repair, cha có cùng sandbox workspace-write cần cho con. Không tuyên bố đã cưỡng chế cha tuyệt đối không thể ghi file. Worker từ chối hoàn tất stage khi cha dùng công cụ sửa code thay cho child evidence và chuyển sang reconciliation nếu có side effect ngoài hợp đồng.

Không spawn cháu hoặc child thứ hai trong cùng attempt. Instructions quy định giới hạn, worker theo dõi descendant events/metadata; phát hiện vi phạm phải ngắt các lượt liên quan và không chấp nhận kết quả. Nếu runtime không cung cấp đủ visibility để thực hiện kiểm tra này, blocked trước khi cho chạy stage ghi file.

Agent cha không được thay approval, stage order, repair budget, plan version, test verdict, tạo worktree hay bàn giao PR. Quyết định chuyển stage nằm trong worker; parent điều phối công việc AI trong stage mà worker đã cấp.

## Lifecycle và dữ liệu

Lưu parent thread ID bền vững theo task; mỗi attempt lưu parent turn ID và child thread/turn ID, stage, model/effort thực tế, bundle hash, trạng thái và usage riêng cho cha/con nếu runtime cung cấp. Không trộn usage hai phiên hoặc suy ra chi phí subscription.

Pause/cancel phải ngắt cha và tất cả child/descendant đang chạy, chờ xác nhận dừng. Ngắt cha không được mặc định là con đã dừng. Mất kết nối, timeout hoặc không xác định được writer giữ `runtime_state_unknown` và exclusion hiện có; không tạo parent/child thay thế cho đến khi đối chiếu thực tế.

Resume giữ parent thread của task; sau xác nhận writer/process đã dừng, attempt mới tạo con mới với input cập nhật. Khi cwd/sandbox thay đổi, xác nhận settings trước khi giao nhiệm vụ. Không tái dùng committed snapshot tạm đã bị xóa.

Task cũ chưa có parent nhận parent ở attempt mới sau khi không còn runtime hoạt động. Attempt history, approvals, frozen bundles và output cũ giữ nguyên. Task hoàn tất không migration hồi tố. Không sửa schema Task nếu record runtime riêng đủ lưu mapping.

## Phạm vi thay đổi dự kiến

- `src/codex/client.ts`: runtime config, resume parent, native child event/metadata theo dõi, output verification và interrupt cả cây; tách helper thành file nhỏ nếu cần.
- `src/worker/stages.ts`: task/attempt identity, mapping parent, stage envelope và input tối thiểu; không đổi nghiệp vụ transition.
- `src/worker/engine.ts`, `src/worker/main.ts`: chỉ cập nhật phần runtime exclusion/control hoặc interface wiring thực sự cần.
- `src/context/prompts.ts`: instructions điều phối và instructions nhiệm vụ riêng cho con.
- Test adapters/fixtures: biểu diễn đúng parent và child; không chỉ mock output cha rồi gọi đó là bằng chứng subagent.
- README/spec gốc: cập nhật cơ chế chạy sau khi thiết kế được duyệt và kiểm chứng.

## Điều kiện nghiệm thu

1. Live read-only smoke hai stage trên cùng parent: hai child IDs khác nhau, đúng parent ID, context không có marker của stage trước.
2. Parent resume với cwd/sandbox mới; child read-only không thể sửa fixture, implement child sửa được fixture; reviewer sau đó trở về read-only. Model/effort child đúng cấu hình, không fallback.
3. Integration test: một parent/task; con chỉ nhận input stage; parent fake success, child incomplete/error/invalid JSON, output mismatch, child thứ hai/cháu hoặc sai identity đều bị chặn.
4. Pause/cancel trước spawn, khi con đang chạy và khi cha trả kết quả: không có writer còn sống bị xem là đã dừng; lỗi mất phản hồi giữ unknown state.
5. Pipeline feature tests: approval bắt buộc, replan/version feedback, verify/review gates và ba repair rounds vẫn đúng. Không tạo nhiều worktree hoặc PR trùng do lifecycle mới.
6. Khởi động lại/resume giữ mapping, không spawn trùng khi child chưa dừng; task cũ tiếp tục ở attempt mới sau reconciliation.
7. Typecheck và tests liên quan pass. Live smoke bất kỳ phần bắt buộc chưa chạy phải ghi `skipped/blocked`, không báo chuyển đổi đã hoàn tất.

Nếu native runtime không đáp ứng quyền/lifecycle cần thiết, dừng ở evidence cụ thể và đề xuất thiết kế khác; không gọi các thread độc lập là native subagent hoặc mở rộng quyền để làm test pass.
