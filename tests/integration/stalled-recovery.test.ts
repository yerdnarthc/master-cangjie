import { beforeEach, afterEach, it, expect } from 'vitest';
import type pg from 'pg';
import type { ExecutionOutcome } from '../../infrastructure/evaluation-transport/contracts.ts';
import { testDatabase, fixture } from './database.ts';
import { PostgresSubmissions, hash } from '../../modules/topic-submission/adapters/postgres.ts';
import { assessmentFor } from '../../modules/roadmap/application/content.ts';
import { dispatch, ingestAvailable } from '../../infrastructure/evaluation-transport/postgres.ts';
import { queue } from '../../infrastructure/evaluation-transport/queue.ts';
import { requireEnv } from '../../infrastructure/runtime/config.ts';
let pool:pg.Pool, app:PostgresSubmissions, boss:ReturnType<typeof queue>;
beforeEach(async()=>{pool=await testDatabase();app=new PostgresSubmissions(pool);boss=queue(requireEnv('TEST_DATABASE_URL'));await boss.start();});
afterEach(async()=>{await boss?.stop();await pool?.end();});
const source='main(): Int64 { println("Hello, World!"); return 0 }';
async function pending() {
 const actor=await fixture(pool),a=await assessmentFor(pool);
 const saved=await app.save(actor,{problemId:a.problemId,baseRevision:0,source});
 const request={requestKey:crypto.randomUUID(),problemId:a.problemId,workRevision:saved.kind==='saved'?saved.workRevision:-1,assessment:{topicId:a.topicId,revision:a.revision},kind:'batch' as const};
 return {actor,a,request,op:await app.request(actor,request)};
}
async function age(id:string){await pool.query("UPDATE evaluation_attempts SET created_at=now()-interval '1 day' WHERE id=$1",[id]);}
async function finish(p:Awaited<ReturnType<typeof pending>>,failure=false){
 const claim=(await pool.query('SELECT evaluation_exchange.claim_job($1) AS claim',[p.op.operationId])).rows[0].claim;
 expect(claim).toBeTruthy();
 const outcome:ExecutionOutcome={contractVersion:1,requestId:p.op.operationId,sourceHash:hash(source),assessment:p.request.assessment,generation:claim.generation,cases:[{caseId:p.a.tests[0].id,outcome:failure?'operational-error':'completed',stdoutBase64:failure?'':Buffer.from('Hello, World!\n').toString('base64'),compilerVersion:'1.0.5',imageId:'audit-fixture',diagnostics:'',cleanupConfirmed:true}]};
 expect((await pool.query('SELECT evaluation_exchange.finish_job($1,$2,$3) AS accepted',[p.op.operationId,claim.generation,outcome])).rows[0].accepted).toBe(true);
 return outcome;
}
it('makes a never-dispatched stale operation retryable through status reads without jobs',async()=>{
 const p=await pending();await age(p.op.operationId);
 const read=await app.read(p.actor,p.op.operationId);expect(read.state).toBe('retryable-error');expect(read.score).toBeUndefined();
 expect((await app.workspace(p.actor)).latestEvaluation?.state).toBe('retryable-error');
 const retry=await app.retry(p.actor,p.op.operationId);expect(retry.operationId).toBe(p.op.operationId);expect(retry.state).toBe('pending');
 expect((await app.read(p.actor,p.op.operationId)).state).toBe('pending');
 const row=(await pool.query('SELECT * FROM evaluation_attempts WHERE id=$1',[p.op.operationId])).rows[0];expect(new Date(row.created_at).getTime()).toBeLessThan(Date.now()-3600000);
});
it('fences unclaimed stale dispatch so old notifications cannot claim before explicit retry',async()=>{
 const p=await pending();await dispatch(pool,boss);await age(p.op.operationId);
 expect((await app.read(p.actor,p.op.operationId)).state).toBe('retryable-error');
 expect((await pool.query('SELECT evaluation_exchange.claim_job($1) AS claim',[p.op.operationId])).rows[0].claim).toBeNull();
 await app.retry(p.actor,p.op.operationId);await finish(p);await ingestAvailable(pool,app);
 expect((await app.read(p.actor,p.op.operationId)).score).toEqual({earned:10,possible:10});
});
it('preserves a live lease and durable outcome even for an old operation',async()=>{
 const p=await pending();await dispatch(pool,boss);await age(p.op.operationId);
 const claim=(await pool.query('SELECT evaluation_exchange.claim_job($1) AS claim',[p.op.operationId])).rows[0].claim;
 expect((await app.read(p.actor,p.op.operationId)).state).toBe('pending');
 expect((await pool.query('SELECT evaluation_exchange.heartbeat($1,$2) AS alive',[p.op.operationId,claim.generation])).rows[0].alive).toBe(true);
 const outcome:ExecutionOutcome={contractVersion:1,requestId:p.op.operationId,sourceHash:hash(source),assessment:p.request.assessment,generation:claim.generation,cases:[{caseId:p.a.tests[0].id,outcome:'completed',stdoutBase64:Buffer.from('Hello, World!\n').toString('base64'),compilerVersion:'1.0.5',imageId:'audit-fixture',diagnostics:'',cleanupConfirmed:true}]};
 await pool.query('SELECT evaluation_exchange.finish_job($1,$2,$3)',[p.op.operationId,claim.generation,outcome]);
 expect((await pool.query('SELECT state FROM evaluation_attempts WHERE id=$1',[p.op.operationId])).rows[0].state).toBe('pending');await ingestAvailable(pool,app);
 expect((await app.read(p.actor,p.op.operationId)).state).toBe('confirmed');
});
it('fences expired exhausted claims and resumes all submissions when shared evaluation is retried',async()=>{
 const p=await pending();const review=await app.review(p.actor,p.a.topicId);
 const sub=await app.confirm(p.actor,{requestKey:crypto.randomUUID(),reviewToken:review.reviewToken,acknowledgeUnattempted:false});
 await dispatch(pool,boss);const claim=(await pool.query('SELECT evaluation_exchange.claim_job($1) AS claim',[p.op.operationId])).rows[0].claim;
 await pool.query("UPDATE evaluation_exchange.jobs SET deliveries=3,lease_until=now()-interval '1 second' WHERE id=$1",[p.op.operationId]);
 expect((await app.read(p.actor,sub.operationId)).state).toBe('retryable-error');
 expect((await pool.query('SELECT evaluation_exchange.finish_job($1,$2,$3) AS accepted',[p.op.operationId,claim.generation,{}])).rows[0].accepted).toBe(false);
 await app.retry(p.actor,p.op.operationId);await finish(p);await ingestAvailable(pool,app);
 expect((await app.read(p.actor,sub.operationId)).state).toBe('confirmed');expect((await app.workspace(p.actor)).progress.completed).toBe(true);
});
it('resumes an original failed submission after its shared batch succeeds and retry is repeated',async()=>{
 const p=await pending();const review=await app.review(p.actor,p.a.topicId),args={requestKey:crypto.randomUUID(),reviewToken:review.reviewToken,acknowledgeUnattempted:false};
 const sub=await app.confirm(p.actor,args);await dispatch(pool,boss);await finish(p,true);await ingestAvailable(pool,app);
 expect((await app.read(p.actor,sub.operationId)).state).toBe('retryable-error');
 await app.retry(p.actor,p.op.operationId);await finish(p);await ingestAvailable(pool,app);await app.continueSubmissions();
 expect((await app.read(p.actor,sub.operationId)).state).toBe('confirmed');expect((await app.confirm(p.actor,args)).operationId).toBe(sub.operationId);
 expect(Number((await pool.query('SELECT count(*) FROM topic_submissions WHERE learner_id=$1',[p.actor.learnerId])).rows[0].count)).toBe(1);
});
it('retains unconsumed evidence when ingestion encounters a transient failure',async()=>{
 const p=await pending();await dispatch(pool,boss);await finish(p);
 const failing=new PostgresSubmissions(pool);failing.ingest=async()=>{throw new Error('temporary database interruption');};
 await expect(ingestAvailable(pool,failing)).rejects.toThrow('temporary database interruption');
 const job=(await pool.query('SELECT * FROM evaluation_exchange.jobs WHERE id=$1',[p.op.operationId])).rows[0];expect(job.acknowledged).toBe(false);expect(job.outcome).toBeTruthy();
 expect((await pool.query('SELECT state FROM evaluation_attempts WHERE id=$1',[p.op.operationId])).rows[0].state).toBe('pending');await ingestAvailable(pool,app);expect((await app.read(p.actor,p.op.operationId)).state).toBe('confirmed');
});

