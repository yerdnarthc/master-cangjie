import { connect, transaction } from './connection.ts';
import { requireEnv } from '../runtime/config.ts';
import { readHelloWorld, contentHash } from '../../modules/roadmap/adapters/hello-world-content.ts';
import { LEARNER, OTHER_LEARNER } from '../../modules/learner-account/adapters/development-session.ts';
export async function seed(url: string) {
  const { pool } = connect(url); const content = await readHelloWorld();
  try { await transaction(pool, async client => {
    for (const [id, name] of [[LEARNER,'milestone-primary'],[OTHER_LEARNER,'milestone-other']]) await client.query('INSERT INTO learner_accounts VALUES($1,$2) ON CONFLICT DO NOTHING',[id,name]);
    const topics = [['getting-started-with-cangjie','Getting Started with Cangjie','Getting Started with Cangjie','multiple-choice'],['installing-the-cangjie-toolchain','Installing the Cangjie Toolchain','Getting Started with Cangjie','multiple-choice'],[content.topicId,'Running the First Cangjie Program','Getting Started with Cangjie','coding'],['identifiers','Identifiers','Basic Concepts','multiple-choice']];
    for (const [i,t] of topics.entries()) await client.query('INSERT INTO topics(id,title,category,kind,position,current_revision) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[...t,i,t[0]===content.topicId?1:null]);
    const existing=await client.query('SELECT content_hash FROM assessment_revisions WHERE topic_id=$1 AND revision=1',[content.topicId]);
    if (existing.rowCount && existing.rows[0].content_hash!==contentHash(content)) throw new Error('Refusing changed assessment bytes under existing revision.');
    await client.query('INSERT INTO assessment_revisions VALUES($1,1,$2,$3) ON CONFLICT DO NOTHING',[content.topicId,content,contentHash(content)]);
    for (const learner of [LEARNER,OTHER_LEARNER]) for (const [i,t] of topics.entries()) await client.query('INSERT INTO learner_topic_progress(learner_id,topic_id,available,completed,provenance) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[learner,t[0],i<3,i<2,'internal prerequisite fixture; not quiz execution evidence']);
  }); } finally { await pool.end(); }
}
if (process.argv[1]?.endsWith('seed-milestone.ts')) await seed(requireEnv('MIGRATION_DATABASE_URL'));
