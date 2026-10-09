import {createStoryGit} from "../../src/infrastructure/repositories/story-git";
import {PlanService as Plans} from "../../src/application/planning";
import {StoryService as Stories} from "../../src/application/stories";
import {TaskService as Tasks} from "../../src/application/task-service";
import {ModelService} from "../../src/application/models";
import {createRepositories} from "../../src/infrastructure/persistence/repositories";
import {validation} from "../../src/infrastructure/validation/gateway";
import {systemRuntime} from "../../src/infrastructure/runtime/system";
import type {Store} from "../../src/storage/store";
import type {StoryRepositoryPort} from "../../src/application/ports";
import type {ModelInfo} from "../../src/domain/model-policy";
export class PlanService extends Plans {constructor(store:Store,stories:Stories){super(createRepositories(store),stories,validation,systemRuntime);}}
export class StoryService extends Stories {constructor(store:Store,repository:{readGit:typeof import("../../src/repositories/inspect").gitText;fingerprintWorktree:StoryRepositoryPort["fingerprintWorktree"]}){super(createRepositories(store),createStoryGit(repository.readGit,repository.fingerprintWorktree),validation,systemRuntime);}}
export class TaskService extends Tasks {constructor(store:Store,repository:{readGit:typeof import("../../src/repositories/inspect").gitText},catalog:()=>Promise<ModelInfo[]>){const data=createRepositories(store);super(data,createStoryGit(repository.readGit),new ModelService({get:()=>validation.settings(data.settings.get("current")??{}),put:value=>data.settings.put("current",value)},{listModels:catalog}),validation);}}
