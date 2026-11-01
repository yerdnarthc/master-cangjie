import type pg from 'pg';
export type CaseDefinition = { id: string; visibility: 'visible' | 'hidden'; inputBase64: string; expectedBase64: string };
export type Assessment = { topicId: string; revision: number; problemId: string; title: string;
  statement: string; starter: string; languageVersion: '1.0.5'; requirements: unknown[]; tests: CaseDefinition[] };
export const HELLO_TOPIC = 'running-the-first-cangjie-program';
export const HELLO_PROBLEM = `${HELLO_TOPIC}/hello-world`;
export async function assessmentFor(client: pg.Pool | pg.PoolClient, topicId = HELLO_TOPIC, revision?: number): Promise<Assessment> {
  const result = await client.query('SELECT definition FROM assessment_revisions WHERE topic_id=$1 AND revision=COALESCE($2,(SELECT current_revision FROM topics WHERE id=$1))', [topicId, revision ?? null]);
  if (!result.rowCount) throw new Error('Published assessment is unavailable.');
  return result.rows[0].definition as Assessment;
}
