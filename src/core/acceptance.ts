import {PlanSchema,type Plan,type Task,type Review} from './contracts';
import type {CheckResult} from '../execution/checks';
export function validatePlan(plan:Plan):string[]{
 const parsed=PlanSchema.safeParse(plan);if(!parsed.success)return parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);
 const errors:string[]=[];
 if(plan.unresolved.length)errors.push('unresolved_questions');
 if(!plan.criteria.length||!plan.steps.length||!plan.checks.length)errors.push('incomplete_plan');
 for(const list of [plan.steps,plan.checks,plan.criteria])if(new Set(list.map(x=>x.id)).size!==list.length)errors.push('duplicate_id');
 for(const criterion of plan.criteria)if(!criterion.checkIds.length||criterion.checkIds.some(id=>!plan.checks.some(c=>c.id===id&&c.required)))errors.push(`missing_evidence:${criterion.id}`);
 for(const check of plan.checks){if(!['build','typecheck'].includes(check.kind)&&check.minimumTests<1)errors.push(`minimum_tests:${check.id}`);if(check.reportFormat==='exit-code'&&!['build','typecheck'].includes(check.kind)&&!check.successPattern)errors.push(`missing_success_evidence:${check.id}`);if(check.reportFormat==='junit'&&!check.reportPath)errors.push(`missing_report:${check.id}`);}
 const visited=new Set<string>(),active=new Set<string>();
 function visit(id:string){if(active.has(id)){errors.push('dependency_cycle');return;}if(visited.has(id))return;const step=plan.steps.find(s=>s.id===id);if(!step){errors.push(`unknown_dependency:${id}`);return;}active.add(id);step.dependsOn.forEach(visit);active.delete(id);visited.add(id);}
 plan.steps.forEach(s=>visit(s.id));return [...new Set(errors)];
}
export function acceptanceErrors(task:Task,plan:Plan,checks:CheckResult[],review:Review,fingerprint:string):string[]{
 const errors=validatePlan(plan);
 if(task.id!==plan.taskId||task.planVersion!==plan.version||task.approvedPlanVersion!==plan.version||task.sourceCommit!==plan.sourceCommit)errors.push('plan_not_approved');
 if(review.taskId!==task.id||review.planVersion!==plan.version||review.fingerprint!==fingerprint)errors.push('stale_review');
 if(review.verdict!=='pass')errors.push('review_not_passed');
 if(review.findings.some(f=>f.severity!=='minor'&&f.status!=='resolved'))errors.push('unresolved_findings');
 for(const spec of plan.checks.filter(c=>c.required)){const matching=checks.filter(c=>c.id===spec.id);if(matching.length!==1||!matching.every(c=>c.taskId===task.id&&c.planVersion===plan.version&&c.fingerprint===fingerprint&&c.status==='passed'&&c.evidencePath))errors.push(`required_check:${spec.id}`);}
 for(const criterion of plan.criteria){const matches=review.criteria.filter(c=>c.id===criterion.id);if(matches.length!==1||!matches.every(c=>c.passed&&c.evidence.trim()))errors.push(`criterion:${criterion.id}`);}
 return errors;
}
export function canDeliver(task:Task,plan:Plan,checks:CheckResult[],review:Review,fingerprint:string):boolean{return acceptanceErrors(task,plan,checks,review,fingerprint).length===0;}