it('serializes stale recovery with a racing worker claim',async()=>{
 const p=await pending();await dispatch(pool,boss);await age(p.op.operationId);
 const [read,claim]=await Promise.all([app.read(p.actor,p.op.operationId),pool.query('SELECT evaluation_exchange.claim_job($1) AS claim',[p.op.operationId])]);
 const worker=claim.rows[0].claim;
 if(worker)expect(read.state).toBe('pending');
 else expect(read.state).toBe('retryable-error');
});
it('rechecks a heartbeat committed while stale recovery waits for the exchange lock',async()=>{
 const p=await pending();await dispatch(pool,boss);await age(p.op.operationId);
 const claim=(await pool.query('SELECT evaluation_exchange.claim_job($1) AS claim',[p.op.operationId])).rows[0].claim;
 const client=await pool.connect();
 try {
  await client.query('BEGIN');await client.query('SELECT id FROM evaluation_exchange.jobs WHERE id=$1 FOR UPDATE',[p.op.operationId]);
  const reading=app.read(p.actor,p.op.operationId);
  expect((await client.query('SELECT evaluation_exchange.heartbeat($1,$2) AS alive',[p.op.operationId,claim.generation])).rows[0].alive).toBe(true);await client.query('COMMIT');
  expect((await reading).state).toBe('pending');
  expect((await pool.query('SELECT evaluation_exchange.heartbeat($1,$2) AS alive',[p.op.operationId,claim.generation])).rows[0].alive).toBe(true);
 }finally{await client.query('ROLLBACK');client.release();}
});
it('does not reject or acknowledge a newer generation using a stale ingestion snapshot',async()=>{
 const p=await pending();await dispatch(pool,boss);const old=await finish(p,true);await ingestAvailable(pool,app);
 await app.retry(p.actor,p.op.operationId);const fresh=await finish(p);
 await app.ingest(p.op.operationId,old,old.generation);await app.rejectEvidence(p.op.operationId,old,old.generation);
 const row=(await pool.query('SELECT * FROM evaluation_exchange.jobs WHERE id=$1',[p.op.operationId])).rows[0];
 expect(row.acknowledged).toBe(false);expect(row.generation).toBe(fresh.generation);
 await ingestAvailable(pool,app);expect((await app.read(p.actor,p.op.operationId)).score).toEqual({earned:10,possible:10});
});
it('rejects malformed current evidence as unevaluated, then permits an explicit retry',async()=>{
 const p=await pending();await dispatch(pool,boss);
 const claim=(await pool.query('SELECT evaluation_exchange.claim_job($1) AS claim',[p.op.operationId])).rows[0].claim;
 await pool.query('SELECT evaluation_exchange.finish_job($1,$2,$3)',[p.op.operationId,claim.generation,{contractVersion:1,cases:null}]);
 await ingestAvailable(pool,app);const result=await app.read(p.actor,p.op.operationId);expect(result.state).toBe('retryable-error');expect(result.score).toBeUndefined();
 await app.retry(p.actor,p.op.operationId);await finish(p);await ingestAvailable(pool,app);expect((await app.read(p.actor,p.op.operationId)).state).toBe('confirmed');
});

