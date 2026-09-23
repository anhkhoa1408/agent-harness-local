import {test,expect} from 'vitest';import {writeFile,readFile,mkdir,symlink,mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createTempRepo} from '../support/temp-repo';import {taskFixture,planFixture} from '../support/task-fixture';import {inspectRepository} from '../../src/repositories/inspect';import {prepareWorktree} from '../../src/repositories/worktree';import {fingerprintWorktree} from '../../src/repositories/fingerprint';import {runProcess} from '../../src/execution/process';import {runChecks} from '../../src/execution/checks';
test('isolates dirty source, retries same worktree, fingerprints untracked and ignored tracked files',async()=>{
 const f=await createTempRepo({'app.js':'original','.gitignore':'build/\n'}),dir=await mkdtemp(join(tmpdir(),'worktrees'));
 try{const repo=await inspectRepository(f.root,'main',null);await writeFile(join(f.root,'app.js'),'dirty');const task=taskFixture({sourceCommit:repo.head});const path=await prepareWorktree(repo,task,dir);expect(await prepareWorktree(repo,task,dir)).toBe(path);expect(await readFile(join(path,'app.js'),'utf8')).toBe('original');const hash=await fingerprintWorktree(path);
 await mkdir(join(path,'build'));await writeFile(join(path,'build/out'),'generated');expect(await fingerprintWorktree(path)).toBe(hash);await writeFile(join(path,'new.js'),'new');expect(await fingerprintWorktree(path)).not.toBe(hash);
 await writeFile(join(path,'.gitignore'),'build/\napp.js\n');const before=await fingerprintWorktree(path);await writeFile(join(path,'app.js'),'changed ignored tracked');expect(await fingerprintWorktree(path)).not.toBe(before);
 await symlink('/etc',join(path,'escape'));await expect(runProcess({...planFixture().checks[0],cwd:'escape'},path,join(dir,'logs'),new AbortController().signal)).rejects.toThrow('path_outside_root');
 }finally{await f.dispose();await rm(dir,{recursive:true,force:true});}
});
test('argv spaces survive and abort terminates process group; legacy test never runs',async()=>{
 const f=await createTempRepo({'feature.test.cjs':"const {test}=require('node:test'); test('feature',()=>{});",'legacy.test.cjs':"throw Error('legacy fails')"}),dir=await mkdtemp(join(tmpdir(),'logs'));
 try{const spec=planFixture().checks[0];const result=await runProcess({...spec,executable:process.execPath,args:['-e','console.log(process.argv[1])','two words']},f.root,dir,new AbortController().signal);expect((await readFile(result.stdoutPath,'utf8')).trim()).toBe('two words');
 const stop=new AbortController();const pending=runProcess({...spec,executable:process.execPath,args:['-e','setInterval(()=>{},1000)']},f.root,dir,stop.signal);setTimeout(()=>stop.abort(),80);expect((await pending).exitCode).toBeNull();
 const checks=await runChecks(taskFixture({worktree:f.root}),planFixture({checks:[{...spec,executable:process.execPath,args:['--test','--test-reporter=tap','feature.test.cjs']}]}),new AbortController().signal,dir);expect(checks[0].status).toBe('passed');expect(checks).toHaveLength(1);
 }finally{await f.dispose();await rm(dir,{recursive:true,force:true});}
});
