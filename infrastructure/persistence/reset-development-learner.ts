import type pg from 'pg';
import { transaction } from './connection.ts';

export type ResetDevelopmentLearnerResult = {
  jobs: number;
  dispatches: number;
  validationWindows: number;
  achievements: number;
  submissions: number;
  reviews: number;
  attempts: number;
  quizAttempts: number;
  codingDrafts: number;
  codingConflicts: number;
  quizDrafts: number;
  quizConflicts: number;
};

export async function resetDevelopmentLearner(
  pool: pg.Pool,
  learnerId: string,
): Promise<ResetDevelopmentLearnerResult> {
  return transaction(pool, async (client) => {
    const learner = await client.query(
      'SELECT id FROM learner_accounts WHERE id = $1 FOR UPDATE',
      [learnerId],
    );
    if (!learner.rowCount) throw new Error('Cannot reset progress for an unknown learner.');

    const jobs = await client.query(
      `DELETE FROM evaluation_exchange.jobs AS job
       USING evaluation_attempts AS attempt
       WHERE job.id = attempt.id AND attempt.learner_id = $1`,
      [learnerId],
    );
    const dispatches = await client.query(
      `DELETE FROM evaluation_dispatch AS dispatch
       USING evaluation_attempts AS attempt
       WHERE dispatch.evaluation_id = attempt.id AND attempt.learner_id = $1`,
      [learnerId],
    );
    const validationWindows = await client.query(
      'DELETE FROM validation_windows WHERE learner_id = $1',
      [learnerId],
    );
    const achievements = await client.query(
      'DELETE FROM solved_achievements WHERE learner_id = $1',
      [learnerId],
    );
    const quizConflicts = await client.query(
      'DELETE FROM quiz_draft_conflicts WHERE learner_id = $1',
      [learnerId],
    );
    const quizDrafts = await client.query(
      'DELETE FROM quiz_drafts WHERE learner_id = $1',
      [learnerId],
    );
    const quizAttempts = await client.query(
      'DELETE FROM quiz_attempts WHERE learner_id = $1',
      [learnerId],
    );
    const submissions = await client.query(
      'DELETE FROM topic_submissions WHERE learner_id = $1',
      [learnerId],
    );
    const reviews = await client.query(
      'DELETE FROM submission_reviews WHERE learner_id = $1',
      [learnerId],
    );
    const attempts = await client.query(
      'DELETE FROM evaluation_attempts WHERE learner_id = $1',
      [learnerId],
    );
    const codingDrafts = await client.query(
      'DELETE FROM coding_drafts WHERE learner_id = $1',
      [learnerId],
    );
    const codingConflicts = await client.query(
      'DELETE FROM draft_conflicts WHERE learner_id = $1',
      [learnerId],
    );
    await client.query(
      `INSERT INTO learner_topic_progress
        (learner_id, topic_id, available, completed, best_score, best_submission, provenance)
       SELECT $1, topic.id, topic.id = 'getting-started-with-cangjie', false, NULL, NULL, NULL
       FROM topics AS topic
       ON CONFLICT (learner_id, topic_id) DO UPDATE SET
         available = EXCLUDED.available,
         completed = EXCLUDED.completed,
         best_score = EXCLUDED.best_score,
         best_submission = EXCLUDED.best_submission,
         provenance = EXCLUDED.provenance`,
      [learnerId],
    );

    return {
      jobs: jobs.rowCount ?? 0,
      dispatches: dispatches.rowCount ?? 0,
      validationWindows: validationWindows.rowCount ?? 0,
      achievements: achievements.rowCount ?? 0,
      submissions: submissions.rowCount ?? 0,
      reviews: reviews.rowCount ?? 0,
      attempts: attempts.rowCount ?? 0,
      quizAttempts: quizAttempts.rowCount ?? 0,
      codingDrafts: codingDrafts.rowCount ?? 0,
      codingConflicts: codingConflicts.rowCount ?? 0,
      quizDrafts: quizDrafts.rowCount ?? 0,
      quizConflicts: quizConflicts.rowCount ?? 0,
    };
  });
}
