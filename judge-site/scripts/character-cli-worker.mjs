import {parentPort} from 'node:worker_threads';
import {runLocalJob} from '../public/quality/worker.mjs';
parentPort.once('message',async job=>{try{parentPort.postMessage({ok:true,value:await runLocalJob(job)});}catch(e){parentPort.postMessage({ok:false,code:e.code??'EVALUATION_FAILED',message:e.message});}});
