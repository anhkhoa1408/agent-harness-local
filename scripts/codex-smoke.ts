import {connectCodex} from '../src/codex/client';
const args=process.argv.slice(2);const value=(flag:string)=>args[args.indexOf(flag)+1];
const client=await connectCodex();
try{
  if(args.includes('--catalog'))console.log(JSON.stringify(await client.models(),null,2));
  else if(args.includes('--read-only')&&args.includes('--model')&&args.includes('--effort')){
    const run=await client.run({cwd:process.cwd(),model:{model:value('--model'),effort:value('--effort')},write:false,instructions:'Read only. Never modify files or run repository setup.',prompt:'Describe this repository briefly. Return a JSON object with a summary string.',outputSchema:{type:'object',properties:{summary:{type:'string'}},required:['summary'],additionalProperties:false}},()=>{},AbortSignal.timeout(60000));
    console.log(JSON.stringify(run.result,null,2));
  }else throw new Error('Use --catalog or --read-only --model ID --effort LEVEL');
}finally{await client.close();}
