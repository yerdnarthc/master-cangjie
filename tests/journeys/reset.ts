import { connect, transaction } from '../../infrastructure/persistence/connection.ts';
import { requireEnv } from '../../infrastructure/runtime/config.ts';
import { seed } from '../../infrastructure/persistence/seed-milestone.ts';
import { LEARNER } from '../../modules/learner-account/adapters/development-session.ts';

export async function resetMilestone(): Promise<void> {
  const url = requireEnv('MIGRATION_DATABASE_URL');
  if (!new URL(url).pathname.endsWith('_test')) throw new Error('Journey reset requires a dedicated *_test database.');
  const { pool } = connect(url);
  try {
    await transaction(pool, async (client) => {
      await client.query(`
        TRUNCATE TABLE
          evaluation_exchange.jobs,
          evaluation_dispatch,
          solved_achievements,
          topic_submissions,
          validation_windows,
          evaluation_attempts,
          submission_reviews,
          draft_conflicts,
          coding_drafts,
          quiz_drafts,
          quiz_draft_conflicts,
          learner_topic_progress
        CASCADE;
      `);
    });
    await seed(url);
  } finally {
    await pool.end();
  }
}

export async function resetLearnerToStart(): Promise<void> {
  const url = requireEnv('MIGRATION_DATABASE_URL');
  const { pool } = connect(url);
  try {
    await pool.query(
      `UPDATE learner_topic_progress
       SET available = (topic_id = 'getting-started-with-cangjie'),
           completed = false,
           best_score = null,
           best_submission = null
       WHERE learner_id = $1`,
      [LEARNER]
    );
  } finally {
    await pool.end();
  }
}
