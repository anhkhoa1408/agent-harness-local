import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {PlanSchema,ReviewSchema,RepositorySchema,type Task} from '../core/contracts';import type {Store} from '../storage/store';import {acceptanceErrors} from '../core/acceptance';import type {CheckResult} from '../execution/checks';import {gitText} from '../repositories/inspect';import {fingerprintWorktree} from '../repositories/fingerprint';import {renderReport} from './report';
export type Delivery={mode:'github'|'local';commit:string;reportPath:string;prUrl:string|null};
export interface GitHubPort{findPullRequest(repo:string,head:string,base:string):Promise<{url:string;headCommit:string}|null>;createPullRequest(input:{repo:string;head:string;base:string;title:string;bodyFile:string}):Promise<string>;}
const exec=promisify(execFile),marker=(head:string)=>`<!-- agent-harness:branch:${head} -->`;
async function gh(args:string[]){return (await exec('gh',args,{maxBuffer:4*1024*1024})).stdout.trim();}
export const githubCli:GitHubPort={
 async findPullRequest(repo,head,base){const list=JSON.parse(await gh(['pr','list','--repo',repo,'--head',head,'--base',base,'--state','all','--json','url,headRefOid,state,body'])) as {url:string;headRefOid:string;state:string;body:string}[];
  if(!list.length)return null;const own=list.find(p=>p.body.includes(marker(head)));if(!own||own.state!=='OPEN')throw new Error('pull_request_collision');return {url:own.url,headCommit:own.headRefOid};},
 async createPullRequest(i){return gh(['pr','create','--repo',i.repo,'--head',i.head,'--base',i.base,'--title',i.title,'--body-file',i.bodyFile]);},
};
export function githubRepository(url:string){const match=/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(url);if(!match)throw new Error('delivery_error:remote_not_github');return match[1];}
export function createDelivery(store:Store,data:string,options:{github?:GitHubPort;repositoryName?:(url:string)=>string}={}){
 return async function deliver(task:Task,signal:AbortSignal):Promise<Delivery>{
  signal.throwIfAborted();if(!task.worktree)throw new Error('worktree_missing');const path=task.worktree,repo=RepositorySchema.parse(store.getRecord('repository',task.repositoryId)),plan=PlanSchema.parse(store.getRecord('plan',`${task.id}:${task.planVersion}`)),review=ReviewSchema.parse(store.getRecord('review',task.id)),checks=store.getRecord('checks',task.id) as CheckResult[];
  const exclusions=plan.checks.flatMap(c=>c.reportPath?[c.reportPath]:[]),fingerprint=()=>fingerprintWorktree(path,exclusions,task.sourceCommit),before=await fingerprint();
  const errors=acceptanceErrors(task,plan,checks,review,before);if(errors.length)throw new Error(`acceptance_failed:${errors.join(',')}`);
  if(await gitText(path,['branch','--show-current'])!==task.branch)throw new Error('branch_collision');
  const changed=[...(await gitText(path,['diff','--name-only',task.sourceCommit,'--'])).split('\n'),...(await gitText(path,['ls-files','--others','--exclude-standard'])).split('\n')].filter(Boolean).filter(p=>!exclusions.includes(p)),allowed=plan.steps.flatMap(s=>s.files);
  if(changed.some(p=>!allowed.some(a=>p===a||a.endsWith('/')&&p.startsWith(a))))throw new Error('scope_changed_requires_plan');
  const commitKey=`${task.id}:commit:${before}`,commitEffect=store.getRecord('effect',commitKey) as {state:string;commit?:string;parent:string}|null;
  let head=await gitText(path,['rev-parse','HEAD']);
  if(commitEffect?.state==='confirmed'){if(head!==commitEffect.commit)throw new Error('local_head_changed');}
  else{
   const parent=commitEffect?.parent??head;if(!commitEffect)store.putRecord('effect',commitKey,{state:'intent',parent});
   if(head!==parent){if(await gitText(path,['show','-s','--format=%B','HEAD'])!==`feat: ${task.title}\n\nHarness-Task: ${task.id}`)throw new Error('local_head_changed');}
   else if((await gitText(path,['status','--porcelain']))&&changed.length){
    await gitText(path,['add','--',...changed]);await gitText(path,['commit','-m',`feat: ${task.title}\n\nHarness-Task: ${task.id}`]);head=await gitText(path,['rev-parse','HEAD']);}
   if(await fingerprint()!==before)throw new Error('source_changed_during_commit');store.putRecord('effect',commitKey,{state:'confirmed',parent,commit:head});
  }
  const folder=join(data,'artifacts',task.id);await mkdir(folder,{recursive:true});const reportPath=join(folder,`delivery-v${plan.version}.md`);
  await writeFile(reportPath,`${marker(task.branch)}\n\n${renderReport(plan,checks,review)}\n\nTarget: ${task.targetBranch}; branch: ${task.branch}; commit: ${head}.\n`,{mode:0o600});
  store.putRecord('artifact',`${task.id}-delivery`,{id:`${task.id}-delivery`,taskId:task.id,path:reportPath,type:'report'});
  if(task.deliveryMode==='local'||!repo.remote)return {mode:'local',commit:head,reportPath,prUrl:null};
  const remote=repo.remote,url=await gitText(path,['remote','get-url',remote]),name=(options.repositoryName??githubRepository)(url),github=options.github??githubCli;
  const remoteHead=async()=>{const text=await gitText(path,['ls-remote','--heads',remote,`refs/heads/${task.branch}`]);return text.split(/\s/)[0]||null;};
  const pushKey=`${task.id}:push:${head}:${task.branch}`,pushEffect=store.getRecord('effect',pushKey) as {state:string}|null;const actual=await remoteHead();
  if(actual&&actual!==head)throw new Error('remote_head_changed');
  if(!actual){if(pushEffect?.state==='confirmed')throw new Error('remote_head_changed');store.putRecord('effect',pushKey,{state:'intent',commit:head,head:task.branch});signal.throwIfAborted();await gitText(path,['push',remote,`HEAD:refs/heads/${task.branch}`]);}
  if(await remoteHead()!==head)throw new Error('remote_head_changed');store.putRecord('effect',pushKey,{state:'confirmed',commit:head});
  const prKey=`${task.id}:pr:${head}:${task.branch}:${task.targetBranch}`;let existing=await github.findPullRequest(name,task.branch,task.targetBranch);
  if(existing&&existing.headCommit!==head)throw new Error('pull_request_head_changed');
  if(!existing){store.putRecord('effect',prKey,{state:'intent',commit:head,head:task.branch,base:task.targetBranch});signal.throwIfAborted();await github.createPullRequest({repo:name,head:task.branch,base:task.targetBranch,title:task.title,bodyFile:reportPath});existing=await github.findPullRequest(name,task.branch,task.targetBranch);if(!existing||existing.headCommit!==head)throw new Error('pull_request_unconfirmed');}
  store.putRecord('effect',prKey,{state:'confirmed',url:existing.url,commit:head});return {mode:'github',commit:head,reportPath,prUrl:existing.url};
 };
}
