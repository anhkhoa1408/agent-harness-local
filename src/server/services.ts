import type {Store} from '../storage/store';
import {inspectRepository} from '../repositories/inspect';
export function createServices(store:Store){return {
 async registerRepository(input:{path:string;baseBranch:string;remote:string|null}){const repo=await inspectRepository(input.path,input.baseBranch,input.remote);store.putRecord('repository',repo.id,repo);return repo;},
};}
