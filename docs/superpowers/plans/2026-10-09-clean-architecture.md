# Triển khai Clean Architecture

Spec: ../specs/2026-10-09-clean-architecture-design.md. Baseline 2bded2d.

1. Tách domain types/policy khỏi Zod và I/O; compiler dependency checker với fixture import/re-export/dynamic/type/alias/cycle. Expected: pure-domain tests và typecheck pass.
2. Chuyển model/settings/task snapshot sang use cases; catalog port riêng. Expected: model/execution-mode/HTTP tests pass, no runtime fallback.
3. Typed repositories/UnitOfWork; task/plan/story/repository use cases dùng ports. Expected: store/story/feedback/repository tests pass, synchronous/nested transaction và lease fencing giữ nguyên.
4. Tách context/packet/execution/evidence; Codex implements execution/catalog ports. Expected: schema/skills/subagents/approval tests pass.
5. Chuyển pipeline, command handling, recovery, verification/delivery orchestration vào application; Node/Git/runner/fs/clock/lease adapters. Expected: worker/recovery/prepare/verify/delivery tests pass.
6. Presentation routes chỉ dùng use cases; bootstrap nối dependency; UI dùng public DTO; xóa legacy paths. Expected: architecture/typecheck/lint/backend suite/build/E2E pass, native smoke có evidence hoặc limitation rõ.

Mỗi bước ghi vào ledger cùng test kết quả, commit khi đã kiểm chứng. Cuối đợt review toàn diff và kiểm tra từng acceptance criterion. Không merge/push tự động.
