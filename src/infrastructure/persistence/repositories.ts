import { RecordKind } from "./constants/record-kind";
import type { ApplicationStore } from "../../application/ports";
import type { Store } from "./store";
// Closures retain the supplied (possibly fenced) store and its transaction scope.
export function createRepositories(store: Store): ApplicationStore {
  function records<T>(kind: string) {
    return {
      get: (id: string) => store.getRecord(kind, id) as T | null,
      put: (id: string, value: T) => store.putRecord(kind, id, value),
      list: () => store.listRecords(kind) as T[],
      delete: (id: string) => store.deleteRecord(kind, id),
    };
  }
  return {
    atomic: (work) => store.atomic(work),
    tasks: {
      get: (id) => store.getTask(id),
      list: () => store.listTasks(),
      create: (task) => store.createTask(task),
      update: (...args) => store.updateTask(...args),
    },
    events: {
      add: (...args) => store.addEvent(...args),
      list: (...args) => store.events(...args),
    },
    commands: {
      enqueue: (command) => store.enqueue(command),
      next: () => store.nextCommand(),
      running: () => store.runningCommands(),
      finish: (...args) => store.finishCommand(...args),
    },
    registry: { remove: (id) => store.removeRepository(id) },
    plans: records<NonNullable<ReturnType<ApplicationStore["plans"]["get"]>>>(
      RecordKind.PLAN,
    ),
    repositories: records<
      NonNullable<ReturnType<ApplicationStore["repositories"]["get"]>>
    >(RecordKind.REPOSITORY),
    settings: records<
      NonNullable<ReturnType<ApplicationStore["settings"]["get"]>>
    >(RecordKind.SETTINGS),
    profiles: records<
      NonNullable<ReturnType<ApplicationStore["profiles"]["get"]>>
    >(RecordKind.PROFILE),
    planComments: records<
      NonNullable<ReturnType<ApplicationStore["planComments"]["get"]>>
    >(RecordKind.PLAN_COMMENT),
    storyRuns: records<
      NonNullable<ReturnType<ApplicationStore["storyRuns"]["get"]>>
    >(RecordKind.STORY_RUN),
    storyExecutions: records<
      NonNullable<ReturnType<ApplicationStore["storyExecutions"]["get"]>>
    >(RecordKind.STORY_EXECUTION),
    storyEvidence: records<
      NonNullable<ReturnType<ApplicationStore["storyEvidence"]["get"]>>
    >(RecordKind.STORY_EVIDENCE),
    checks: records<NonNullable<ReturnType<ApplicationStore["checks"]["get"]>>>(
      RecordKind.CHECKS,
    ),
    reviews: records<
      NonNullable<ReturnType<ApplicationStore["reviews"]["get"]>>
    >(RecordKind.REVIEW),
    acceptance: records<
      NonNullable<ReturnType<ApplicationStore["acceptance"]["get"]>>
    >(RecordKind.ACCEPTANCE),
    deliveries: records<
      NonNullable<ReturnType<ApplicationStore["deliveries"]["get"]>>
    >(RecordKind.DELIVERY),
    effects: records<
      NonNullable<ReturnType<ApplicationStore["effects"]["get"]>>
    >(RecordKind.EFFECT),
    artifacts: records<
      NonNullable<ReturnType<ApplicationStore["artifacts"]["get"]>>
    >(RecordKind.ARTIFACT),
    analyses: records<
      NonNullable<ReturnType<ApplicationStore["analyses"]["get"]>>
    >(RecordKind.ANALYSIS),
    bundles: records<
      NonNullable<ReturnType<ApplicationStore["bundles"]["get"]>>
    >(RecordKind.BUNDLE),
    attempts: records<
      NonNullable<ReturnType<ApplicationStore["attempts"]["get"]>>
    >(RecordKind.ATTEMPT),
    runtimes: records<
      NonNullable<ReturnType<ApplicationStore["runtimes"]["get"]>>
    >(RecordKind.RUNTIME),
    parents: records<
      NonNullable<ReturnType<ApplicationStore["parents"]["get"]>>
    >(RecordKind.PARENT),
    approvals: records<
      NonNullable<ReturnType<ApplicationStore["approvals"]["get"]>>
    >(RecordKind.APPROVAL),
    health: records<NonNullable<ReturnType<ApplicationStore["health"]["get"]>>>(
      RecordKind.HEALTH,
    ),
    ownership: records<
      NonNullable<ReturnType<ApplicationStore["ownership"]["get"]>>
    >(RecordKind.OWNERSHIP),
    exclusions: records<
      NonNullable<ReturnType<ApplicationStore["exclusions"]["get"]>>
    >(RecordKind.EXCLUSION),
    preparations: records<
      NonNullable<ReturnType<ApplicationStore["preparations"]["get"]>>
    >(RecordKind.PREPARATION),
    answers: records<
      NonNullable<ReturnType<ApplicationStore["answers"]["get"]>>
    >(RecordKind.ANSWER),
    sessions: records<
      NonNullable<ReturnType<ApplicationStore["sessions"]["get"]>>
    >(RecordKind.SESSION),
  };
}
