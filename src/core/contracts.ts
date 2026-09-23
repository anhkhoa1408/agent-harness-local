import { z } from 'zod';
export const stages=['discover','analyze','plan','prepare','implement','verify','review','repair','deliver'] as const;
export const aiStages=['discover','analyze','plan','implement','review','repair'] as const;
export const StageSchema=z.enum(stages);
export const StatusSchema=z.enum(['queued','running','waiting_input','waiting_approval','blocked','paused','interrupted','completed','cancelled','failed']);
export type Stage=z.infer<typeof StageSchema>;
export type Status=z.infer<typeof StatusSchema>;
export type AiStage=typeof aiStages[number];
export const ModelChoiceSchema=z.object({model:z.string().min(1),effort:z.string().min(1)});
export const ModelMapSchema=z.object(Object.fromEntries(aiStages.map(s=>[s,ModelChoiceSchema])) as Record<AiStage,typeof ModelChoiceSchema>);
export type ModelChoice=z.infer<typeof ModelChoiceSchema>;
export type ModelMap=z.infer<typeof ModelMapSchema>;
export const NewTaskSchema=z.object({
  repositoryId:z.string().min(1),title:z.string().trim().min(1).max(200),requirement:z.string().trim().min(1).max(100000),
  sourceCommit:z.string().regex(/^[a-f0-9]{40,64}$/),targetBranch:z.string().min(1),deliveryMode:z.enum(['github','local']),models:ModelMapSchema,
});
export const TaskSchema=NewTaskSchema.extend({
  id:z.string().min(1),stage:StageSchema,status:StatusSchema,reason:z.string().nullable(),revision:z.number().int().nonnegative(),
  planVersion:z.number().int().positive().nullable(),approvedPlanVersion:z.number().int().positive().nullable(),
  repairCount:z.number().int().nonnegative(),worktree:z.string().nullable(),branch:z.string().min(1),resumeStage:StageSchema.nullable(),
  createdAt:z.number(),updatedAt:z.number(),
});
export type Task=z.infer<typeof TaskSchema>;
export type NewTask=z.infer<typeof NewTaskSchema>;
export const ControlCommandSchema=z.object({
  id:z.string().min(1).max(200),taskId:z.string().min(1),
  kind:z.enum(['start','answer','approve','pause','resume','cancel','configure','grant']),
  expectedRevision:z.number().int().nonnegative(),payload:z.unknown(),
});
export type ControlCommand=z.infer<typeof ControlCommandSchema>;
export type Event={seq:number;taskId:string;type:string;data:unknown;at:number};
export const RepositorySchema=z.object({id:z.string(),root:z.string(),baseBranch:z.string(),remote:z.string().nullable(),head:z.string(),dirty:z.boolean()});
export type Repository=z.infer<typeof RepositorySchema>;
export const CommandSpecSchema=z.object({id:z.string().min(1),executable:z.string().min(1),args:z.array(z.string()),cwd:z.string().min(1),envNames:z.array(z.string()),timeoutMs:z.number().int().min(100).max(3600000),reportPath:z.string().nullable()});
export type CommandSpec=z.infer<typeof CommandSpecSchema>;
export const RepoProfileSchema=z.object({repositoryId:z.string(),sourceCommit:z.string(),languages:z.array(z.string()),areas:z.array(z.object({path:z.string(),purpose:z.string()})),commands:z.array(CommandSpecSchema),prerequisites:z.array(z.string()),evidence:z.array(z.object({path:z.string(),reason:z.string()})),unknowns:z.array(z.string())});
export type RepoProfile=z.infer<typeof RepoProfileSchema>;
