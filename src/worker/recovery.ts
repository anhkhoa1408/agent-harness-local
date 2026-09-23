export type RecoveryObservation={agent:'stopped'|'running'|'unknown';process:'stopped'|'running'|'unknown';effect:'absent'|'confirmed'|'unknown'};
export function decideRecovery(o:RecoveryObservation):'resume'|'wait'|'reconcile'{if(o.agent!=='stopped'||o.process!=='stopped')return 'wait';return o.effect==='unknown'?'reconcile':'resume';}
