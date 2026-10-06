import { MAX_REQUEST_BODY_SIZE } from "./limits";
import { WORKER_LEASE_TTL_MS } from "../core/limits";
import {
  pipelineProgress,
  type ProgressAttempt,
} from "../core/pipeline-progress";
import { z } from "zod";
import { getCodexLogin, type LoginService } from "./codex-login";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../storage/store";
import type { ModelInfo } from "../core/model-policy";
import {
  resolveModel,
  defaultModels,
  applyEffortPolicy,
} from "../core/model-policy";
import {
  ExecutionModeSchema,
  ModelMapSchema,
  NewTaskSchema,
  ControlCommandSchema,
  RepositorySchema,
  aiStages,
} from "../core/contracts";
import { authorize, readSession } from "./local-session";
import { createServices } from "./services";
import { contained } from "../context/rules";
import { gitText, RepositoryRegistrationError } from "../repositories/inspect";
import { pickFolder } from "./folder-picker";
export const SettingsSchema = z
  .object({
    models: ModelMapSchema.default(defaultModels),
    executionMode: ExecutionModeSchema.default("manual"),
  })
  .transform((settings) => ({
    ...settings,
    models: applyEffortPolicy(settings.models),
  }));
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
export function createHttpHandler(
  store: Store,
  data: string,
  models: () => Promise<ModelInfo[]>,
  login: LoginService = getCodexLogin(),
  folderPicker: () => Promise<string | null> = pickFolder,
) {
  const { stories: storyService, plans: planService } = createServices(store);
  return async (request: Request): Promise<Response> => {
    if (!authorize(request, store))
      return json({ error: "origin_or_session_invalid" }, 403);
    const url = new URL(request.url),
      parts = url.pathname
        .slice("/api/".length)
        .split("/")
        .map(decodeURIComponent),
      method = request.method;
    const body = async () => {
      if (Number(request.headers.get("content-length")) > MAX_REQUEST_BODY_SIZE)
        throw new Error("body_too_large");
      const text = await request.text();
      if (text.length > MAX_REQUEST_BODY_SIZE) throw new Error("body_too_large");
      return JSON.parse(text);
    };
    try {
      if (parts[0] === "codex-auth") {
        if (!parts[1] && method === "GET") return json(await login.status());
        if (!parts[1] && method === "POST") return json(await login.start());
        if (parts[1] === "cancel" && method === "POST")
          return json(await login.cancel());
      }
      if (parts[0] === "session" && method === "GET")
        return json({ csrf: readSession(request, store)!.csrf });
      if (parts[0] === "health" && method === "GET") {
        const lease = store.getRecord("health", "worker") as {
          at: number;
        } | null;
        return json({
          app: "ready",
          worker: lease && Date.now() - lease.at < WORKER_LEASE_TTL_MS ? "online" : "offline",
          heartbeat: lease?.at ?? null,
        });
      }
      if (parts[0] === "models" && method === "GET") {
        try {
          return json({ models: await models(), auth: "connected" });
        } catch {
          return json(
            { models: [], auth: "unavailable", error: "codex_unavailable" },
            503,
          );
        }
      }
      if (parts[0] === "settings") {
        if (method === "GET")
          return json(
            SettingsSchema.parse(store.getRecord("settings", "current") ?? {}),
          );
        if (method === "PUT") {
          const settings = SettingsSchema.parse(await body()),
            catalog = await models();
          for (const stage of aiStages)
            resolveModel(stage, settings.models, {}, catalog);
          store.putRecord("settings", "current", settings);
          return json(settings);
        }
      }
      if (
        parts[0] === "repositories" &&
        parts[1] === "pick-folder" &&
        parts.length === 2 &&
        method === "POST"
      ) {
        try {
          return json({ path: await folderPicker() });
        } catch (error) {
          const code = error instanceof Error ? error.message : "";
          if (code === "folder_picker_busy") return json({ error: code }, 409);
          if (code === "folder_picker_unsupported")
            return json({ error: code }, 501);
          return json({ error: "folder_picker_failed" }, 503);
        }
      }
      if (parts[0] === "repositories" && !parts[1]) {
        if (method === "GET") return json(store.listRecords("repository"));
        if (method === "POST") {
          const input = z
            .object({
              path: z.string().min(1),
              baseBranch: z.string().min(1),
              remote: z.string().nullable(),
            })
            .parse(await body());
          return json(
            await createServices(store).registerRepository(input),
            201,
          );
        }
      }
      if (parts[0] === "tasks") {
        if (!parts[1]) {
          if (method === "GET") {
            const attempts = store.listRecords("attempt") as ProgressAttempt[];
            return json(
              store
                .listTasks()
                .map((task) => ({
                  ...task,
                  pipeline: pipelineProgress(task, attempts),
                })),
            );
          }
          if (method === "POST") {
            const settings = SettingsSchema.parse(
                store.getRecord("settings", "current") ?? {},
              ),
              raw = await body(),
              repo = RepositorySchema.parse(
                store.getRecord("repository", raw.repositoryId),
              );
            const sourceCommit = await gitText(repo.root, [
              "rev-parse",
              "--verify",
              `${repo.baseBranch}^{commit}`,
            ]);
            const task = NewTaskSchema.parse({
              ...raw,
              featureId: undefined, storyId: undefined,
              sourceCommit,
              executionMode: raw.executionMode ?? settings.executionMode,
              targetBranch: raw.targetBranch ?? repo.baseBranch,
              models: applyEffortPolicy(
                ModelMapSchema.parse(raw.models ?? settings.models),
              ),
            });
            await gitText(repo.root, [
              "check-ref-format",
              "--branch",
              task.targetBranch,
            ]);
            const catalog = await models();
            for (const stage of aiStages)
              resolveModel(stage, task.models, {}, catalog);
            return json(store.createTask(task), 201);
          }
        }
        const task = store.getTask(parts[1]);
        if (parts[2] === "events" && method === "GET") {
          const after = z.coerce
            .number()
            .int()
            .nonnegative()
            .parse(url.searchParams.get("after") ?? 0);
          return json(store.events(task.id, after));
        }
        if (parts[2] === "commands" && method === "POST") {
          const command = ControlCommandSchema.parse({
            ...(await body()),
            taskId: task.id,
          });
          if (command.expectedRevision !== task.revision)
            return json({ error: "revision_conflict" }, 409);
          const health = store.getRecord("health", "worker") as {
            at: number;
          } | null;
          if (!health || Date.now() - health.at > WORKER_LEASE_TTL_MS)
            return json({ error: "worker_unavailable" }, 503);
          return json({ accepted: store.enqueue(command) }, 202);
        }
        if (!parts[2] && method === "GET") {
          let diff = "";
          if (task.worktree)
            try {
              diff = await gitText(task.worktree, [
                "diff",
                task.sourceCommit,
                "--",
              ]);
            } catch {
              diff = "Diff unavailable";
            }
          return json({
            task,
            stories: {execution: storyService.getExecution(task.id),runs:storyService.listStoryRuns(task.id)},
            pipeline: pipelineProgress(
              task,
              store.listRecords("attempt") as ProgressAttempt[],
            ),
            plan: store.getRecord("plan", `${task.id}:${task.planVersion}`),
            comments: planService.planComments(task.id),
            analysis: store.getRecord("analysis", task.id),
            checks: store.getRecord("checks", task.id),
            review: store.getRecord("review", task.id),
            acceptance: store.getRecord("acceptance", task.id),
            delivery: store.getRecord("delivery", task.id),
            runtime: store.getRecord("runtime", task.id),
            approvals: store
              .listRecords("approval")
              .filter((r: any) => r.taskId === task.id && !r.decision),
            artifacts: store
              .listRecords("artifact")
              .filter((r: any) => r.taskId === task.id)
              .map((r: any) => ({ id: r.id, type: r.type })),
            diff,
          });
        }
      }
      if (parts[0] === "artifacts" && method === "GET") {
        const record = store.getRecord("artifact", parts[1]) as {
          path: string;
          type?: string;
        } | null;
        if (!record) return json({ error: "artifact_not_found" }, 404);
        const path = await contained(join(data, "artifacts"), record.path);
        if ((await stat(path)).size > 8 * 1024 * 1024)
          return json({ error: "artifact_too_large" }, 400);
        const screenshot = record.type === "screenshot";
        return new Response(screenshot ? await readFile(path) : await readFile(path, "utf8"), {
          headers: {
            "content-type": screenshot ? "image/png" : "text/plain; charset=utf-8",
            "content-security-policy": "default-src 'none'; sandbox",
            "x-content-type-options": "nosniff",
            "cache-control": "no-store",
          },
        });
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      if (error instanceof RepositoryRegistrationError)
        return json({ error: error.code, details: [error.message] }, 400);
      if (error instanceof z.ZodError)
        return json(
          {
            error: "invalid_input",
            details: error.issues.map(
              (i) => `${i.path.join(".")}: ${i.message}`,
            ),
          },
          400,
        );
      const message = error instanceof Error ? error.message : "request_failed";
      if (message.includes("not_found"))
        return json({ error: "not_found" }, 404);
      if (message.includes("conflict"))
        return json({ error: "revision_conflict" }, 409);
      return json(
        {
          error:
            message.startsWith("model_") || message.startsWith("effort_")
              ? message
              : "request_failed",
        },
        400,
      );
    }
  };
}
