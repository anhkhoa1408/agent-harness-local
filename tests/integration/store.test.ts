import { afterEach, test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../src/storage/store';
const dirs:string[]=[];
afterEach(()=>{for(const d of dirs.splice(0)) rmSync(d,{recursive:true,force:true});});
const choice={model:'fixture-model',effort:'medium'};
const input={repositoryId:'repo-1',title:'Filter',requirement:'Filter by status',sourceCommit:'a'.repeat(40),targetBranch:'main',deliveryMode:'local' as const,models:{discover:choice,analyze:choice,plan:choice,implement:choice,review:choice,repair:choice}};
test('duplicate control commands are consumed once and payload changes are rejected',()=>{
  const store=openStore(':memory:');
  try {
    const task=store.createTask(input);
    const c={id:'cmd-1',taskId:task.id,kind:'start' as const,expectedRevision:0,payload:{}};
    expect(store.enqueue(c)).toBe(true);expect(store.enqueue(c)).toBe(false);
    expect(()=>store.enqueue({...c,kind:'cancel'})).toThrow('command_conflict');
    expect(store.nextCommand()?.id).toBe('cmd-1');expect(store.nextCommand()).toBeNull();
    store.finishCommand('cmd-1',{accepted:true});expect(store.nextCommand()).toBeNull();
  } finally {store.close();}
});
test('stale update preserves state and does not append a false event',()=>{
  const store=openStore(':memory:');
  try {
    const task=store.createTask(input);
    store.updateTask(task.id,0,{status:'running'},{type:'started',data:{}});
    const count=store.events(task.id,0).length;
    expect(()=>store.updateTask(task.id,0,{status:'completed'},{type:'done',data:{}})).toThrow('revision_conflict');
    expect(store.getTask(task.id).status).toBe('running');expect(store.events(task.id,0)).toHaveLength(count);
  } finally {store.close();}
});
test('task and running command survive restart for reconciliation',()=>{
  const dir=mkdtempSync(join(tmpdir(),'harness-store-'));dirs.push(dir);const path=join(dir,'state.sqlite');
  const first=openStore(path);const task=first.createTask(input);
  first.enqueue({id:'cmd',taskId:task.id,kind:'start',expectedRevision:0,payload:{}});first.nextCommand();first.close();
  const second=openStore(path);
  try {
    expect(second.getTask(task.id).title).toBe('Filter');expect(second.runningCommands()).toHaveLength(1);
    expect(second.nextCommand()).toBeNull();expect(second.events(task.id,0)[0].type).toBe('task.created');
  } finally {second.close();}
});
test('invalid state is rejected atomically and task identity cannot be overwritten',()=>{
  const store=openStore(':memory:');
  try{
    const task=store.createTask(input);
    expect(()=>store.updateTask(task.id,0,{repairCount:-1},{type:'bad',data:{}})).toThrow();
    expect(()=>store.updateTask(task.id,0,{id:'other'},{type:'bad',data:{}})).toThrow('immutable_field');
    expect(store.getTask(task.id).revision).toBe(0);expect(store.events(task.id,0)).toHaveLength(1);
  }finally{store.close();}
});
