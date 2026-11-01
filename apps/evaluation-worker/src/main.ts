import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';
import { queue } from '../../../infrastructure/evaluation-transport/queue.ts';
import type { ExecutionPayload, ExecutionOutcome } from '../../../infrastructure/evaluation-transport/contracts.ts';
import { requireEnv } from '../../../infrastructure/runtime/config.ts';
import { runSandbox, reconcileSandboxes } from './sandbox.ts';

if(process.platform!=='linux')throw new Error('The evaluation worker requires the isolated Linux host.');
const url=requireEnv('WORKER_DATABASE_URL'),pool=new pg.Pool({connectionString:url,max:3}),boss=queue(url);
const leaseDirectory=resolve(requireEnv('MCJ_EVALUATOR_LEASE_DIRECTORY'));
await mkdir(leaseDirectory,{recursive:true});await reconcileSandboxes(leaseDirectory);
const controller=new AbortController();let busy=false,stopping=false;
process.once('SIGINT',()=>{stopping=true;controller.abort();});process.once('SIGTERM',()=>{stopping=true;controller.abort();});
await boss.start();
await boss.work<{requestId:string}>('cangjie-evaluate',{batchSize:1,pollingIntervalSeconds:1},async jobs=>{
  if(stopping||busy)return;
  busy=true;
  try {for(const job of jobs) {
    const row=(await pool.query('SELECT evaluation_exchange.claim_job($1) AS claim',[job.data.requestId])).rows[0]?.claim;
    if(!row)continue;
    const payload=row.payload as ExecutionPayload,generation=row.generation as number;
    if(payload.contractVersion!==1||payload.requestId!==job.data.requestId||payload.languageVersion!=='1.0.5'||payload.sourceHash!==createHash('sha256').update(payload.source).digest('hex'))throw new Error('Invalid execution contract.');
    const leaseController=new AbortController();
    const abortLease=()=>leaseController.abort();
    controller.signal.addEventListener('abort',abortLease,{once:true});
    if(controller.signal.aborted)leaseController.abort();
    const heartbeat=setInterval(()=>{void pool.query('SELECT evaluation_exchange.heartbeat($1,$2) AS alive',[payload.requestId,generation]).then(r=>{if(!r.rows[0].alive)leaseController.abort();}).catch(()=>leaseController.abort());},15000);
    const outcome:ExecutionOutcome={contractVersion:1,requestId:payload.requestId,sourceHash:payload.sourceHash,assessment:payload.assessment,generation,cases:[]};
    try {
      for(const test of payload.cases) {
        const evidence=await runSandbox({requestId:payload.requestId,generation,source:payload.source,inputBase64:test.inputBase64,
          image:requireEnv('MCJ_EVALUATOR_IMAGE'),runtime:requireEnv('MCJ_EVALUATOR_RUNTIME'),leaseDirectory},leaseController.signal);
        outcome.cases.push({caseId:test.id,...evidence});
        if(!evidence.cleanupConfirmed||['operational-error','interrupted'].includes(evidence.outcome))break;
      }
      const finished=await pool.query('SELECT evaluation_exchange.finish_job($1,$2,$3) AS accepted',[payload.requestId,generation,outcome]);
      if(!finished.rows[0].accepted)console.error('Expired execution evidence was refused.');
    } finally {clearInterval(heartbeat);controller.signal.removeEventListener('abort',abortLease);}
  }} finally {busy=false;}
});
console.log('Isolated Cangjie worker started; concurrency=1.');
await new Promise<void>(resolveStop=>{const timer=setInterval(()=>{if(stopping&&!busy){clearInterval(timer);resolveStop();}},100);});
await boss.stop();await pool.end();
