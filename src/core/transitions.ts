import type {Task,Plan} from './contracts';
import {validatePlan} from './acceptance';
export function canImplement(task:Task,plan:Plan):boolean{return task.id===plan.taskId&&task.planVersion===plan.version&&task.approvedPlanVersion===plan.version&&task.sourceCommit===plan.sourceCommit&&validatePlan(plan).length===0;}
export function approvePlan(task:Task,plan:Plan,expectedVersion:number):Task{
 if(task.id!==plan.taskId||task.planVersion!==expectedVersion||plan.version!==expectedVersion||task.sourceCommit!==plan.sourceCommit)throw new Error('stale_plan');
 if(task.status!=='waiting_approval')throw new Error('invalid_status');
 const errors=validatePlan(plan);if(errors.length)throw new Error(`invalid_plan:${errors.join(',')}`);
 return {...task,approvedPlanVersion:plan.version,stage:'prepare',status:'queued',reason:null};
}
