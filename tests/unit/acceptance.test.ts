import {test,expect} from 'vitest';import {taskFixture,planFixture} from '../support/task-fixture';import {canDeliver} from '../../src/core/acceptance';import {nextAfterReview} from '../../src/core/transitions';
const task=taskFixture({approvedPlanVersion:1}),plan=planFixture(),check={id:'feature-unit',taskId:'task',planVersion:1,fingerprint:'snap',status:'passed' as const,executed:1,exitCode:0,evidencePath:'/log',reason:null},review={taskId:'task',fingerprint:'snap',planVersion:1,findings:[],criteria:[{id:'AC-1',passed:true,evidence:'feature-unit passed'}],verdict:'pass' as const};
test('delivery requires current evidence and rejects skipped, stale, disputed or empty criteria',()=>{
 expect(canDeliver(task,plan,[check],review,'snap')).toBe(true);
 expect(canDeliver(task,plan,[{...check,status:'skipped'}],review,'snap')).toBe(false);expect(canDeliver(task,plan,[check],review,'new')).toBe(false);expect(canDeliver(task,{...plan,version:2},[check],review,'snap')).toBe(false);
 expect(canDeliver(task,plan,[check],{...review,criteria:[{id:'AC-1',passed:true,evidence:''}]},'snap')).toBe(false);
 const finding={id:'f',severity:'important' as const,criterionId:null,path:'app.js',line:1,description:'bug',evidence:'repro',status:'disputed' as const};expect(canDeliver(task,plan,[check],{...review,findings:[finding]},'snap')).toBe(false);expect(canDeliver(task,plan,[check],{...review,findings:[{...finding,severity:'minor'}]},'snap')).toBe(true);
 expect(canDeliver(task,plan,[check,{...check,id:'legacy',status:'skipped'}],review,'snap')).toBe(true);
});
test('repair budget survives restart and configuration changes',()=>{expect(nextAfterReview({...task,repairCount:3},{...review,verdict:'changes_requested'})).toMatchObject({status:'blocked',reason:'repair_limit',repairCount:3});});
