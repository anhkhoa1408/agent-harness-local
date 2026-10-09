import type { Store } from "../infrastructure/persistence/store";
import type { ModelInfo } from "../domain/model-policy";
import type { LoginService } from "../application/system";
import { SystemService } from "../application/system";
import { DashboardService } from "../application/dashboard";
import { SessionService } from "../application/sessions";
import { ArtifactService } from "../application/artifacts";
import { sessionCrypto } from "../infrastructure/system/session-crypto";
import { artifactReader } from "../infrastructure/system/artifacts";
import { systemRuntime } from "../infrastructure/runtime/system";
import { validation } from "../infrastructure/validation/gateway";
import { gitText } from "../infrastructure/repositories/inspect";
import { createServices } from "./services";
import { createHttpHandler as handler } from "../presentation/http/http";
import { getCodexLogin } from "../infrastructure/codex/login";
import { pickFolder } from "../infrastructure/system/folder-picker";
import { bootstrapSession as bootstrap } from "../presentation/http/local-session";
export { SettingsSchema } from "../infrastructure/validation/settings";
export function createSessionService(raw: Store) {
  return new SessionService(
    createServices(raw).store,
    sessionCrypto,
    systemRuntime,
  );
}
export function bootstrapSession(request: Request, store: Store) {
  return bootstrap(request, createSessionService(store));
}
export function createHttpHandler(
  raw: Store,
  data: string,
  models: () => Promise<ModelInfo[]>,
  login: LoginService = getCodexLogin(),
  folderPicker = pickFolder,
) {
  const services = createServices(raw, data, { listModels: models });
  return handler({
    modelService: services.models,
    taskService: services.tasks,
    repositoryService: services.repositories,
    dashboard: new DashboardService(
      services.store,
      services.stories,
      services.plans,
      systemRuntime,
      validation,
      { diff: (root, source) => gitText(root, ["diff", source, "--"]) },
    ),
    system: new SystemService(login, folderPicker, models),
    sessions: createSessionService(raw),
    artifactService: new ArtifactService(services.store, artifactReader(data)),
    validation,
  });
}
