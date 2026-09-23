import {lstat,readFile,readlink} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';import {gitText} from './inspect';
export async function fingerprintWorktree(path:string,excluded:string[]=[],sourceCommit?:string):Promise<string>{
 const tracked=(await gitText(path,['ls-files','-z'])).split('\0').filter(Boolean),untracked=(await gitText(path,['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(Boolean).filter(p=>!excluded.includes(p));
 const hash=createHash('sha256');hash.update(sourceCommit??await gitText(path,['rev-parse','HEAD']));
 for(const file of [...new Set([...tracked,...untracked])].sort()){
  hash.update(JSON.stringify(file));try{const info=await lstat(join(path,file));hash.update(JSON.stringify([info.mode&0o111,info.isSymbolicLink()]));if(info.isSymbolicLink())hash.update(await readlink(join(path,file)));else if(info.isFile())hash.update(await readFile(join(path,file)));else hash.update('directory');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;hash.update('deleted');}
 }return hash.digest('hex');
}