it('reserves the shared validation window when retrying a failed batch',async()=>{
 const p=await pending();await dispatch(pool,boss);await finish(p,true);await ingestAvailable(pool,app);
 await app.retry(p.actor,p.op.operationId);await pool.query('UPDATE validation_windows SET last_manual_at=NULL WHERE learner_id=$1',[p.actor.learnerId]);
 await expect(app.request(p.actor,{...p.request,requestKey:crypto.randomUUID()})).rejects.toThrow('already pending');
});
it('rejects retry when a different batch already occupies the validation window',async()=>{
 const p=await pending();await dispatch(pool,boss);await finish(p,true);await ingestAvailable(pool,app);
 await pool.query('UPDATE validation_windows SET last_manual_at=NULL WHERE learner_id=$1',[p.actor.learnerId]);
 const next=await app.request(p.actor,{...p.request,requestKey:crypto.randomUUID()});
 await expect(app.retry(p.actor,p.op.operationId)).rejects.toThrow('already pending');
 expect((await app.read(p.actor,next.operationId)).state).toBe('pending');
});

it('accepts the persisted outcome independent of JSON object key order',async()=>{
 const p=await pending();await dispatch(pool,boss);const outcome=await finish(p);
 await app.ingest(p.op.operationId,outcome,outcome.generation);
 expect((await app.read(p.actor,p.op.operationId)).state).toBe('confirmed');
});

it('status and workspace ingest durable evidence and finalize without the jobs host',async()=>{
 const p=await pending();const review=await app.review(p.actor,p.a.topicId);
 const sub=await app.confirm(p.actor,{requestKey:crypto.randomUUID(),reviewToken:review.reviewToken,acknowledgeUnattempted:false});
 await dispatch(pool,boss);await finish(p);
 expect((await app.read(p.actor,p.op.operationId)).state).toBe('confirmed');
 expect((await app.read(p.actor,sub.operationId)).state).toBe('confirmed');
 expect((await app.workspace(p.actor)).progress.completed).toBe(true);
});

it('allows ingestion achievement foreign keys while status recovery holds the learner lock',async()=>{
 const p=await pending(),client=await pool.connect();let reading:ReturnType<typeof app.read>|undefined;
 try {
  await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='3s'");
  await client.query('SELECT id FROM evaluation_attempts WHERE id=$1 FOR UPDATE',[p.op.operationId]);
  reading=app.read(p.actor,p.op.operationId);
  const deadline=Date.now()+2000;
  while(Date.now()<deadline) {
   const wait=(await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%COALESCE(retry_requested_at,created_at)%'")).rows[0].n;
   if(wait)break;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  await client.query('INSERT INTO solved_achievements VALUES($1,$2,$3)',[p.actor.learnerId,p.a.problemId,p.op.operationId]);
  await client.query('COMMIT');await reading;
 }finally{await client.query('ROLLBACK');client.release();await reading?.catch(()=>undefined);}
});
