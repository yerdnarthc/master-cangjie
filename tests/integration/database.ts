import { randomUUID } from 'node:crypto';
import { connect } from '../../infrastructure/persistence/connection.ts';
import { migrate } from '../../infrastructure/persistence/migrate.ts';
import { setupRoles } from '../../infrastructure/persistence/setup-roles.ts';
import { seed } from '../../infrastructure/persistence/seed-milestone.ts';
import { requireEnv } from '../../infrastructure/runtime/config.ts';
export const testUrl = requireEnv('TEST_DATABASE_URL');
if (!new URL(testUrl).pathname.endsWith('_test')) throw new Error('Integration checks require a dedicated *_test database.');
export async function testDatabase() {
  const admin = connect(requireEnv('MIGRATION_DATABASE_URL')).pool;
  const db = new URL(testUrl).pathname.slice(1);
  if(!/^[a-z0-9_]+$/.test(db))throw new Error('Invalid test database name.');
  try { if(!(await admin.query('SELECT FROM pg_database WHERE datname=$1',[db])).rowCount)await admin.query(`CREATE DATABASE "${db}"`); } finally {await admin.end();}
  await migrate(testUrl); await setupRoles(testUrl); await seed(testUrl);
  const p = connect(testUrl).pool;
  await p.query('TRUNCATE TABLE evaluation_exchange.jobs, evaluation_dispatch, solved_achievements, topic_submissions, validation_windows, evaluation_attempts, submission_reviews, draft_conflicts, coding_drafts, quiz_drafts, quiz_draft_conflicts CASCADE;');
  return p;
}
export async function fixture(pool:ReturnType<typeof connect>['pool']) {
  const learnerId=randomUUID();
  await pool.query('INSERT INTO learner_accounts VALUES($1,$2)',[learnerId,`test-${learnerId}`]);
  await pool.query("INSERT INTO learner_topic_progress(learner_id,topic_id,available,completed) SELECT $1,id,position<3,position<2 FROM topics",[learnerId]);
  return {learnerId};
}
export async function freshFixture(pool:ReturnType<typeof connect>['pool']) {
  const learnerId=randomUUID();
  await pool.query('INSERT INTO learner_accounts VALUES($1,$2)',[learnerId,`test-${learnerId}`]);
  await pool.query("INSERT INTO learner_topic_progress(learner_id,topic_id,available,completed) SELECT $1,id,position=0,false FROM topics",[learnerId]);
  return {learnerId};
}
