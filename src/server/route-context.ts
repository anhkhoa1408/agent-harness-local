import type { ModelService } from "../application/models";
import type { TaskService } from "../application/task-service";
import type { Store } from "../storage/store";
import type { ModelInfo } from "../core/model-policy";
import type { LoginService } from "./codex-login";
import type { PlanService } from "../application/planning";
import type { StoryService } from "../application/stories";
export type HttpRouteContext = {
  modelService: ModelService;
  store: Store;
  data: string;
  models: () => Promise<ModelInfo[]>;
  login: LoginService;
  folderPicker: () => Promise<string | null>;
  storyService: StoryService;
  planService: PlanService;
  taskService: TaskService;
};
export type HttpResourceRoute = (
  request: Request,
  url: URL,
  parts: string[],
  body: () => Promise<Record<string, unknown>>,
) => Promise<Response | undefined>;
