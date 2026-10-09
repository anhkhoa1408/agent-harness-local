import { ModelService } from "../application/models";
import { SettingsSchema } from "../core/settings";
import { TaskService } from "../application/task-service";
import { gitText } from "../repositories/inspect";
import { MAX_REQUEST_BODY_SIZE } from "./limits";

import { getCodexLogin, type LoginService } from "./codex-login";

import type { Store } from "../storage/store";
import type { ModelInfo } from "../core/model-policy";

import { authorize } from "./local-session";
import { createServices } from "./services";

import { pickFolder } from "./folder-picker";
import { json, httpErrorResponse } from "./http-response";
export { SettingsSchema } from "../core/settings";
import { createSystemRoute } from "./routes/system";
import { createSettingsRoute } from "./routes/settings";
import { createRepositoriesRoute } from "./routes/repositories";
import { createTasksRoute } from "./routes/tasks";
import { createArtifactsRoute } from "./routes/artifacts";
export function createHttpHandler(
  store: Store,
  data: string,
  models: () => Promise<ModelInfo[]>,
  login: LoginService = getCodexLogin(),
  folderPicker: () => Promise<string | null> = pickFolder,
) {
  const { stories: storyService, plans: planService } = createServices(store);
  const taskService = new TaskService(store, { readGit: gitText }, models);
  const context = {
    modelService: new ModelService(
      {
        get: () =>
          SettingsSchema.parse(store.getRecord("settings", "current") ?? {}),
        put: (value) => store.putRecord("settings", "current", value),
      },
      { listModels: models },
    ),
    store,
    data,
    models,
    login,
    folderPicker,
    storyService,
    planService,
    taskService,
  };
  const routes = [
    createSystemRoute(context),
    createSettingsRoute(context),
    createRepositoriesRoute(context),
    createTasksRoute(context),
    createArtifactsRoute(context),
  ];
  return async (request: Request): Promise<Response> => {
    if (!authorize(request, store))
      return json({ error: "origin_or_session_invalid" }, 403);
    const url = new URL(request.url),
      parts = url.pathname
        .slice("/api/".length)
        .split("/")
        .map(decodeURIComponent);
    const body = async () => {
      if (Number(request.headers.get("content-length")) > MAX_REQUEST_BODY_SIZE)
        throw new Error("body_too_large");
      const text = await request.text();
      if (text.length > MAX_REQUEST_BODY_SIZE)
        throw new Error("body_too_large");
      return JSON.parse(text);
    };
    try {
      for (const route of routes) {
        const response = await route(request, url, parts, body);
        if (response) return response;
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      return httpErrorResponse(error);
    }
  };
}
