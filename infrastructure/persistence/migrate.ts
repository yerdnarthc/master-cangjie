import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connect, transaction } from './connection.ts';
import { root, requireEnv } from '../runtime/config.ts';
export async function migrate(url: string) {
  const { pool } = connect(url);
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of (await readdir(resolve(root, 'infrastructure/persistence/migrations'))).filter(n => n.endsWith('.sql')).sort()) {
      await transaction(pool, async client => {
        await client.query("SELECT pg_advisory_xact_lock(582041)");
        if ((await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name])).rowCount) return;
        await client.query(await readFile(resolve(root, 'infrastructure/persistence/migrations', name), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      });
    }
  } finally { await pool.end(); }
}
if (process.argv[1]?.endsWith('migrate.ts')) await migrate(requireEnv('MIGRATION_DATABASE_URL'));
