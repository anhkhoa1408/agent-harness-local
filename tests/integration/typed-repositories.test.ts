import {test,expect} from "vitest";
import {openStore} from "../../src/storage/store";
import {claimLease,fencedStore} from "../../src/storage/lease";
import {createRepositories} from "../../src/infrastructure/persistence/repositories";
import {planFixture,taskFixture} from "../support/task-fixture";
test("typed repositories read the existing SQLite record keys",()=>{
 const raw=openStore(":memory:");try{raw.putRecord("plan","task:1",planFixture());const data=createRepositories(raw);expect(data.plans.get("task:1")).toEqual(planFixture());data.plans.put("task:2",planFixture({version:2}));expect(raw.getRecord("plan","task:2")).toMatchObject({version:2});}finally{raw.close();}
});
test("unit of work rolls back task, event and plan writes together",()=>{
 const raw=openStore(":memory:");try{const data=createRepositories(raw);expect(()=>data.atomic(()=>{const task=data.tasks.create(taskFixture());data.plans.put(task.id+":1",planFixture({taskId:task.id}));throw Error("rollback");})).toThrow("rollback");expect(raw.listTasks()).toEqual([]);expect(raw.listRecords("plan")).toEqual([]);expect(raw.db.prepare("SELECT COUNT(*) AS n FROM events").get()?.n).toBe(0);}finally{raw.close();}
});
test("nested savepoint rolls back only the failed inner unit of work",()=>{
 const raw=openStore(":memory:");try{const data=createRepositories(raw);data.atomic(()=>{data.plans.put("outer",planFixture());expect(()=>data.atomic(()=>{data.plans.put("inner",planFixture());throw Error("inner");})).toThrow("inner");});expect(data.plans.get("outer")).not.toBeNull();expect(data.plans.get("inner")).toBeNull();}finally{raw.close();}
});
test("typed writes retain lease fencing for records, commands and events",()=>{
 const raw=openStore(":memory:");try{const task=raw.createTask(taskFixture());const lease=claimLease(raw.db,"old",100,50)!;const data=createRepositories(fencedStore(raw,lease,()=>200));expect(()=>data.plans.put(task.id+":1",planFixture())).toThrow("lease_lost");expect(()=>data.events.add(task.id,"bad",{})).toThrow("lease_lost");expect(()=>data.commands.enqueue({id:"bad",taskId:task.id,kind:"pause",expectedRevision:task.revision,payload:{}})).toThrow("lease_lost");expect(raw.listRecords("plan")).toEqual([]);}finally{raw.close();}
});
