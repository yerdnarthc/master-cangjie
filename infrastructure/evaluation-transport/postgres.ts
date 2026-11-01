import type pg from 'pg';
import { transaction } from '../persistence/connection.ts';
import { PgBoss } from 'pg-boss';
import { assessmentFor } from '../../modules/roadmap/application/content.ts';
import { PostgresSubmissions, InvalidExecutionEvidence, hash } from '../../modules/topic-submission/adapters/postgres.ts';
import type { ExecutionPayload, ExecutionOutcome } from './contracts.ts';

export async function dispatch(pool:pg.Pool,boss:PgBoss) {
  const rows=(await pool.query(`SELECT e.id,e.context FROM evaluation_attempts e JOIN evaluation_dispatch d ON d.evaluation_id=e.id
    LEFT JOIN evaluation_exchange.jobs j ON j.id=e.id WHERE e.state='pending' AND j.outcome IS NULL
    AND (j.lease_until IS NULL OR j.lease_until<=now()) AND (d.notified_at IS NULL OR d.notified_at<now()-interval '10 seconds') LIMIT 20`)).rows;
  for(const e of rows) {
    const a=await assessmentFor(pool,e.context.assessment.topicId,e.context.assessment.revision);
    const payload:ExecutionPayload={contractVersion:1,requestId:e.id,source:e.context.source,sourceHash:hash(e.context.source),assessment:e.context.assessment,caseIds:e.context.caseIds,
      languageVersion:'1.0.5',cases:a.tests.filter(t=>e.context.caseIds.includes(t.id)).map(t=>({id:t.id,inputBase64:t.inputBase64}))};
    const inserted=await transaction(pool,async c=>{
      const current=(await c.query('SELECT state FROM evaluation_attempts WHERE id=$1 FOR UPDATE',[e.id])).rows[0];
      if(current?.state!=='pending')return false;
      await c.query('INSERT INTO evaluation_exchange.jobs(id,payload) VALUES($1,$2) ON CONFLICT DO NOTHING',[e.id,payload]);return true;
    });
    if(!inserted)continue;
    await boss.send('cangjie-evaluate',{requestId:e.id},{singletonKey:e.id,singletonSeconds:10,retryLimit:2,expireInSeconds:120});
    await pool.query('UPDATE evaluation_dispatch SET notified_at=now() WHERE evaluation_id=$1',[e.id]);
  }
}
export async function ingestAvailable(pool:pg.Pool,submissions:PostgresSubmissions) {
  const rows=(await pool.query('SELECT id,generation,outcome FROM evaluation_exchange.jobs WHERE outcome IS NOT NULL AND acknowledged=false LIMIT 20')).rows;
  for(const row of rows) {
    try { await submissions.ingest(row.id,row.outcome as ExecutionOutcome,row.generation); }
    catch(error) {
      // Infrastructure failures retain the only durable copy for a later ingestion.
      if(!(error instanceof InvalidExecutionEvidence))throw error;
      await submissions.rejectEvidence(row.id,row.outcome as ExecutionOutcome,row.generation);
    }
  }
  const actors=(await pool.query("SELECT DISTINCT learner_id FROM evaluation_attempts WHERE state='pending'")).rows;
  for(const actor of actors)await submissions.recoverStalled({learnerId:actor.learner_id});
  await submissions.continueSubmissions();
}
