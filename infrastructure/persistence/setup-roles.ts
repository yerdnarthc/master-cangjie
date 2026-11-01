import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PgBoss } from 'pg-boss';
import { connect } from './connection.ts';
import { root, requireEnv } from '../runtime/config.ts';
export async function setupRoles(url: string) {
  const boss = new PgBoss({ connectionString: url, schema: 'evaluation_queue', supervise: false, schedule: false });
  boss.on('error', () => {});
  await boss.start();
  await boss.createQueue('cangjie-evaluate', { retryLimit: 2, retryDelay: 5, expireInSeconds: 120 });
  await boss.stop();
  const { pool }=connect(url);
  try {
    await pool.query(await readFile(resolve(root,'infrastructure/persistence/roles.sql'),'utf8'));
    await pool.query(`GRANT USAGE ON SCHEMA evaluation_queue TO mcj_app,mcj_worker;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA evaluation_queue TO mcj_app,mcj_worker;
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA evaluation_queue TO mcj_app,mcj_worker;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA evaluation_exchange TO mcj_worker;
      REVOKE CREATE ON SCHEMA evaluation_queue FROM mcj_app,mcj_worker;`);
  } finally { await pool.end(); }
}
if (process.argv[1]?.endsWith('setup-roles.ts')) await setupRoles(requireEnv('MIGRATION_DATABASE_URL'));
