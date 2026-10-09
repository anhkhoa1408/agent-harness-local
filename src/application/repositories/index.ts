import type {Repository} from "../../domain/contracts";
import type {ApplicationStore} from "../ports";
export type RegistrationInput={path:string;baseBranch:string;remote:string|null};
export interface RepositoryRegistrationPort {inspect(input:RegistrationInput):Promise<Repository>;}
export interface RepositoryArtifactPort {removeTaskArtifacts(taskId:string):void;}
export class RepositoryRegistrationError extends Error {
 constructor(public readonly code:string,message:string){super(message);this.name="RepositoryRegistrationError";}
}
export class RepositoryService {
 constructor(private readonly data:ApplicationStore,private readonly registration:RepositoryRegistrationPort,private readonly artifacts:RepositoryArtifactPort){}
 list(){return this.data.repositories.list();}
 async registerRepository(input:RegistrationInput){const repo=await this.registration.inspect(input);this.data.repositories.put(repo.id,repo);return repo;}
 remove(id:string){return this.data.atomic(()=>{const ids=this.data.registry.remove(id);for(const id of ids)this.artifacts.removeTaskArtifacts(id);return ids.length;});}
}
