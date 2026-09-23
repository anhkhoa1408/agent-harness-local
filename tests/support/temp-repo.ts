import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
export async function createTempRepo(files:Record<string,string>){
 const root=await realpath(await mkdtemp(join(tmpdir(),'harness repo ')));
 for(const [path,content] of Object.entries(files)){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),content);}
 for(const args of [['init','-b','main'],['config','user.name','Fixture'],['config','user.email','fixture@example.test'],['add','.'],['commit','--allow-empty','-m','fixture']])execFileSync('git',args,{cwd:root,stdio:'ignore'});
 return {root,dispose:()=>rm(root,{recursive:true,force:true})};
}
