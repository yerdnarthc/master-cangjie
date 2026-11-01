import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { OperationError, type Actor } from '../../learner-account/application/actor.ts';
import type { Assessment } from '../../roadmap/application/content.ts';
export type Draft = { source: string; workRevision: number; attempted: boolean };
export type SaveResult = { kind:'saved'; workRevision:number } | {kind:'conflict'; conflictId:string; server:Draft; candidate:Draft};
export function sourceValid(source: unknown): asserts source is string {
  if (typeof source!=='string' || Buffer.byteLength(source)>256*1024 || source.includes('\0')) throw new OperationError(400,'Source must be text no larger than 256 KiB without NUL bytes.');
}
export async function accessible(client: pg.Pool | pg.PoolClient, actor: Actor, topicId: string) {
  const r=await client.query('SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2',[actor.learnerId,topicId]);
  if (!r.rows[0]?.available) throw new OperationError(403,'Complete the preceding topic to unlock this activity.');
}
export async function readDraft(client: pg.Pool | pg.PoolClient, actor:Actor, content:Assessment, lock=false):Promise<Draft> {
  await accessible(client,actor,content.topicId);
  await client.query('INSERT INTO coding_drafts(learner_id,problem_id,source) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[actor.learnerId,content.problemId,content.starter]);
  const r=await client.query('SELECT source,work_revision,attempted FROM coding_drafts WHERE learner_id=$1 AND problem_id=$2'+(lock?' FOR UPDATE':''),[actor.learnerId,content.problemId]);
  return {source:r.rows[0].source,workRevision:r.rows[0].work_revision,attempted:r.rows[0].attempted};
}
export async function markParticipated(client: pg.PoolClient,actor:Actor,problemId:string) {
  await client.query('UPDATE coding_drafts SET attempted=true WHERE learner_id=$1 AND problem_id=$2',[actor.learnerId,problemId]);
}
export async function saveDraftIn(client:pg.PoolClient, actor:Actor,content:Assessment,request:{baseRevision:number;source:string}):Promise<SaveResult> {
  sourceValid(request.source);
  if (!Number.isSafeInteger(request.baseRevision) || request.baseRevision<0) throw new OperationError(400,'Invalid base revision.');
  const draft=await readDraft(client,actor,content,true);
  if (draft.workRevision!==request.baseRevision) {
    // A lost save response can safely acknowledge identical current bytes.
    if(draft.source===request.source) return {kind:'saved',workRevision:draft.workRevision};
    const id=randomUUID();
    await client.query('INSERT INTO draft_conflicts(id,learner_id,problem_id,base_revision,candidate_source) VALUES($1,$2,$3,$4,$5)',[id,actor.learnerId,content.problemId,request.baseRevision,request.source]);
    return {kind:'conflict',conflictId:id,server:draft,candidate:{source:request.source,workRevision:request.baseRevision,attempted:true}};
  }
  if(draft.source===request.source) { await markParticipated(client,actor,content.problemId); return {kind:'saved',workRevision:draft.workRevision}; }
  await client.query('UPDATE coding_drafts SET source=$3,work_revision=work_revision+1,attempted=true,updated_at=now() WHERE learner_id=$1 AND problem_id=$2',[actor.learnerId,content.problemId,request.source]);
  return {kind:'saved',workRevision:draft.workRevision+1};
}
export async function resolveDraftIn(client:pg.PoolClient,actor:Actor,content:Assessment,request:{conflictId:string;choice:'server'|'candidate';baseRevision:number}):Promise<SaveResult> {
  if(!['server','candidate'].includes(request.choice)) throw new OperationError(400,'Choose a preserved draft.');
  const draft=await readDraft(client,actor,content,true);
  const r=await client.query('SELECT * FROM draft_conflicts WHERE id=$1 AND learner_id=$2 AND problem_id=$3 AND resolved=false FOR UPDATE',[request.conflictId,actor.learnerId,content.problemId]);
  if(!r.rowCount)throw new OperationError(409,'This draft conflict is no longer open.');
  const conflict=r.rows[0];
  if(draft.workRevision!==request.baseRevision)return {kind:'conflict',conflictId:conflict.id,server:draft,candidate:{source:conflict.candidate_source,workRevision:conflict.base_revision,attempted:true}};
  const source=request.choice==='candidate'?conflict.candidate_source:draft.source;
  await client.query('UPDATE coding_drafts SET source=$3,work_revision=work_revision+1,attempted=true,updated_at=now() WHERE learner_id=$1 AND problem_id=$2',[actor.learnerId,content.problemId,source]);
  await client.query('UPDATE draft_conflicts SET resolved=true WHERE id=$1',[conflict.id]);
  return {kind:'saved',workRevision:draft.workRevision+1};
}
