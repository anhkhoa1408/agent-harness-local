import type { ModelService } from "../../application/models";
import type { TaskService } from "../../application/tasks";
import type { RepositoryService } from "../../application/repositories";
import type { DashboardService } from "../../application/dashboard";
import type { SystemService } from "../../application/system";
import type { SessionService } from "../../application/sessions";
import type { ArtifactService } from "../../application/artifacts";
import type { ValidationPort } from "../../application/validation";
export type HttpRouteContext = {
  modelService: ModelService;
  taskService: TaskService;
  repositoryService: RepositoryService;
  dashboard: DashboardService;
  system: SystemService;
  sessions: SessionService;
  artifactService: ArtifactService;
  validation: ValidationPort;
};
export type HttpResourceRoute = (
  request: Request,
  url: URL,
  parts: string[],
  body: () => Promise<Record<string, unknown>>,
) => Promise<Response | undefined>;
