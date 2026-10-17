# Kiểm chứng refactor stories và pipeline — 17/10/2026

## Phạm vi và baseline

- Baseline source: `65f2c75`; Node `24.18.0`.
- Branch: `codex/refactor-stories-pipeline`.
- Commits: `9da5753` bổ sung characterization tests; `ad0163c` tách stories; `bc50e5c` tách pipeline control commands.
- Chỉ refactor application stories và control commands; giữ public API/exports, schema/record keys, events/errors, artifacts và hành vi nghiệp vụ. Không migration, thay dependency, UI, worker scheduling, lease fencing, recovery hoặc Codex lifecycle.
- Giữ nguyên chỉnh sửa có sẵn trong `AGENTS.md` và `rules/`; không đưa các file này vào commit.
- Triển khai trên branch riêng trong checkout hiện tại, không tạo worktree mới. Không push hoặc merge.

## Tests trước và sau refactor

| Kiểm tra                                                                | Trước refactor                                                | Sau refactor                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| `npm test`                                                              | 229 pass, 4 Docker skip                                       | 252 pass, 4 Docker skip                    |
| Characterization control commands                                       | 23 pass trên code gốc                                         | 23 pass                                    |
| Focused stories + boundaries + control commands                         | Baseline phạm vi ban đầu: 40 pass trên 6 files                | 55 pass trên 5 files sau khi tách stories  |
| Focused control commands + worker + feedback + coordinator + boundaries | Các tests hiện có và characterization đều pass trước khi tách | 42 pass trên 5 files sau khi tách commands |
| `npm run typecheck`                                                     | Pass sau khi thêm characterization tests                      | Pass                                       |
| `npm run lint`                                                          | Không chạy toàn bộ ở baseline                                 | Pass                                       |
| `npm run build`                                                         | Không chạy ở baseline                                         | Pass ngoài sandbox với cache sạch          |
| E2E lifecycle/stories/plan feedback                                     | 16 pass, 2 fail                                               | 16 pass, cùng 2 baseline failures          |

Các nhóm focused tests khác nhau về số files; không dùng số lượng của chúng để suy ra tăng coverage. So sánh toàn suite Vitest cho thấy thêm đúng 23 characterization tests, không bỏ tests hiện có.

Characterization tests dùng SQLite `:memory:` và các services/repositories thật. Các tình huống gồm revision conflict/terminal task, active/inactive pause/cancel, child resume và command idempotency, runtime reconciliation gate, story approval, plan feedback/revision, answer normalization, configure effort policy và approval grant. SQLite trigger gây lỗi tại task update kiểm chứng rollback cả story writes trong nested transaction. Abort listener kiểm tra child command đã enqueue trong khi command cha vẫn running và task chưa đổi trạng thái.

Các integration tests hiện có kiểm chứng shared checkpoints, stale evidence, external HEAD, dependency ancestry, child idempotency, replan giữ baseline/checkpoints/repair count và worker recovery. Không thêm tests đại trà cho các module ngoài phạm vi.

## E2E và môi trường

Chạy cùng lệnh trước/sau:

```sh
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/stories-pipeline-browsers npx playwright test tests/e2e/lifecycle.spec.ts tests/e2e/stories.spec.ts tests/e2e/plan-feedback.spec.ts
```

Lần chạy trong sandbox bị chặn listen cổng `127.0.0.1:3100` (`EPERM`). Lần chạy ngoài sandbox ban đầu thiếu Chromium; đã tải browser vào thư mục tạm riêng rồi chạy lại. Baseline 16 pass/2 fail được lấy trước khi thay đổi production code.

Production build trong sandbox cũng bị chặn bind cổng khi Turbopack xử lý PostCSS. Lần retry ngoài sandbox vẫn báo lỗi cũ; sau khi chuyển riêng `.next/cache/turbopack` sang thư mục scratch, `npm run build` ngoài sandbox pass với cache sạch. Không đổi cấu hình build hoặc source để xử lý lỗi môi trường này. Build còn warning về `package-lock.json` ngoài repository tại `/Users/anhkhoa`; không ảnh hưởng exit code.

Hai failures giống nhau trước/sau về tên test và lỗi locator:

1. `lifecycle.spec.ts`: `settings hide catalog hint and effort badges, preserving models on save`.
2. `plan-feedback.spec.ts`: `default execution mode is saved in Settings and inherited by new tasks`.

Cả hai gặp `strict mode violation`: `getByRole('status')` khớp cả thông báo quyền notification bị chặn và thông báo lưu Settings. Không sửa các failure UI có sẵn trong đợt refactor này. E2E sử dụng fixture agent; không đại diện cho native Codex runtime.

## Review, giới hạn và rollback

- Review độc lập toàn bộ code/test commits `65f2c75..bc50e5c`: không có finding Critical/Important/Minor; không có mục bỏ qua đánh giá. Reviewer xác nhận virtual dispatch, transaction boundaries và side-effect ordering; không chạy lại tests trong lượt review.
- Đối chiếu TypeScript AST leaf tokens: 16 function/command bodies được chuyển khớp baseline sau khi thay dependency aliases và bỏ khác biệt formatting/dấu phẩy. Đây là kiểm tra bổ sung, không thay thế tests.
- Docker compose/sandbox/SSH: 4 tests skip như baseline, không xác nhận runtime Docker.
- Native Codex smoke: không chạy vì không thay đổi Codex lifecycle/protocol.
- Các E2E ngoài lifecycle/stories/plan feedback: không chạy.
- Prettier trên toàn bộ files thay đổi và `git diff --check` (working tree và code commits): pass. Thay đổi tự sinh trong `next-env.d.ts` do build đã được hoàn nguyên.
- Rollback theo các commit riêng của stories và control commands, đảo thứ tự triển khai; không cần migration dữ liệu.
