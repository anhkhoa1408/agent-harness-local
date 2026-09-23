import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {RepoProfileSchema,type Repository,type ModelChoice} from '../core/contracts';
import type {AgentClient} from '../codex/client';
import type {Bundle} from '../context/skills';
import {composeInstructions} from '../context/prompts';
const exec=promisify(execFile);
export async function gitText(root:string,args:string[]):Promise<string>{return (await exec('git',['-C',root,...args],{maxBuffer:8*1024*1024})).stdout.trim();}
export async function inspectRepository(path:string,baseBranch:string,remote:string|null):Promise<Repository>{
 const root=await realpath(await gitText(path,['rev-parse','--show-toplevel']));
 await gitText(root,['check-ref-format','--branch',baseBranch]);
 const head=await gitText(root,['rev-parse','--verify',`${baseBranch}^{commit}`]);
 if(remote)await gitText(root,['remote','get-url',remote]);
 return {id:randomUUID(),root,baseBranch,remote,head,dirty:!!await gitText(root,['status','--porcelain=v1','-z'])};
}
export async function sourceDocuments(repo:Repository):Promise<{path:string;content:string}[]>{
 const paths=(await gitText(repo.root,['ls-tree','-r','--name-only','-z',repo.head])).split('\0').filter(Boolean);
 const docs:{path:string;content:string}[]=[];let total=0;
 for(const path of paths){if(/(^|\/)(\.env(?:\.|$)|node_modules\/|\.git\/)|\.(pem|key|p12|png|jpg|pdf|lock)$|(^|\/)(id_rsa|credentials)/i.test(path))continue;
   const size=Number(await gitText(repo.root,['cat-file','-s',`${repo.head}:${path}`]));if(size>64000||total+size>500000)continue;
   const content=await gitText(repo.root,['show',`${repo.head}:${path}`]);if(content.includes('\0'))continue;docs.push({path,content});total+=size;}
 return docs;
}
export async function discoverRepository(repo:Repository,client:AgentClient,bundle:Bundle,model:ModelChoice,signal:AbortSignal){
 const docs=await sourceDocuments(repo),snapshot=await mkdtemp(join(tmpdir(),'harness-discovery-'));
 try{
  for(const doc of docs){const target=join(snapshot,doc.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,doc.content);}
  const run=await client.run({cwd:snapshot,model,instructions:composeInstructions(bundle),prompt:`Inspect the committed source snapshot only. Do not run setup or commands. Return languages, areas, candidate argv commands, prerequisites, evidence paths and unknowns. Missing or truncated files are unknowns. repositoryId=${repo.id}; sourceCommit=${repo.head}`,outputSchema:z.toJSONSchema(RepoProfileSchema),write:false},()=>{},signal);
  const profile=RepoProfileSchema.parse(run.result);if(profile.repositoryId!==repo.id||profile.sourceCommit!==repo.head||profile.evidence.some(e=>!docs.some(d=>d.path===e.path)))throw new Error('invalid_profile_evidence');return profile;
 }finally{await rm(snapshot,{recursive:true,force:true});}
}
