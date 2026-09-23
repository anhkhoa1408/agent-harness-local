# Agent Harness MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dashboard local nhận task trên repo Git, duyệt plan, code/test/review/sửa bằng Codex và bàn giao PR hoặc branch local, có thể phục hồi khi gián đoạn.

**Architecture:** Một ứng dụng Next.js và một worker Node.js độc lập dùng chung SQLite. Worker sở hữu pipeline, Git/process effects và kết nối Codex app-server qua stdio; web chỉ ghi command và đọc snapshot/events. Model mạnh lập plan, model tầm trung implement theo plan đã duyệt.

**Tech Stack:** Node.js 24, TypeScript, Next.js App Router, React, SQLite qua `node:sqlite`, Zod, Vitest, Playwright; Git và GitHub CLI là process adapters. Dùng npm và commit `package-lock.json`; không thêm Redis, queue server hoặc ORM trong MVP.

**Spec:** [Agent Harness design](../specs/2026-09-23-agent-harness-design.md). Đọc cả [AGENTS.md](../../../AGENTS.md).

## Global Constraints

- Dashboard dùng Next.js, chạy local; một task thực thi tại một thời điểm.
- Nhận repo Git thuộc bất kỳ ngôn ngữ/framework nào. Không giới hạn repo đích ở Next.js.
- Người dùng duyệt requirement, plan, tiêu chí nghiệm thu và phạm vi test trước khi code.
- Mỗi feature/task có branch và worktree riêng; reviewer có phiên Codex riêng.
- Người dùng chọn model và reasoning effort theo stage. Mặc định plan dùng model mạnh, implement dùng model tầm trung; worker chuyển theo cấu hình đã chọn, không tự đổi ngoài cấu hình đó.
- Viết test cho tính năng mới và bug đang sửa; có thể bỏ qua test cũ ngoài phạm vi feature.
- Tối đa ba vòng sửa tự động sau lần triển khai đầu; hết giới hạn thì cần người dùng quyết định.
- Không tự merge, deploy hoặc xóa worktree trong MVP.
- Trả lời bằng tiếng Việt, giữ nguyên thuật ngữ tech khi cần.

Plan này bao phủ toàn MVP theo mười lát cắt có dependency, không phải mười agent độc lập. Triển khai tuần tự; tránh tạo framework/plugin marketplace trước khi một task chạy xuyên suốt.

## Review Focus

1. **Chạy lại sau crash:** process cũ còn sống hoặc PR đã tạo nhưng response mất; không được chạy hai writer/tạo hai PR. Kiểm chứng Task 6, 9.
2. **Plan và code bị thay sau approval/test:** phải mất hiệu lực approval/evidence tương ứng. Kiểm chứng Task 5, 7, 8.
3. **Repo có đường dẫn có dấu cách, symlink hoặc branch bẩn:** không chạy shell interpolation, không mang thay đổi chưa commit của người dùng sang task. Kiểm chứng Task 4, 7.
4. **Subscription/model/skill không khả dụng:** task chờ người dùng; không fallback model hoặc sang API tính phí. Kiểm chứng Task 2, 3, 10.
5. **Test bị skip/không tìm thấy, legacy suite fail:** không coi required feature tests bị skip là pass; lỗi legacy ngoài phạm vi không tự chặn. Kiểm chứng Task 7, 8, 10.

## Môi trường đã kiểm tra

- Workspace hiện chỉ có spec và AGENTS.md, chưa có product code/package.json.
- Node `v24.18.0`, npm `11.16.0`; `node:sqlite` tạo database in-memory và truy vấn được.
- Codex CLI `0.155.0-alpha.16` có `app-server generate-json-schema`. Đã đọc schema local cho initialize, model/list, thread/start, turn/start và permission responses.
- `git` và `gh` có trong PATH. Chưa xác minh đăng nhập GitHub/Codex hoặc chạy model có tính usage.
- Dùng schema do binary thực tế sinh ra để viết protocol adapter; không suy ra model được dùng từ tên gói subscription.
- Mục tiêu vận hành đầu tiên là macOS local hiện tại. Command abstraction không giới hạn ngôn ngữ repo; không tuyên bố đã kiểm chứng mọi OS hoặc toolchain.

## Cấu trúc file và ownership

```text
src/app/                         Next.js pages và route handlers
src/components/                  Form, timeline, diff, test/review views
src/core/contracts.ts            DTO và Zod schemas của ứng dụng
src/core/transitions.ts          Transition thuần, không I/O
src/core/model-policy.ts         Resolve model theo stage/task snapshot
src/core/acceptance.ts           Gate từ plan/test/review evidence
src/storage/database.ts          SQLite connection, migrations, transaction
src/storage/store.ts             Typed CRUD, events và commands
src/storage/lease.ts             Global worker/task ownership
src/codex/rpc.ts                 JSON-lines transport, correlation và lifecycle
src/codex/client.ts              App-server methods, events, approvals
src/context/skills.ts            Resolve và snapshot skill bundle
src/context/rules.ts             Rule theo phạm vi, không ghi repo đích
src/context/prompts.ts           Context mỗi stage và output schemas
src/repositories/inspect.ts      Git metadata và discovery evidence
src/repositories/worktree.ts     Idempotent branch/worktree preparation
src/repositories/fingerprint.ts  Hash source/config của task
src/execution/process.ts         Cwd/argv/env/timeouts/process groups
src/execution/checks.ts          Test report và required checks
src/worker/main.ts               Worker lifecycle
src/worker/engine.ts             Stage dispatch + persistence
src/worker/stages.ts             AI stage handlers
src/worker/recovery.ts           Reconcile sau pause/crash/quota
src/delivery/github.ts           Query/push/create PR theo effect key
src/delivery/report.ts           Báo cáo nghiệm thu local/PR
src/server/local-session.ts      Loopback session và mutation validation
src/server/services.ts           Service facade cho route handlers
scripts/dev.mjs                  Khởi động web và worker cho development
scripts/codex-smoke.ts            Kiểm chứng read-only có chủ đích
tests/support/                   Temp repo, fake RPC và fake runner
tests/unit/                      Pure policy tests
tests/integration/               SQLite/Git/process/RPC tests
tests/e2e/                       Playwright task lifecycle
```

Không tạo hết file trống trước. Tạo file trong task sở hữu nó. Test helpers dùng ID cố định, fake clock và repo tạm; không dùng repo người dùng làm fixture.

## Task 1: Lưu task, events và điều khiển bằng SQLite

**Files:** Create `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.nvmrc`, `src/core/contracts.ts`, `src/storage/database.ts`, `src/storage/store.ts`, `tests/integration/store.test.ts`.

**Consumes:** Node.js 24 và filesystem local.

**Produces:**

