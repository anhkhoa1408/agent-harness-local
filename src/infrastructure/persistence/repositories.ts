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
    plans:
      records<NonNullable<ReturnType<ApplicationStore["plans"]["get"]>>>(
        "plan",
      ),
    repositories:
      records<NonNullable<ReturnType<ApplicationStore["repositories"]["get"]>>>(
        "repository",
      ),
    settings:
      records<NonNullable<ReturnType<ApplicationStore["settings"]["get"]>>>(
        "settings",
      ),
    profiles:
      records<NonNullable<ReturnType<ApplicationStore["profiles"]["get"]>>>(
        "profile",
      ),
    planComments:
      records<NonNullable<ReturnType<ApplicationStore["planComments"]["get"]>>>(
        "plan-comment",
      ),
    storyRuns:
      records<NonNullable<ReturnType<ApplicationStore["storyRuns"]["get"]>>>(
        "story-run",
      ),
    storyExecutions:
      records<
        NonNullable<ReturnType<ApplicationStore["storyExecutions"]["get"]>>
      >("story-execution"),
    storyEvidence:
      records<
        NonNullable<ReturnType<ApplicationStore["storyEvidence"]["get"]>>
      >("story-evidence"),
    checks:
      records<NonNullable<ReturnType<ApplicationStore["checks"]["get"]>>>(
        "checks",
      ),
    reviews:
      records<NonNullable<ReturnType<ApplicationStore["reviews"]["get"]>>>(
        "review",
      ),
    acceptance:
      records<NonNullable<ReturnType<ApplicationStore["acceptance"]["get"]>>>(
        "acceptance",
      ),
    deliveries:
      records<NonNullable<ReturnType<ApplicationStore["deliveries"]["get"]>>>(
        "delivery",
      ),
    effects:
      records<NonNullable<ReturnType<ApplicationStore["effects"]["get"]>>>(
        "effect",
      ),
    artifacts:
      records<NonNullable<ReturnType<ApplicationStore["artifacts"]["get"]>>>(
        "artifact",
      ),
    analyses:
      records<NonNullable<ReturnType<ApplicationStore["analyses"]["get"]>>>(
        "analysis",
      ),
    bundles:
      records<NonNullable<ReturnType<ApplicationStore["bundles"]["get"]>>>(
        "bundle",
      ),
    attempts:
      records<NonNullable<ReturnType<ApplicationStore["attempts"]["get"]>>>(
        "attempt",
      ),
    runtimes:
      records<NonNullable<ReturnType<ApplicationStore["runtimes"]["get"]>>>(
        "runtime",
      ),
    parents:
      records<NonNullable<ReturnType<ApplicationStore["parents"]["get"]>>>(
        "parent",
      ),
    approvals:
      records<NonNullable<ReturnType<ApplicationStore["approvals"]["get"]>>>(
        "approval",
      ),
    health:
      records<NonNullable<ReturnType<ApplicationStore["health"]["get"]>>>(
        "health",
      ),
    ownership:
      records<NonNullable<ReturnType<ApplicationStore["ownership"]["get"]>>>(
        "ownership",
      ),
    exclusions:
      records<NonNullable<ReturnType<ApplicationStore["exclusions"]["get"]>>>(
        "exclusion",
      ),
    preparations:
      records<NonNullable<ReturnType<ApplicationStore["preparations"]["get"]>>>(
        "preparation",
      ),
    answers:
      records<NonNullable<ReturnType<ApplicationStore["answers"]["get"]>>>(
        "answer",
      ),
    sessions:
      records<NonNullable<ReturnType<ApplicationStore["sessions"]["get"]>>>(
        "session",
      ),
  };
}
