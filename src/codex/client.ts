import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import type {ModelChoice} from '../core/contracts';
import type {ModelInfo} from '../core/model-policy';
import {JsonRpc} from './rpc';
export type AgentInput={cwd:string;model:ModelChoice;instructions:string;prompt:string;outputSchema:Record<string,unknown>;write:boolean;threadId?:string};
export type AgentEvent={type:'started'|'message'|'tool'|'approval'|'completed'|'error';data:any};
export type AgentRun={threadId:string;turnId:string;result:unknown;usage:unknown};
export interface AgentClient{
  models():Promise<ModelInfo[]>;
  run(input:AgentInput,onEvent:(event:AgentEvent)=>void,signal:AbortSignal):Promise<AgentRun>;
  answer(id:string|number,result:unknown):Promise<void>;
  interrupt(threadId:string,turnId:string):Promise<void>;
  close():Promise<void>;
}
export class CodexClient implements AgentClient {
  constructor(private rpc:JsonRpc,private options:{interruptTimeoutMs?:number;process?:ChildProcessWithoutNullStreams}={}){}
  async initialize(){await this.rpc.request('initialize',{clientInfo:{name:'agent-harness',version:'0.1.0'}});this.rpc.notify('initialized');}
  async models():Promise<ModelInfo[]>{
    const models:ModelInfo[]=[];let cursor:string|null=null;const seen=new Set<string>();
    do{
      const page=await this.rpc.request('model/list',{limit:100,includeHidden:false,...(cursor?{cursor}:{})});
      for(const m of page.data??[])models.push({id:m.model??m.id,efforts:(m.supportedReasoningEfforts??[]).map((e:any)=>e.reasoningEffort),isDefault:!!m.isDefault});
      cursor=page.nextCursor??null;if(cursor&&seen.has(cursor))throw new Error('runtime_catalog_cycle');if(cursor)seen.add(cursor);
    }while(cursor);return models;
  }
  async run(input:AgentInput,onEvent:(e:AgentEvent)=>void,signal:AbortSignal):Promise<AgentRun>{
    if(signal.aborted)throw new Error('interrupted');
    const thread=await this.rpc.request(input.threadId?'thread/resume':'thread/start',{
      ...(input.threadId?{threadId:input.threadId}:{}),cwd:input.cwd,model:input.model.model,
      sandbox:input.write?'workspace-write':'read-only',approvalPolicy:'on-request',developerInstructions:input.instructions,
    });
    const threadId=thread.thread.id as string;
    return new Promise<AgentRun>((resolve,reject)=>{
      let turnId='',lastText='',usage:unknown=null,finished=false,interrupting=false;
      let timer:ReturnType<typeof setTimeout>|undefined;
      const cleanup=()=>{if(timer)clearTimeout(timer);offMessage();offFailure();signal.removeEventListener('abort',abort);};
      const fail=(error:Error)=>{if(finished)return;finished=true;cleanup();reject(error);};
      const abort=()=>{
        if(!turnId||interrupting||finished)return;interrupting=true;
        timer=setTimeout(()=>fail(new Error('runtime_state_unknown')),this.options.interruptTimeoutMs??10000);
        this.interrupt(threadId,turnId).catch(()=>fail(new Error('runtime_state_unknown')));
      };
      const offFailure=this.rpc.onFailure(()=>fail(new Error('runtime_state_unknown')));
      const offMessage=this.rpc.onMessage(m=>{
        const p=m.params??{};
        if(p.threadId!==threadId)return;
        if(m.id!==undefined){onEvent({type:'approval',data:{requestId:m.id,method:m.method,params:p}});return;}
        if(m.method==='thread/tokenUsage/updated')usage=p.tokenUsage;
        if(m.method==='item/completed'&&p.item?.type==='agentMessage')lastText=p.item.text;
        if(m.method==='item/agentMessage/delta')onEvent({type:'message',data:{text:p.delta}});
        if(m.method==='item/started'||m.method==='item/completed')onEvent({type:'tool',data:{method:m.method,...p}});
        if(m.method==='turn/completed'){
          const id=p.turn?.id??p.turnId;if(turnId&&id!==turnId)return;turnId=id;
          if(p.turn?.status==='interrupted'){fail(new Error('interrupted'));return;}
          if(p.turn?.status!=='completed'){fail(new Error(p.turn?.error?.message??'agent_failed'));return;}
          try{
            const result=JSON.parse(lastText);finished=true;cleanup();onEvent({type:'completed',data:{threadId,turnId}});resolve({threadId,turnId,result,usage});
          }catch{fail(new Error('agent_invalid_output'));}
        }
      });
      signal.addEventListener('abort',abort,{once:true});
      this.rpc.request('turn/start',{threadId,model:input.model.model,effort:input.model.effort,input:[{type:'text',text:input.prompt}],outputSchema:input.outputSchema}).then(response=>{
        turnId=response.turn.id;onEvent({type:'started',data:{threadId,turnId}});if(signal.aborted)abort();
      }).catch(fail);
    });
  }
  async answer(id:string|number,result:unknown){this.rpc.respond(id,result);}
  async interrupt(threadId:string,turnId:string){await this.rpc.request('turn/interrupt',{threadId,turnId});}
  async close(){this.rpc.close();this.options.process?.kill('SIGTERM');}
}
export async function connectCodex(binary=process.env.CODEX_BIN??'codex'):Promise<CodexClient>{
  const child=spawn(binary,['app-server','--stdio'],{stdio:['pipe','pipe','pipe'],shell:false});
  const rpc=new JsonRpc(child.stdout,child.stdin);child.on('error',()=>rpc.fail(new Error('codex_unavailable')));
  // Drain stderr without exposing credential-bearing runtime diagnostics to browser logs.
  child.stderr.on('data',()=>{});
  const client=new CodexClient(rpc,{process:child});
  try{await client.initialize();return client;}catch(error){await client.close();throw error;}
}
