import type {Store} from '../storage/store';
import {inspectRepository} from '../repositories/inspect';
import {PlanSchema,type Plan} from '../core/contracts';
import {validatePlan} from '../core/acceptance';
export function savePlan(store:Store,taskId:string,raw:Plan){return store.atomic(()=>{
 const task=store.getTask(taskId),plan=PlanSchema.parse(raw);
 if(plan.taskId!==task.id||plan.sourceCommit!==task.sourceCommit||plan.version!==(task.planVersion??0)+1)throw new Error('stale_plan');
 const key=`${taskId}:${plan.version}`;if(store.getRecord('plan',key))throw new Error('immutable_plan');
 store.putRecord('plan',key,plan);const errors=validatePlan(plan);
 return store.updateTask(taskId,task.revision,{planVersion:plan.version,approvedPlanVersion:null,stage:'plan',status:errors.length?'waiting_input':'waiting_approval',reason:errors.length?errors.join(','):null},{type:'plan.created',data:{version:plan.version,errors}});
});}
export function createServices(store:Store){return {
 async registerRepository(input:{path:string;baseBranch:string;remote:string|null}){const repo=await inspectRepository(input.path,input.baseBranch,input.remote);store.putRecord('repository',repo.id,repo);return repo;},
};}
