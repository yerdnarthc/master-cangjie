import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { requireEnv } from '../runtime/config.ts';
export function connect(url = requireEnv('DATABASE_URL')) {
  const pool = new pg.Pool({ connectionString: url, max: 8 });
  return { pool, db: drizzle(pool) };
}
export async function transaction<T>(pool: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) {
      await client.query('ROLLBACK');
      if (attempt < 2 && ['40001', '40P01'].includes((error as { code?: string }).code ?? '')) continue;
      throw error;
    } finally { client.release(); }
  }
}