```ts
type Stage = 'discover'|'analyze'|'plan'|'prepare'|'implement'|'verify'|'review'|'repair'|'deliver';
type Status = 'queued'|'running'|'waiting_input'|'waiting_approval'|'blocked'|'paused'|'interrupted'|'completed'|'cancelled'|'failed';
type ModelChoice = { model: string; effort: string };
type ModelMap = Record<'discover'|'analyze'|'plan'|'implement'|'review'|'repair', ModelChoice>;
type Task = {
  id: string; repositoryId: string; title: string; requirement: string;
  stage: Stage; status: Status; reason: string|null; revision: number;
  planVersion: number|null; approvedPlanVersion: number|null;
  repairCount: number; models: ModelMap; worktree: string|null;
  sourceCommit: string; branch: string; targetBranch: string;
  deliveryMode: 'github'|'local'; resumeStage: Stage|null;
};
type Event = { seq: number; taskId: string; type: string; data: unknown; at: number };
type ControlCommand = { id: string; taskId: string; kind: 'start'|'answer'|'approve'|'pause'|'resume'|'cancel'|'configure'|'grant'; expectedRevision: number; payload: unknown };
type NewTask = Pick<Task,'repositoryId'|'title'|'requirement'|'models'|'sourceCommit'|'targetBranch'|'deliveryMode'>;
interface Store {
  createTask(input: NewTask): Task;
  getTask(id: string): Task;
  listTasks(): Task[];
  updateTask(id: string, expectedRevision: number, patch: Partial<Task>, event: {type:string;data:unknown}): Task;
  events(taskId: string, after: number): Event[];
  enqueue(command: ControlCommand): boolean;
  nextCommand(): ControlCommand|null;
  finishCommand(id: string, outcome: unknown): void;
  putRecord(kind: string, id: string, value: unknown): void;
  getRecord(kind: string, id: string): unknown;
  listRecords(kind: string): unknown[];
  close(): void;
}
function openStore(filename: string): Store;
```

DTO schema phải validate enum, IDs, limit và payload theo command; không nhận `Partial<Task>` trực tiếp từ browser. Chỉ worker dùng updateTask, và các bản cập nhật runtime phải đi qua lease guard ở Task 6.

- [ ] **Step 1 — bootstrap công cụ kiểm thử.** Tạo package có `private: true`, `type: module`, Node engine `>=24.18.0 <25`; `.nvmrc` là `24.18.0`. Cài và khóa phiên bản khi thực thi:

```bash
npm install --save-exact next@16 react@19 react-dom@19 zod@4
npm install --save-dev --save-exact typescript@5 @types/node@24 @types/react@19 @types/react-dom@19 tsx@4 vitest@4 @playwright/test@1
```

Scripts cần tạo:

```json
{
  "test": "vitest run",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:e2e": "playwright test",
  "typecheck": "tsc --noEmit",
  "build": "next build",
  "web": "next dev --hostname 127.0.0.1",
  "worker": "tsx src/worker/main.ts",
  "dev": "node scripts/dev.mjs"
}
```

Vitest `include: ['tests/unit/**/*.test.ts','tests/integration/**/*.test.ts']`, environment node. TS strict, JSX preserve, module ESNext, moduleResolution Bundler, target ES2022. Ignore `node_modules/`, `.next/`, `.harness/`, `.env*`, `test-results/`, `playwright-report/`; giữ `.env.example` nếu tạo. Không lưu credentials.

- [ ] **Step 2 — viết và chạy failing test cho persistence/idempotency.** Test định nghĩa fixture trực tiếp:

```ts
import { test, expect } from 'vitest';
import { openStore } from '../../src/storage/store';
test('duplicate commands are not executed twice', () => {
  const store = openStore(':memory:');
  const choice = { model: 'fixture-model', effort: 'medium' };
  const task = store.createTask({ repositoryId:'repo-1', title:'Filter', requirement:'Filter by status', sourceCommit:'a'.repeat(40), targetBranch:'main', deliveryMode:'local', models:{discover:choice,analyze:choice,plan:choice,implement:choice,review:choice,repair:choice} });
  const command = { id:'cmd-1', taskId:task.id, kind:'start' as const, expectedRevision:task.revision, payload:{} };
  expect(store.enqueue(command)).toBe(true);
  expect(store.enqueue(command)).toBe(false);
  expect(store.nextCommand()?.id).toBe('cmd-1');
  store.finishCommand('cmd-1', { accepted:true });
  expect(store.nextCommand()).toBeNull();
  store.close();
});
```

Run `npm test -- tests/integration/store.test.ts`; trước implementation phải fail vì module chưa tồn tại. Sau khi import tồn tại, xác nhận các test bổ sung fail vì behavior trước khi sửa: stale revision không cập nhật, event không xuất hiện khi transaction rollback, restart giữ task/events, pending command được reconcile chứ không mất.

