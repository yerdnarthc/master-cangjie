import { beforeAll, afterAll, it, expect } from 'vitest';
import type pg from 'pg';
import { testDatabase, fixture } from './database.ts';
import { transaction } from '../../infrastructure/persistence/connection.ts';
import { assessmentFor } from '../../modules/roadmap/application/content.ts';
import { readDraft, saveDraftIn, resolveDraftIn } from '../../modules/activity-draft/adapters/postgres.ts';
let pool:pg.Pool;
beforeAll(async()=>{pool=await testDatabase();}); afterAll(async()=>{await pool?.end();});
it('preserves competing saves until a learner chooses and safely acknowledges a lost response',async()=>{
 const actor=await fixture(pool),content=await assessmentFor(pool);
 expect((await readDraft(pool,actor,content)).attempted).toBe(false);
 const results=await Promise.all(['first','second'].map(source=>transaction(pool,c=>saveDraftIn(c,actor,content,{baseRevision:0,source}))));
 expect(results.filter(r=>r.kind==='saved')).toHaveLength(1);
 const conflict=results.find(r=>r.kind==='conflict'); expect(conflict?.kind).toBe('conflict');
 if(!conflict||conflict.kind!=='conflict')throw new Error('Expected preserved conflict');
 const saved=await transaction(pool,c=>resolveDraftIn(c,actor,content,{conflictId:conflict.conflictId,choice:'candidate',baseRevision:conflict.server.workRevision}));
 expect(saved.kind).toBe('saved');
 expect((await readDraft(pool,actor,content)).source).toBe(conflict.candidate.source);
 expect((await readDraft(pool,actor,content)).attempted).toBe(true);
 expect(await transaction(pool,c=>saveDraftIn(c,actor,content,{baseRevision:0,source:conflict.candidate.source}))).toEqual(saved);
 const other=await fixture(pool);expect((await readDraft(pool,other,content)).source).toBe(content.starter);
});
it('denies a locked topic and another learner conflict',async()=>{
 const actor=await fixture(pool),content=await assessmentFor(pool);
 await pool.query('UPDATE learner_topic_progress SET available=false WHERE learner_id=$1 AND topic_id=$2',[actor.learnerId,content.topicId]);
 await expect(readDraft(pool,actor,content)).rejects.toThrow('preceding topic');
});
