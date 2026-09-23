import {stages} from '../core/contracts';import type {Handlers} from './engine';
import {z} from 'zod';import {join} from 'node:path';
import {createDelivery} from '../delivery/github';
import {aiStages,AnalysisSchema,PlanSchema,RepositorySchema,ReviewSchema,type Task,type AiStage,type Plan} from '../core/contracts';
import type {Store} from '../storage/store';import type {AgentClient} from '../codex/client';import {resolveModel} from '../core/model-policy';
import {resolveBundle,snapshotBundle,type Bundle} from '../context/skills';import {composeInstructions} from '../context/prompts';import {discoverRepository,gitText} from '../repositories/inspect';import {prepareWorktree} from '../repositories/worktree';import {fingerprintWorktree} from '../repositories/fingerprint';import {runChecks,type CheckResult} from '../execution/checks';import {canImplement,nextAfterReview} from '../core/transitions';import {acceptanceErrors} from '../core/acceptance';import {savePlan} from '../server/services';
export function unavailableHandlers():Handlers{return Object.fromEntries(stages.map(stage=>[stage,async()=>({stage,status:'blocked',reason:'capability_unavailable',output:null})])) as unknown as Handlers;}
export function createHandlers(store:Store,client:AgentClient,data:string):Handlers{
 const artifacts=(task:Task)=>join(data,'artifacts',task.id);
 const repository=(task:Task)=>({...RepositorySchema.parse(store.getRecord('repository',task.repositoryId)),head:task.sourceCommit});
 const planOf=(task:Task)=>PlanSchema.parse(store.getRecord('plan',`${task.id}:${task.planVersion}`));
 const fingerprint=(task:Task,plan:Plan)=>fingerprintWorktree(task.worktree!,plan.checks.flatMap(c=>c.reportPath?[c.reportPath]:[]),task.sourceCommit);
 async function freeze(task:Task){const settings=store.getRecord('settings','current') as {skillRoots?:Record<string,string>}|null;
  for(const stage of aiStages){const key=`${task.id}:${stage}`;if(store.getRecord('bundle',key))continue;const bundle=await resolveBundle(stage,settings?.skillRoots??{},repository(task).root,[],/\b(liquid|shopify)\b/i.test(task.requirement));const path=await snapshotBundle(bundle,artifacts(task));store.putRecord('bundle',key,bundle);store.putRecord('artifact',bundle.hash,{id:bundle.hash,taskId:task.id,path,type:'context'});}}
 async function ai<T>(task:Task,stage:AiStage,schema:z.ZodType<T>,context:unknown,signal:AbortSignal){
  await freeze(task);const bundle=store.getRecord('bundle',`${task.id}:${stage}`) as Bundle,model=resolveModel(stage,task.models,{},await client.models());
  let poll:NodeJS.Timeout|undefined;const pending=new Set<string>();
  try{poll=setInterval(()=>{for(const key of pending){const grant=store.getRecord('approval',key) as {requestId:string|number;decision?:string};if(grant.decision){pending.delete(key);client.answer(grant.requestId,{decision:grant.decision}).catch(()=>{});}}},100);
   const run=await client.run({cwd:task.worktree??repository(task).root,model,instructions:composeInstructions(bundle),prompt:JSON.stringify(context),outputSchema:z.toJSONSchema(schema),write:stage==='implement'||stage==='repair'},event=>{
    if(event.type==='approval'){const key=`${task.id}:${String(event.data.requestId)}`;if(!['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(event.data.method)){void client.answer(event.data.requestId,{decision:'decline'});store.addEvent(task.id,'approval.unsupported',{method:event.data.method});return;}store.putRecord('approval',key,{id:key,taskId:task.id,...event.data,decision:null});pending.add(key);store.addEvent(task.id,'approval.requested',{id:key,method:event.data.method});}
    else if(event.type==='started'){store.putRecord('runtime',task.id,{stage,model,bundleHash:bundle.hash,...event.data,state:'running'});store.addEvent(task.id,'agent.started',{stage,model,...event.data});}
   },signal);store.putRecord('runtime',task.id,{stage,model,bundleHash:bundle.hash,threadId:run.threadId,turnId:run.turnId,state:'stopped',usage:run.usage});return schema.parse(run.result);
  }finally{if(poll)clearInterval(poll);for(const key of pending)store.deleteRecord('approval',key);}
 }
 const next=(stage:Task['stage'],output:unknown=null)=>({stage,status:'queued' as const,reason:null,output});
 const mutationSchema=z.object({summary:z.string(),needsReplan:z.boolean(),reason:z.string().nullable()});
 async function mutate(task:Task,signal:AbortSignal){const plan=planOf(task);if(!canImplement(task,plan)||!task.worktree)throw new Error('plan_not_approved');
  const result=await ai(task,task.stage as 'implement'|'repair',mutationSchema,{task,plan,profile:store.getRecord('profile',`${task.repositoryId}:${task.sourceCommit}`),checks:store.getRecord('checks',task.id),review:store.getRecord('review',task.id),instruction:'Implement only approved files and scope. Do not commit. Use feature TDD; expected red is allowed. If scope/dependencies change return needsReplan before changing them.'},signal);
  if(result.needsReplan){const current=store.getTask(task.id);store.updateTask(task.id,current.revision,{approvedPlanVersion:null,stage:'plan',status:'queued',reason:result.reason},{type:'plan.invalidated',data:result});return next('plan',result);}
  const changed=[...(await gitText(task.worktree,['diff','--name-only',task.sourceCommit,'--'])).split('\n'),...(await gitText(task.worktree,['ls-files','--others','--exclude-standard'])).split('\n')].filter(Boolean),allowed=plan.steps.flatMap(s=>s.files),reports=plan.checks.flatMap(c=>c.reportPath?[c.reportPath]:[]);
  if(changed.some(path=>!reports.includes(path)&&!allowed.some(p=>path===p||p.endsWith('/')&&path.startsWith(p))))throw new Error('scope_changed_requires_plan');
  return next('verify',result);
 }
 return {...unavailableHandlers(),
  discover:async(task,signal)=>{await freeze(task);const profile=await discoverRepository(repository(task),client,store.getRecord('bundle',`${task.id}:discover`) as Bundle,resolveModel('discover',task.models,{},await client.models()),signal);store.putRecord('profile',`${task.repositoryId}:${task.sourceCommit}`,profile);return next('analyze',profile);},
  analyze:async(task,signal)=>{const analysis=await ai(task,'analyze',AnalysisSchema,{task,profile:store.getRecord('profile',`${task.repositoryId}:${task.sourceCommit}`)},signal);store.putRecord('analysis',task.id,analysis);return {stage:analysis.questions.length?'analyze':'plan',status:analysis.questions.length?'waiting_input':'queued',reason:null,output:analysis};},
  plan:async(task,signal)=>{const plan=await ai(task,'plan',PlanSchema,{task,version:(task.planVersion??0)+1,analysis:store.getRecord('analysis',task.id),profile:store.getRecord('profile',`${task.repositoryId}:${task.sourceCommit}`),instruction:'Return an implementation plan with exact argv feature checks, explicit file paths, acceptance/check mappings, prerequisites, dependencies and unresolved decisions. Do not implement. Tests must produce TAP or JUnit (reportPath); exit-code checks need a literal successPattern. E2E command owns isolated server readiness and cleanup.'},signal);const saved=savePlan(store,task.id,plan);return {stage:saved.stage,status:saved.status,reason:saved.reason,output:plan};},
  prepare:async(task)=>{const plan=planOf(task);if(!canImplement(task,plan))throw new Error('plan_not_approved');const path=await prepareWorktree(repository(task),task,join(data,'worktrees'));const current=store.getTask(task.id);store.updateTask(task.id,current.revision,{worktree:path},{type:'worktree.prepared',data:{path,branch:task.branch}});return next('implement',{path});},
  implement:mutate,repair:mutate,
  verify:async(task,signal)=>{const plan=planOf(task);if(!canImplement(task,plan))throw new Error('plan_not_approved');const checks=await runChecks(task,plan,signal,artifacts(task));store.putRecord('checks',task.id,checks);
   const failures=plan.checks.filter(s=>s.required&&!checks.some(c=>c.id===s.id&&c.status==='passed'));if(failures.length){if(checks.some(c=>c.status==='blocked'))return {stage:'verify',status:'blocked',reason:checks.find(c=>c.status==='blocked')?.reason??'test_blocked',output:checks};if(task.repairCount>=3)return {stage:'verify',status:'blocked',reason:'repair_limit',output:checks};return next('repair',checks);}return next('review',checks);},
  deliver:async(task,signal)=>{const delivery=await createDelivery(store,data)(task,signal);store.putRecord('delivery',task.id,delivery);return {stage:'deliver',status:'completed',reason:null,output:delivery};},
  review:async(task,signal)=>{const plan=planOf(task),before=await fingerprint(task,plan),checks=(store.getRecord('checks',task.id)??[]) as CheckResult[];
   const review=await ai(task,'review',ReviewSchema,{task,plan,checks,fingerprint:before,diff:await gitText(task.worktree!,['diff',task.sourceCommit,'--']),instruction:'Independently review the final worktree and tests. Every acceptance criterion needs evidence. Return the exact fingerprint and plan version.'},signal);
   const after=await fingerprint(task,plan);if(before!==after)throw new Error('review_snapshot_changed');store.putRecord('review',task.id,review);const errors=acceptanceErrors(task,plan,checks,review,after);store.putRecord('acceptance',task.id,{passed:errors.length===0,errors,fingerprint:after});
   if(review.verdict==='pass'&&errors.length)return {stage:'review',status:'blocked',reason:errors.join(','),output:review};return {...nextAfterReview(task,review),output:review};},
 };
}