- [ ] **Step 3 — tạo migration và transaction.** Database đặt tại `.harness/harness.sqlite` hoặc `HARNESS_DATA_DIR`, bật foreign keys, WAL và busy timeout 5000ms. SQL nền:

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id), type TEXT NOT NULL,
  data TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
  body TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','running','done')),
  outcome TEXT
);
CREATE TABLE IF NOT EXISTS records (
  kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY(kind,id)
);
```

`records` lưu các record có Zod schema riêng: repository, profile, plan, approval, attempt, check, finding, artifact, effect và settings. Không dùng nó để thay lock/transaction của tasks, commands hoặc lease. Bổ sung vào Store các hàm generic có kiểm tra schema `putRecord(kind,id,value)`, `getRecord(kind,id)`, `listRecords(kind)`; kiểu public là `unknown` trước khi parse ở service sở hữu record.

```ts
export function transaction<T>(db: import('node:sqlite').DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
```

Update bằng `WHERE id=? AND revision=?`; `changes !== 1` là conflict. Chỉ append event trong cùng transaction thành công. Commands giữ trạng thái running đến khi worker xác nhận effect; không xóa command sau dequeue.

- [ ] **Step 4 — verify và commit.** Run `npm test -- tests/integration/store.test.ts`, `npm run typecheck`; expected PASS. Commit `feat: persist harness tasks and control commands` chỉ gồm file của Task 1.

## Task 2: Codex app-server adapter và model catalog

**Files:** Create `src/codex/rpc.ts`, `src/codex/client.ts`, `src/core/model-policy.ts`, `tests/support/fake-rpc.ts`, `tests/integration/codex.test.ts`, `tests/unit/model-policy.test.ts`, `scripts/codex-smoke.ts`.

**Consumes:** ModelChoice/ModelMap; binary Codex trên PATH hoặc `CODEX_BIN`.

**Produces:**

```ts
type ModelInfo = { id:string; efforts:string[]; isDefault:boolean };
type AgentInput = { cwd:string; model:ModelChoice; instructions:string; prompt:string; outputSchema:Record<string,unknown>; write:boolean; threadId?:string };
type AgentEvent = { type:'started'|'message'|'tool'|'approval'|'completed'|'error'; data:unknown };
type AgentRun = { threadId:string; turnId:string; result:unknown; usage:unknown };
interface AgentClient {
  models(): Promise<ModelInfo[]>;
  run(input:AgentInput, onEvent:(event:AgentEvent)=>void, signal:AbortSignal):Promise<AgentRun>;
  answer(requestId:string|number, result:unknown):Promise<void>;
  interrupt(threadId:string,turnId:string):Promise<void>;
  close():Promise<void>;
}
function resolveModel(stage:keyof ModelMap, task:Partial<ModelMap>, defaults:Partial<ModelMap>, catalog:ModelInfo[]):ModelChoice;
```

- [ ] **Step 1 — model tests.** Trong `tests/unit/model-policy.test.ts`:

```ts
import { test, expect } from 'vitest';
import { resolveModel } from '../../src/core/model-policy';
test('uses explicit planner and implementer choices', () => {
  const catalog = [{id:'strong',efforts:['high'],isDefault:false},{id:'medium',efforts:['medium'],isDefault:true}];
  const config = {plan:{model:'strong',effort:'high'},implement:{model:'medium',effort:'medium'}};
  expect(resolveModel('plan',{},config,catalog).model).toBe('strong');
  expect(resolveModel('implement',{},config,catalog).model).toBe('medium');
  expect(() => resolveModel('plan',{}, {},catalog)).toThrow('model_unconfigured');
  expect(() => resolveModel('plan',{plan:{model:'missing',effort:'high'}},config,catalog)).toThrow('model_unavailable');
});
```

Run `npm test -- tests/unit/model-policy.test.ts`, observe RED. Implement lookup và kiểm tra catalog; không xếp hạng model bằng tên. Nếu effort không hỗ trợ, trả lỗi cấu hình; không tự thay effort.

- [ ] **Step 2 — test protocol bằng fake process.** Fake RPC là process Node đọc JSONL stdin, phản hồi ID đúng và có thể tách một JSON message thành nhiều chunk. Fixture trả models theo hai trang; phát server request có ID trước turn/completed. Tests bắt buộc: parse fragmented lines, response đảo thứ tự, EOF reject mọi pending request, request approval không nhầm thành event/result, gom model pagination, abort đợi turn/completed với status interrupted hoặc đánh dấu unknown. RPC acknowledgment của turn/interrupt riêng nó chưa chứng minh turn đã dừng.

```ts
// tests/support/fake-rpc.ts: protocol fixture; không gọi model thật.
import { createInterface } from 'node:readline';
for await (const line of createInterface({ input:process.stdin })) {
  const request = JSON.parse(line);
  if (request.method === 'initialize') process.stdout.write(JSON.stringify({id:request.id,result:{userAgent:'fixture'}})+'\n');
  if (request.method === 'model/list') process.stdout.write(JSON.stringify({id:request.id,result:{data:[],nextCursor:null}})+'\n');
}
```

Bổ sung fixture branches để phát các cases trên, không mock parser nội bộ. Run `npm test -- tests/integration/codex.test.ts`; RED trước adapter.

- [ ] **Step 3 — triển khai adapter theo schema local.** Dùng `spawn(binary,['app-server','--stdio'],{shell:false,stdio:['pipe','pipe','pipe']})`. Initialize với `clientInfo:{name:'agent-harness',version:'0.1.0'}`, sau đó notification `initialized`. JSONL request có `id`, `method`, `params`; notification không có ID; response server request dùng ID gốc. Protocol source không hard-code model ID.

```ts
const start = {
  method: 'thread/start',
  params: { cwd: input.cwd, model: input.model.model,
    sandbox: input.write ? 'workspace-write' : 'read-only',
    approvalPolicy: 'on-request',
    developerInstructions: input.instructions }
};
const turn = {
  method: 'turn/start',
  params: { threadId, model: input.model.model, effort: input.model.effort,
    input: [{type:'text',text:input.prompt}], outputSchema:input.outputSchema }
};
```

`threadId` là ID từ thread/start hoặc thread/resume. Kiểm tra enum thật trong schema binary trước khi chốt request; bảo toàn default platform instructions. Thu message cuối và validate output schema ở stage handler. Không log auth payload, API keys hoặc raw environment. Server approvals/user-input đi vào pending request; request không hỗ trợ được decline và báo blocked, không tự accept.

- [ ] **Step 4 — smoke có chủ đích.** Script có hai mode `--catalog` (không chạy model) và `--read-only --model <ID> --effort <supported>` (có usage). Smoke đọc một fixture repo, yêu cầu JSON project summary, không sửa code, không push. Thiếu login chỉ báo lệnh đăng nhập và dừng; không tự chuyển API key. Cho phép chạy catalog trước khi người dùng chọn model; live run dùng cấu hình họ đã chọn.

- [ ] **Step 5 — verify và commit.** Tests fake protocol và model routing PASS, `npm run typecheck` PASS. Commit `feat: connect Codex runtime and route stage models`. Ghi riêng kết quả live smoke; fake tests không chứng minh account access.

## Task 3: Skill/rule bundles có provenance và phạm vi

**Files:** Create `src/context/skills.ts`, `src/context/rules.ts`, `src/context/prompts.ts`, `tests/unit/context.test.ts`, `tests/integration/skills.test.ts`.

**Consumes:** Stage, ModelChoice; AGENTS baseline mục 1–6; skill directories cấu hình ở Settings.

**Produces:**

```ts
type ContextFile = { id:string; path:string; sha256:string; content:string };
type Bundle = { stage:Stage; files:ContextFile[]; adaptations:string; hash:string };
function resolveBundle(stage:Stage, roots:Record<string,string>, repoRoot:string, relevantPaths:string[], liquidTask:boolean):Promise<Bundle>;
function composeInstructions(bundle:Bundle):string;
function snapshotBundle(bundle:Bundle, artifactsDir:string):Promise<string>;
```

- [ ] **Step 1 — test conditional rule và snapshot.** Dùng temp dirs trong `tests/integration/skills.test.ts`; tạo AGENTS.md baseline, một root skill có SKILL.md và file phụ. Resolve implement; sửa file nguồn; đọc snapshot cũ và assert hash/content không đổi. `liquidTask=false` không đòi Lighthouse; `true` và thiếu file trả `rule_unavailable`. Skill required thiếu trả `skill_unavailable`.

```ts
import { test, expect } from 'vitest';
import { composeInstructions } from '../../src/context/prompts';
test('explicit feature scope survives a conflicting skill', () => {
  const text = composeInstructions({stage:'implement',hash:'fixture',adaptations:'Only approved feature checks are mandatory. Keep skipped legacy checks visible.',files:[{id:'tdd',path:'/fixture/SKILL.md',sha256:'fixture',content:'Run the entire project suite.'}]});
  expect(text).toContain('Only approved feature checks are mandatory');
  expect(text).toContain('Run the entire project suite');
});
```

Test này kiểm tra truyền đầy đủ rule + adaptation; behavior thật được kiểm chứng tại Task 8/10. Run focused tests RED trước implementation.

- [ ] **Step 2 — mapping fixed theo spec 6.1.** Registry trong code liệt kê từng stage, skill ID và file phụ cần snapshot. Discover dùng prompt Repo Profile; không tạo một skill được khai báo nhưng không tồn tại. Review include `requesting-code-review/code-reviewer.md`; TDD include `writing-good-tests.md`; debugging include tài liệu root-cause khi nhánh cần dùng. Root skill do user cấu hình/resolve từ local installation; không chép path cache của máy phát triển vào code.

```ts
import { createHash } from 'node:crypto';
export function contentHash(content:string):string {
  return createHash('sha256').update(content).digest('hex');
}
// Sắp xếp theo ID trước khi hash để cùng nội dung luôn có cùng fingerprint.
const fingerprint = contentHash(JSON.stringify(files.map(f => [f.id,f.sha256]).sort()));
```

`files` là ContextFile[] đã resolve; bundle hash phải gồm adaptations và stage ngoài file fingerprints. Xác thực realpath nằm trong root tương ứng, không đi theo symlink thoát root; chỉ đọc tài liệu được phép, không theo link URL như instruction tự động. Load nested AGENTS chỉ cho thư mục liên quan. Parse baseline theo heading để bỏ mục 7, không cắt bằng số dòng.

- [ ] **Step 3 — prompt wrapper.** Format rõ: policy của harness → baseline → repo rules → skill sources → adaptations đã thống nhất → task context và output contract. Chỉ một stage owner; worker làm transition, reviewer dispatch, commit/push. Không thêm router skill tự gọi cả pipeline. Hiển thị nguồn thiếu/xung đột trên dashboard, không âm thầm bỏ qua.

- [ ] **Step 4 — verify và commit.** Run `npm test -- tests/unit/context.test.ts tests/integration/skills.test.ts` và typecheck. Commit `feat: load scoped rules and versioned skill bundles`.

## Task 4: Đăng ký repo và discovery không sửa code

**Files:** Create `src/repositories/inspect.ts`, `tests/support/temp-repo.ts`, `tests/integration/discovery.test.ts`; extend `src/core/contracts.ts`, `src/server/services.ts`.

**Consumes:** Store, AgentClient, Bundle; local Git repo có ít nhất một commit.

**Produces:**

```ts
type Repository = {id:string;root:string;baseBranch:string;remote:string|null;head:string;dirty:boolean};
type CommandSpec = {id:string;executable:string;args:string[];cwd:string;envNames:string[];timeoutMs:number;reportPath:string|null};
type RepoProfile = {repositoryId:string;sourceCommit:string;languages:string[];areas:{path:string;purpose:string}[];commands:CommandSpec[];prerequisites:string[];evidence:{path:string;reason:string}[];unknowns:string[]};
function inspectRepository(path:string, baseBranch:string, remote:string|null):Promise<Repository>;
function discoverRepository(repo:Repository, client:AgentClient, bundle:Bundle, model:ModelChoice, signal:AbortSignal):Promise<RepoProfile>;
function createTempRepo(files:Record<string,string>):Promise<{root:string;dispose:()=>Promise<void>}>;
```

- [ ] **Step 1 — Git fixture và RED.** Helper dùng `mkdtemp`, ghi files, `git init -b main`, local fixture user.name/email, add/commit; dispose chỉ xóa thư mục tạm do helper tạo. `execFile` với array args, không ghép shell command.

```ts
import { test, expect } from 'vitest';
import { createTempRepo } from '../support/temp-repo';
import { inspectRepository } from '../../src/repositories/inspect';
test('accepts a non-JavaScript repo without executing setup', async () => {
  const fixture = await createTempRepo({'pyproject.toml':'[project]\nname="fixture"\nversion="0.1.0"\n','app.py':'print("hello")\n'});
  try {
    const repo = await inspectRepository(fixture.root,'main',null);
    expect(repo.head).toMatch(/^[a-f0-9]{40,64}$/);
    expect(repo.root).toBe(fixture.root);
    expect(repo.dirty).toBe(false);
  } finally { await fixture.dispose(); }
});
```

Thêm case path có dấu cách, missing base, unborn repo, dirty original, malicious package script không được chạy. Focused tests RED.

- [ ] **Step 2 — inspect chính xác và discover có evidence.** Dùng `git -C root rev-parse --show-toplevel`, `rev-parse --verify <branch>^{commit}`, `status --porcelain=v1 -z`, `remote get-url`. Canonicalize root. Không tự init repo đích. Profile đọc commit nguồn qua `git show`/index tài liệu; working tree bẩn không được lẫn vào profile của commit đã chọn.

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
export async function gitText(root:string,args:string[]):Promise<string> {
  const { stdout } = await execFileAsync('git',['-C',root,...args],{maxBuffer:8*1024*1024});
  return stdout.trim();
}
```

API `registerRepository({path,baseBranch,remote})` ghi Repository, sau đó discovery là worker action. Discovery agent read-only, output Zod RepoProfile. Không chạy setup, không đọc .env; commands chỉ là candidates cần plan duyệt. Validate evidence paths tồn tại trong source revision. Store profile keyed repositoryId+sourceCommit.

- [ ] **Step 3 — verify và commit.** Tests PASS, original repo fixture giữ nguyên dirty files. Commit `feat: register repositories and discover project context`.

## Task 5: Requirement, plan version và approval gate

**Files:** Create `src/core/transitions.ts`, `src/core/acceptance.ts`, `tests/unit/planning.test.ts`, `tests/support/task-fixture.ts`; extend contracts/store/services/prompts.

**Consumes:** Task, RepoProfile, AgentClient, Bundle và stage model map.

**Produces:**

```ts
type Criterion = {id:string;description:string;checkIds:string[]};
type CheckSpec = CommandSpec & {kind:'unit'|'integration'|'e2e'|'build'|'typecheck';required:boolean;minimumTests:number;reportFormat:'junit'|'tap'|'exit-code';successPattern:string|null};
type PlanStep = {id:string;description:string;files:string[];dependsOn:string[];inputs:string;outputs:string;verification:string};
type Plan = {taskId:string;version:number;sourceCommit:string;scope:string;outOfScope:string[];criteria:Criterion[];steps:PlanStep[];checks:CheckSpec[];dependencies:string[];environment:string[];unresolved:string[]};
type Analysis = {requirement:string;questions:{id:string;question:string;recommendation:string}[]};
function validatePlan(plan:Plan):string[];
function approvePlan(task:Task,plan:Plan,expectedVersion:number):Task;
function canImplement(task:Task,plan:Plan):boolean;
```

- [ ] **Step 1 — test approval thuần.** Fixture Task/Plan lưu `tests/support/task-fixture.ts` cung cấp `taskFixture(patch:Partial<Task>={})` và `planFixture(patch:Partial<Plan>={})`, với toàn bộ fields hợp lệ, một criterion `AC-1`, một required check `feature-unit`, một step có verification.

```ts
import {test,expect} from 'vitest';
import {taskFixture,planFixture} from '../support/task-fixture';
import {approvePlan,canImplement} from '../../src/core/transitions';
test('editing a plan invalidates prior approval', () => {
  const plan=planFixture({version:1});
  const approved=approvePlan(taskFixture({planVersion:1}),plan,1);
  expect(canImplement(approved,plan)).toBe(true);
  expect(canImplement(approved,planFixture({version:2}))).toBe(false);
  expect(()=>approvePlan(approved,planFixture({version:2}),1)).toThrow('stale_plan');
});
```

Thêm tests: unresolved questions, criterion không map evidence, dependency cycle giữa steps, plan thiếu command, unsupported model effort. Run RED.

- [ ] **Step 2 — implement guards.** Plan output validate Zod rồi validate nghiệp vụ; invalid output chờ sửa/làm rõ, không tạo approval tự động.

```ts
export function canImplement(task:Task,plan:Plan):boolean {
  return task.planVersion===plan.version && task.approvedPlanVersion===plan.version
    && task.sourceCommit===plan.sourceCommit && validatePlan(plan).length===0;
}
```

`approvePlan` reject nếu version mismatch hoặc validatePlan có lỗi; trả task được copy với approvedPlanVersion và stage prepare/status queued. Store lưu plan version mới immutable, approval riêng theo task/version. Answer sửa requirement phải tạo plan mới trước code. Approve API dùng expectedRevision và expectedVersion để tránh double-click/stale browser.

- [ ] **Step 3 — analysis/planning messages.** Analyze trả Analysis; questions khác rỗng → waiting_input. Sau câu trả lời, chạy lại analyze trên context đã lưu; đủ rõ → plan dùng model planner. Plan bao gồm steps/interface/checks như spec mục 4. Không gọi implement trong cùng lượt planning.

- [ ] **Step 4 — verify và commit.** Focused planning tests PASS và typecheck. Commit `feat: require versioned plans before implementation`.

## Task 6: Worker đơn, stage attempts, pause và reconciliation

**Files:** Create `src/storage/lease.ts`, `src/worker/main.ts`, `src/worker/engine.ts`, `src/worker/stages.ts`, `src/worker/recovery.ts`, `tests/integration/worker.test.ts`; extend contracts/store.

**Consumes:** Store, AgentClient, Repository/Plan/Bundle; stage handlers Task 4/5. Các handler chưa được Task 7–9 triển khai trả blocked với reason capability_unavailable, không giả vờ pass.

**Produces:**

```ts
type Lease = {owner:string;epoch:number;expiresAt:number};
type Attempt = {id:string;taskId:string;stage:Stage;leaseEpoch:number;model:ModelChoice|null;bundleHash:string|null;threadId:string|null;turnId:string|null;fingerprint:string|null;status:'running'|'completed'|'interrupted'|'failed';output:unknown};
type StageResult = {stage:Stage;status:Status;reason:string|null;output:unknown};
type StageHandler = (task:Task,signal:AbortSignal)=>Promise<StageResult>;
type RecoveryObservation = {agent:'stopped'|'running'|'unknown';process:'stopped'|'running'|'unknown';effect:'absent'|'confirmed'|'unknown'};
function decideRecovery(observation:RecoveryObservation):'resume'|'wait'|'reconcile';
function claimLease(db:import('node:sqlite').DatabaseSync,owner:string,now:number,ttlMs:number):Lease|null;
function renewLease(db:import('node:sqlite').DatabaseSync,lease:Lease,now:number,ttlMs:number):boolean;
function runWorker(store:Store,handlers:Record<Stage,StageHandler>,signal:AbortSignal):Promise<void>;
```

- [ ] **Step 1 — RED cho ownership và recovery.** SQLite connections riêng cùng file: hai claim đồng thời chỉ một thành công; expired owner không được update task/event/effect; duplicate command chỉ một stage attempt. Pure recovery test:

```ts
import {test,expect} from 'vitest';
import {decideRecovery} from '../../src/worker/recovery';
test('does not start another writer when old process is unknown',()=>{
  expect(decideRecovery({agent:'unknown',process:'stopped',effect:'absent'})).toBe('wait');
  expect(decideRecovery({agent:'stopped',process:'stopped',effect:'unknown'})).toBe('reconcile');
  expect(decideRecovery({agent:'stopped',process:'stopped',effect:'absent'})).toBe('resume');
});
```

- [ ] **Step 2 — global lease và fenced writes.** Migration thêm một row lock toàn worker:

```sql
CREATE TABLE IF NOT EXISTS worker_lease (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1), owner TEXT NOT NULL,
  epoch INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
```

Claim/renew trong transaction, clock milliseconds; TTL 15s, heartbeat 5s. Mỗi write runtime kiểm tra owner+epoch+expiry trong cùng transaction. Lease hết hạn chỉ cho worker mới reconcile, không mặc định cho phép writer mới. Web ghi ControlCommand, không tự dùng worker lease để chạy process.

- [ ] **Step 3 — worker dispatch và lifecycle.** Một stage attempt tại một thời điểm. `main.ts` mở Store, tạo Codex adapter và handlers, đăng ký SIGINT/SIGTERM với AbortController, flush state và đóng adapter/DB khi dừng.

```ts
export function decideRecovery(o:RecoveryObservation):'resume'|'wait'|'reconcile' {
  if(o.agent!=='stopped'||o.process!=='stopped') return 'wait';
  return o.effect==='unknown'?'reconcile':'resume';
}
```

Control priority pause/cancel trước start của stage mới. Pause/timeout gọi interrupt/process-group stop, đợi acknowledgment; nếu không xác định được thì interrupted/unknown và giữ writer exclusion. Quota → blocked/quota; không auto-retry. Resume cần user command và recheck revision, process identity, lease, worktree và effects. Commands đang running lúc crash được đối chiếu outcome chứ không đơn giản đổi về pending.

- [ ] **Step 4 — tests và commit.** Test fake handlers với fake clock, kill/restart worker child process giữa các mốc, kiểm tra stage không chạy trùng. Run `npm test -- tests/integration/worker.test.ts`; PASS. Commit `feat: orchestrate durable stages with pause and recovery`.

## Task 7: Worktree, process runner và bằng chứng test feature

**Files:** Create `src/repositories/worktree.ts`, `src/repositories/fingerprint.ts`, `src/execution/process.ts`, `src/execution/checks.ts`, `tests/integration/execution.test.ts`, `tests/unit/checks.test.ts`; extend prepare/verify handlers.

**Consumes:** Repository, Task, Plan, CommandSpec/CheckSpec, Store effect records.

**Produces:**

```ts
type ProcessResult={exitCode:number|null;signal:string|null;stdoutPath:string;stderrPath:string;timedOut:boolean};
type CheckResult={id:string;taskId:string;planVersion:number;fingerprint:string;status:'passed'|'failed'|'blocked'|'skipped'|'not_applicable';executed:number|null;exitCode:number|null;evidencePath:string;reason:string|null};
function prepareWorktree(repo:Repository,task:Task,root:string):Promise<string>;
function fingerprintWorktree(path:string):Promise<string>;
function runProcess(command:CommandSpec,root:string,artifacts:string,signal:AbortSignal):Promise<ProcessResult>;
function evaluateCheck(spec:CheckSpec,execution:{exitCode:number|null;timedOut:boolean;executed:number|null;failed:number;skipped:number;successMatched:boolean}):CheckResult['status'];
function runChecks(task:Task,plan:Plan,signal:AbortSignal):Promise<CheckResult[]>;
```

- [ ] **Step 1 — failing evidence tests.**

```ts
import {test,expect} from 'vitest';
import {evaluateCheck} from '../../src/execution/checks';
test('a green exit with zero feature tests is blocked',()=>{
  const spec={id:'feature',executable:'node',args:['--test'],cwd:'.',envNames:[],timeoutMs:1000,reportPath:null,kind:'unit' as const,required:true,minimumTests:1,reportFormat:'tap' as const,successPattern:null};
  expect(evaluateCheck(spec,{exitCode:0,timedOut:false,executed:0,failed:0,skipped:0,successMatched:false})).toBe('blocked');
  expect(evaluateCheck(spec,{exitCode:0,timedOut:false,executed:2,failed:0,skipped:0,successMatched:false})).toBe('passed');
});
```

Thêm tests real temp Git: source dirty không bị copy, branch/worktree retry không tạo bản thứ hai, untracked source thay đổi fingerprint, build artifacts không làm đổi fingerprint, symlink escape rejected, abort dừng process tree, command arguments chứa dấu cách được giữ nguyên. Legacy check không nằm trong Test Plan không được runner tự chạy.

- [ ] **Step 2 — worktree và fingerprint.** Kiểm tra sourceCommit vẫn đúng plan; tạo branch bằng `git worktree add -b <branch> <path> <commit>` qua execFile. Ghi effect intent trước; nếu retry thì dùng `git worktree list --porcelain` và verify branch/path/commit identity. Có collision không thuộc task thì block.

Fingerprint gồm base/source commit và sorted inventory của tracked source/config cùng untracked non-ignored files, file content và executable/symlink metadata; exclude metadata `.git`, dependency/build outputs theo ignore và runner report paths. Test thay đổi tracked file đã bị ignore vẫn phải phát hiện. Không hash raw secret content vào agent prompt hoặc log.

- [ ] **Step 3 — process/test execution.** `spawn(executable,args,{cwd,env,shell:false,detached:true})`, giới hạn env allowlist theo plan. Reject cwd/reportPath thoát worktree/artifact root sau canonicalize. Stdout/stderr stream ra artifacts, không giữ vô hạn trong memory. SIGTERM process group, grace 5s rồi SIGKILL; ghi unknown nếu không xác nhận dừng. Dịch vụ E2E có readiness check, port riêng và cleanup trong finally.

```ts
if(execution.timedOut||execution.exitCode===null) return 'blocked';
if(execution.exitCode!==0||execution.failed>0) return 'failed';
if(spec.kind==='build'||spec.kind==='typecheck') return 'passed';
if(execution.executed===null) return execution.successMatched?'passed':'blocked';
if(execution.executed<spec.minimumTests||execution.skipped>0) return 'blocked';
return 'passed';
```

Report parser hỗ trợ JUnit và TAP bằng thư viện/parser được kiểm tra khi cài; exit-code fallback cho tool khác cần successPattern và acceptance evidence được duyệt trước. Nếu không có count hoặc bằng chứng run phù hợp thì blocked. Không nới assertion sau failure. Snapshot trước/sau test phải giống nhau về source; test sửa source khiến evidence stale.

- [ ] **Step 4 — verify và commit.** Focused tests PASS, `npm run typecheck` PASS. Commit `feat: execute isolated feature work and collect test evidence`.

## Task 8: Implementation, review độc lập và repair loop

**Files:** Extend `src/worker/stages.ts`, `src/core/transitions.ts`, `src/core/acceptance.ts`, `src/context/prompts.ts`; create `tests/integration/pipeline.test.ts`, `tests/unit/acceptance.test.ts`.

**Consumes:** Tất cả contracts Task 1–7.

**Produces:**

```ts
type Finding={id:string;severity:'critical'|'important'|'minor';criterionId:string|null;path:string;line:number;description:string;evidence:string;status:'open'|'resolved'|'disputed'};
type Review={taskId:string;fingerprint:string;planVersion:number;findings:Finding[];criteria:{id:string;passed:boolean;evidence:string}[];verdict:'pass'|'changes_requested'|'needs_input'};
function nextAfterReview(task:Task,review:Review):Pick<Task,'stage'|'status'|'reason'|'repairCount'>;
function canDeliver(task:Task,plan:Plan,checks:CheckResult[],review:Review,fingerprint:string):boolean;
```

- [ ] **Step 1 — RED cho review gate.**

```ts
import {test,expect} from 'vitest';
import {taskFixture} from '../support/task-fixture';
import {nextAfterReview} from '../../src/core/transitions';
test('repair budget survives restart and model changes',()=>{
  const task=taskFixture({repairCount:3});
  const review={taskId:task.id,fingerprint:'snap',planVersion:1,findings:[],criteria:[],verdict:'changes_requested' as const};
  expect(nextAfterReview(task,review)).toMatchObject({status:'blocked',reason:'repair_limit',repairCount:3});
});
```

Acceptance cases: required check skipped; test fingerprint khác code cuối; new plan invalidates old review; review criterion không evidence; disputed finding vẫn chặn; minor alone không chặn; legacy skipped outside plan không chặn. Fake AgentClient ghi lại model/threadId để assert planner mạnh, implementer tầm trung, reviewer khác phiên.

- [ ] **Step 2 — stage handlers.** Implement nhận plan/RepoProfile/bundle snapshot, dùng writable worktree và model implement. Review nhận plan/diff/evidence, tạo thread mới read-only, không dùng implementation conversation. Repair nhận findings/test reports, nạp receiving-code-review rồi systematic-debugging/TDD, không tự đổi model stage.

```ts
export function nextAfterReview(task:Task,review:Review) {
  if(review.verdict==='needs_input') return {stage:'review' as const,status:'waiting_input' as const,reason:'review_dispute',repairCount:task.repairCount};
  if(review.verdict==='pass') return {stage:'deliver' as const,status:'queued' as const,reason:null,repairCount:task.repairCount};
  if(task.repairCount>=3) return {stage:'review' as const,status:'blocked' as const,reason:'repair_limit',repairCount:task.repairCount};
  return {stage:'repair' as const,status:'queued' as const,reason:null,repairCount:task.repairCount};
}
```

Chỉ gọi transition sau validation đầy đủ của Review. Verify fail mở repair theo cùng budget guard, không có bộ đếm riêng. Transition sang queued/repair giữ nguyên counter; counter tăng đúng một lần, atomically với tạo repair attempt khi worker claim attempt mới và kiểm tra repairCount < 3. Retry/reconcile cùng attempt không tăng lại. TDD red trong implement chưa phải verify stage và không tiêu repair budget.

- [ ] **Step 3 — implement canDeliver.** Kiểm tra plan approval/source; mỗi required check đúng ID, planVersion, fingerprint và status passed; mỗi criterion có evidence và reviewer passed; review cùng snapshot/plan; không open/disputed critical/important finding. Lưu acceptance report cả khi false để UI giải thích từng điều kiện. Không coi verdict pass là đủ.

- [ ] **Step 4 — verify xuyên suốt bằng fake agent + runner thật.** Temp repo nhỏ: lần implement đầu viết behavior sai, focused test fail, repair sửa đúng, verify pass, reviewer đọc snapshot cuối. Giới hạn test scope chỉ feature fixture; một legacy test cố tình fail nằm ngoài plan. Assert không đọc legacy result thành pass. Tests PASS và commit `feat: close the implementation review and repair loop`.

## Task 9: Bàn giao local và GitHub không tạo trùng PR

**Files:** Create `src/delivery/github.ts`, `src/delivery/report.ts`, `tests/integration/delivery.test.ts`; extend deliver handler và services.

**Consumes:** Gate Task 8, Repository/Task/Plan/Review/CheckResult, effect journal.

**Produces:**

```ts
type Delivery={mode:'github'|'local';commit:string;reportPath:string;prUrl:string|null};
interface GitHubPort {
  findPullRequest(repo:string,head:string,base:string):Promise<{url:string;headCommit:string}|null>;
  createPullRequest(input:{repo:string;head:string;base:string;title:string;bodyFile:string}):Promise<string>;
}
function deliver(task:Task,signal:AbortSignal):Promise<Delivery>;
function renderReport(plan:Plan,checks:CheckResult[],review:Review):string;
```

- [ ] **Step 1 — RED với fake GitHubPort.** Test create trả lỗi mất kết nối sau khi fake server đã lưu PR; chạy lại phải find PR cũ, không create lần hai. Test remote head thay đổi ngoài task → blocked; repo không có remote → local report và commit; không force push. Dùng temp bare Git remote cho push tests, không GitHub thật.

```ts
// Logic phải được test qua deliver và journal trong tests/integration/delivery.test.ts.
const existing = await github.findPullRequest(repository, headBranch, baseBranch);
if(existing) return {mode:'github',commit,reportPath,prUrl:existing.url};
const prUrl = await github.createPullRequest({repo:repository,head:headBranch,base:baseBranch,title,bodyFile:reportPath});
return {mode:'github',commit,reportPath,prUrl};
```

Biến trong snippet lấy từ Task/Repository, commit đã xác minh và renderReport đã ghi file; không nhận head/base tùy ý từ agent output.

- [ ] **Step 2 — journal side effects.** Effect key gồm taskId, operation, expected commit/head/base. Ghi intent → chạy → query xác nhận → ghi confirmed. Commit only task-owned paths sau diff check; compare fingerprint trước và sau commit (hooks đổi source khiến quay về verify/review). Push bằng argv thông thường, không force. PR body dùng file và `gh pr create --body-file`.

Run `gh pr list --repo <repo> --head <head> --base <base> --state all --json url,headRefOid,state` để reconcile; kiểm tra task marker và state, không dùng closed/merged PR làm thành công cho code mới. Remote không phải GitHub hoặc credential thiếu → blocked/delivery_error, UI có chọn local. Local report có skipped legacy list, acceptance evidence, limitations và source/target relationship.

- [ ] **Step 3 — verify và commit.** Test journal mất response trước/sau push/create, branch collision và local fallback. Run `npm test -- tests/integration/delivery.test.ts`; PASS. Commit `feat: deliver verified changes locally or through GitHub`.

## Task 10: Dashboard, local session và E2E nghiệm thu

**Files:** Create `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/settings/page.tsx`, `src/app/tasks/[id]/page.tsx`, `src/app/api/[...path]/route.ts`, `src/components/task-form.tsx`, `src/components/task-detail.tsx`, `src/components/model-settings.tsx`, `src/server/local-session.ts`, `scripts/dev.mjs`, `playwright.config.ts`, `tests/e2e/lifecycle.spec.ts`, `tests/integration/http.test.ts`, `README.md`.

**Consumes:** Service facade từ các task trước. Route handlers luôn `runtime='nodejs'`; không import sqlite hoặc credential logic vào client component.

**Produces:** Dashboard local dùng tiếng Việt, Settings model/skill, repo/task forms, questions/approval, timeline/diff/tests/review, pause/resume/cancel và delivery report.

- [ ] **Step 1 — routes và HTTP tests RED.** Contract endpoints:

| Method/path | Input | Output |
| --- | --- | --- |
| GET /api/health | none | worker heartbeat + app status |
| GET /api/models | none | model catalog, auth status đã lọc |
| GET/PUT /api/settings | stage models + skill root paths | validated configuration |
| GET/POST /api/repositories | path/base/remote | Repository list/created |
| GET/POST /api/tasks | NewTask | Task list/created |
| GET /api/tasks/:id | none | task + plan + checks + review + artifact metadata |
| GET /api/tasks/:id/events?after=N | sequence cursor | Event[] |
| POST /api/tasks/:id/commands | ControlCommand | accepted/conflict |
| GET /api/artifacts/:id | registered artifact ID | authorized file content |

Zod validate body; Origin/Host check và same-site HttpOnly local session. Session bootstrap chỉ từ page served đúng loopback host; không cấp credential qua cross-origin endpoint. Không CORS wildcard. Artifact API resolve bằng ID đã đăng ký, không nhận path trực tiếp. Status codes 400 input invalid, 403 origin/session, 404 missing resource, 409 stale revision, 503 worker unavailable.

```ts
export function validMutationOrigin(origin:string|null,host:string):boolean {
  if(!origin) return false;
  try { const url=new URL(origin); return url.protocol==='http:' && url.host===host && ['127.0.0.1','localhost'].includes(url.hostname); }
  catch { return false; }
}
```

Đây là một guard; vẫn cần session CSRF token và Host validation cho request cùng origin. HTTP tests gồm evil origin, spoof Host, missing session, stale revision, artifact path traversal và credentials không xuất hiện trong response.

- [ ] **Step 2 — UI từ trạng thái thật.** Bố cục sidebar repo/task, phần giữa timeline và stage hiện tại, panel plan/diff/tests/review. Chỉ hiển thị actions hợp lệ, nhưng server vẫn enforce guard. Model dropdown lấy catalog thật; planner/implementer cần người dùng chọn và lưu trước start. Không tự đặt model có tên giả. Poll 1s khi running, 3s khi idle; cleanup interval khi unmount, dùng after cursor tránh lặp.

```tsx
export function TaskActions({task,onCommand}:{task:Task;onCommand:(kind:'pause'|'resume'|'cancel')=>void}) {
  return <div aria-label="Điều khiển task">
    {task.status==='running' && <button onClick={()=>onCommand('pause')}>Tạm dừng</button>}
    {['paused','interrupted','blocked'].includes(task.status) && <button onClick={()=>onCommand('resume')}>Tiếp tục</button>}
    {!['completed','cancelled'].includes(task.status) && <button onClick={()=>onCommand('cancel')}>Hủy task</button>}
  </div>;
}
```

Dùng semantic HTML/CSS responsive và code/diff text có escaping. Phase blocked hiển thị lý do và form cần thiết, không chỉ nút resume vô hiệu. UI hiển thị planner/implementer thực dùng, usage nếu có; không hiển thị USD suy đoán.

- [ ] **Step 3 — E2E fixture và test.** `HARNESS_TEST_MODE=1` chỉ cho worker test dùng fake AgentClient/GitHubPort; không bật qua HTTP input và không bật mặc định ở dev/prod. Seed temp repo/settings qua fixture setup trước webServer; fake IDs dùng trong catalog test. Không đưa endpoint test bypass vào production.

```ts
import {test,expect} from '@playwright/test';
test('approval unlocks implementation and ends with a local report',async({page})=>{
  await page.goto('/');
  await page.getByLabel('Tên task').fill('Thêm bộ lọc trạng thái');
  await page.getByLabel('Yêu cầu').fill('Lọc danh sách theo trạng thái đã chọn');
  await page.getByRole('button',{name:'Tạo task'}).click();
  await expect(page.getByText('Chờ duyệt plan',{exact:true})).toBeVisible();
  await expect(page.getByText('Đang implement',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Duyệt plan'}).click();
  await expect(page.getByText('Đã bàn giao local',{exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByRole('link',{name:'Báo cáo nghiệm thu'})).toBeVisible();
});
```

Playwright webServer chạy `npm run dev` với port 3100 và temp HARNESS_DATA_DIR, reuseExistingServer false; worker/web cùng data dir. `scripts/dev.mjs` forward signals và dừng cả child process khi script bị dừng; đóng browser tab không liên quan script lifecycle.

E2E bổ sung: câu hỏi nghiệp vụ; model không khả dụng; skill thiếu; plan mới mất approval; TDD red không tăng repairCount; reviewer riêng và repair loop; quota/pause/restart/resume; skip required feature test bị chặn; legacy fail ngoài phạm vi không chặn; plugin nguồn đổi nhưng snapshot giữ nguyên; một fixture Python không bị ép chạy npm.

- [ ] **Step 4 — verification và README.** Run `npm run test:unit`, `npm run test:integration`, `npm run typecheck`, `npm run build`, `npm run test:e2e`. Mỗi bước đọc output/exit code. Nếu chưa có browser, cài Chromium bằng `npx playwright install chromium` theo permission của môi trường.

README ghi Node floor, npm ci, login Codex/GitHub, chọn planner/implementer, skill root setup, npm run dev, data/worktree locations, cách stop/resume và giới hạn feature-only tests. Live smoke read-only dùng model đã cấu hình; live write chỉ trong repo fixture riêng. GitHub live PR chỉ chạy khi user đã chọn repo thử và cho phép; kiểm thử fake/bare remote vẫn phải pass trước.

- [ ] **Step 5 — commit.** `feat: expose the local harness dashboard and lifecycle controls`. Toàn bộ task còn lại chỉ được coi hoàn thành khi các checks có output thật; ghi rõ live checks nào blocked.

## Ma trận bao phủ spec

| Spec | Task thực hiện |
| --- | --- |
| 1–2: scope/architecture/local worker | 1, 6, 10 |
| 3: đa ngôn ngữ/discovery/môi trường | 4, 7 |
| 4: requirement/plan/approval | 5 |
| 5: pipeline/trạng thái/attempts | 5, 6, 8 |
| 6: model/context và 6.1–6.3 skill/rules | 2, 3, 5, 8 |
| 7: Git isolation/source/feature dependencies | 4, 7, 9 |
| 8: feature tests/review/evidence | 7, 8 |
| 9: budgets/pause/crash/quota | 6, 8, 9 |
| 10: gate/PR/local fallback | 8, 9 |
| 11: data/UI/security | 1, 6, 10 |
| 12: unit/integration/E2E/fault injection | Test steps của cả mười task |

Thu metrics từ task events/attempts: time waiting_input/approval, số intervention commands, repairCount, durations, delivery mode và kết quả được người dùng chấp nhận. Không thêm analytics server; report local đủ cho MVP.

## Handoff và kiểm chứng nguồn

Đề xuất thực thi **Native** trong phiên phát triển: các module chia sẻ contracts chặt, triển khai tuần tự giảm lệch interface; có một reviewer độc lập cuối branch. Đây là cách xây harness, tách biệt với các phiên agent mà sản phẩm harness sẽ điều phối. Chưa chọn model cho phiên thực thi hiện tại chỉ từ cấu hình model của sản phẩm.

Trước khi code: người dùng review plan này và chọn Native hoặc Subagent-driven. Khi thực thi, giữ nguyên các quyết định đã chốt; tạo worktree phát triển riêng theo skill nếu chưa ở worktree. Không dùng worktree của repo người dùng làm workspace xây harness.

Nguồn đã đọc để lập plan:

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation): App Router setup và Node requirements.
- [Node SQLite](https://nodejs.org/api/sqlite.html): DatabaseSync; thêm smoke local trên Node 24.18.0 vì trang mặc định có thể mô tả Node mới hơn.
- [Vitest](https://vitest.dev/guide/), [Playwright web server](https://playwright.dev/docs/test-webserver): cấu hình test runner/webServer.
- [Zod JSON Schema](https://zod.dev/json-schema): sinh outputSchema bằng `z.toJSONSchema`, parse lại kết quả trước state transition.
- [Codex app-server](https://learn.chatgpt.com/docs/app-server): JSONL protocol, threads/turns/models/approvals; đối chiếu schema sinh từ CLI cài trên máy.

Các command/test code ở đây là công việc thực thi kế tiếp, chưa được chạy trên product code vì product code chưa tồn tại.
