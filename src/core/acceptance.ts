import {PlanSchema,type Plan} from './contracts';
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
