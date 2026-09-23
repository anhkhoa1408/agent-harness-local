import {resolve,join} from 'node:path';
import {openStore} from '../storage/store';
import {runWorker} from './engine';import {unavailableHandlers} from './stages';
const data=resolve(process.env.HARNESS_DATA_DIR??'.harness'),store=openStore(join(data,'harness.db')),abort=new AbortController();
process.on('SIGINT',()=>abort.abort());process.on('SIGTERM',()=>abort.abort());
try{await runWorker(store,unavailableHandlers(),abort.signal);}finally{store.close();}
