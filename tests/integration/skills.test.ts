import {test,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {resolveBundle,snapshotBundle} from '../../src/context/skills';
test('snapshots remain unchanged after installed skill edits and include scoped nested rules',async()=>{
  const root=await mkdtemp(join(tmpdir(),'harness-skills-'));
  try{
    const skills=join(root,'skills'),repo=join(root,'repo');
    await mkdir(join(skills,'test-driven-development'),{recursive:true});await mkdir(join(repo,'src'),{recursive:true});
    await writeFile(join(root,'baseline.md'),'## 1. Rules\nKeep scope.\n## 7. Workspace only\nPrivate spec pointer.');
    await writeFile(join(skills,'test-driven-development/SKILL.md'),'Test before code.');
    await writeFile(join(skills,'test-driven-development/writing-good-tests.md'),'Test real behavior.');
    await writeFile(join(repo,'AGENTS.md'),'Root conventions.');await writeFile(join(repo,'src/AGENTS.md'),'Nested conventions.');
    const bundle=await resolveBundle('implement',{superpowers:skills,baseline:join(root,'baseline.md')},repo,['src/page.ts'],false);
    expect(bundle.files.map(x=>x.content).join('\n')).not.toContain('Private spec pointer');
    expect(bundle.files.some(x=>x.content==='Nested conventions.')).toBe(true);
    const artifact=await snapshotBundle(bundle,join(root,'artifacts'));
    await writeFile(join(skills,'test-driven-development/SKILL.md'),'Different policy.');
    expect(JSON.parse(await readFile(artifact,'utf8')).hash).toBe(bundle.hash);
    expect((await resolveBundle('implement',{superpowers:skills,baseline:join(root,'baseline.md')},repo,['src/page.ts'],false)).hash).not.toBe(bundle.hash);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('missing required skill and conditional Lighthouse rule block instead of disappearing',async()=>{
  const root=await mkdtemp(join(tmpdir(),'harness-rules-'));
  try{
    await writeFile(join(root,'baseline.md'),'Base.');
    await expect(resolveBundle('discover',{baseline:join(root,'baseline.md')},root,[],false)).resolves.toHaveProperty('stage','discover');
    await expect(resolveBundle('discover',{baseline:join(root,'baseline.md')},root,[],true)).rejects.toThrow('rule_unavailable');
    await expect(resolveBundle('implement',{baseline:join(root,'baseline.md')},root,[],false)).rejects.toThrow('skill_unavailable');
    await symlink('/etc',join(root,'outside'));
    await expect(resolveBundle('discover',{baseline:join(root,'baseline.md')},root,['outside/passwd'],false)).rejects.toThrow('path_outside_root');
  }finally{await rm(root,{recursive:true,force:true});}
});
