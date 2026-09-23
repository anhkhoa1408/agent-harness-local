import {stages} from '../core/contracts';import type {Handlers} from './engine';
export function unavailableHandlers():Handlers{return Object.fromEntries(stages.map(stage=>[stage,async()=>({stage,status:'blocked',reason:'capability_unavailable',output:null})])) as unknown as Handlers;}
