import { beforeAll, afterAll, it, expect } from 'vitest';
import type pg from 'pg';
import { testDatabase, freshFixture } from './database.ts';
import { PostgresQuizSubmissions } from '../../modules/topic-submission/adapters/quiz-submissions.ts';
import { readQuiz } from '../../modules/roadmap/adapters/quiz-content.ts';

let pool: pg.Pool;
let quizSubmissions: PostgresQuizSubmissions;

beforeAll(async () => {
  pool = await testDatabase();
  quizSubmissions = new PostgresQuizSubmissions(pool);
});

afterAll(async () => {
  await pool?.end();
});

it('restores and advances multiple conflicts without changing submitted history', async () => {
  const actor = await freshFixture(pool);
  const topic = 'getting-started-with-cangjie';
  await quizSubmissions.saveDraft(actor, topic, { baseRevision: 0, answers: { q: 'server' } });
  const result = await quizSubmissions.saveDraft(actor, topic, { baseRevision: 0, answers: { q: 'candidate' } });
  const second = await quizSubmissions.saveDraft(actor, topic, { baseRevision: 0, answers: { q: 'later' } });
  expect(result.kind).toBe('conflict');
  const workspace = await quizSubmissions.workspace(actor, topic);
  expect(workspace.conflict).toEqual(result);
  if (result.kind !== 'conflict') throw new Error('Expected conflict');
  const resolved = await quizSubmissions.resolveDraft(actor, topic, { conflictId: result.conflictId, choice: 'candidate', baseRevision: result.server.workRevision });
  expect(resolved.kind).toBe('saved');
  if (resolved.kind !== 'saved' || second.kind !== 'conflict') throw new Error('Expected saved conflict');
  expect(resolved.nextConflict?.conflictId).toBe(second.conflictId);
  expect(resolved.nextConflict?.server.answers).toEqual({ q: 'candidate' });
  await quizSubmissions.resolveDraft(actor, topic, { conflictId: second.conflictId, choice: 'server', baseRevision: resolved.workRevision });
  expect((await quizSubmissions.workspace(actor, topic)).conflict).toBeNull();
});

it('tests the complete multiple-choice workflow: draft, submit, retry retention, and explicit completion unlocking next topic', async () => {
  const actor = await freshFixture(pool);
  const topic1 = 'getting-started-with-cangjie';
  const topic2 = 'installing-the-cangjie-toolchain';

  // 1. Verify Topic 1 is available, but Topic 2 is locked
  const ws1 = await quizSubmissions.workspace(actor, topic1);
  expect(ws1.quiz.topicId).toBe(topic1);
  expect(ws1.quiz.questions.length).toBe(10);
  expect(ws1.progress.completed).toBe(false);
  expect(ws1.progress.canMarkComplete).toBe(false);
  expect(ws1.progress.nextTopicAvailable).toBe(false);

  // Invariant: public quiz conceals correctChoiceId and explanation
  for (const q of ws1.quiz.questions) {
    expect((q as Record<string, unknown>).correctChoiceId).toBeUndefined();
    expect((q as Record<string, unknown>).explanation).toBeUndefined();
    expect(q.choices.length).toBeGreaterThanOrEqual(2);
  }

  // Topic 2 is not yet available
  await expect(quizSubmissions.workspace(actor, topic2)).rejects.toThrow(/Complete the preceding topic to unlock this activity/i);

  // 2. Draft saving & optimistic concurrency
  const fullQuiz1 = await readQuiz(topic1);
  const qIds = fullQuiz1.questions.map(q => q.id);

  // Save partial answers
  const save1 = await quizSubmissions.saveDraft(actor, topic1, {
    baseRevision: 0,
    answers: { [qIds[0]]: 'a' },
  });
  expect(save1.kind).toBe('saved');
  if (save1.kind === 'saved') expect(save1.workRevision).toBe(1);

  // Concurrent conflicting save with stale revision
  const conflict = await quizSubmissions.saveDraft(actor, topic1, {
    baseRevision: 0,
    answers: { [qIds[0]]: 'b' },
  });
  expect(conflict.kind).toBe('conflict');
  if (conflict.kind === 'conflict') {
    expect(conflict.conflictId).toBeDefined();
    // Resolve conflict choosing candidate
    const resolved = await quizSubmissions.resolveDraft(actor, topic1, {
      conflictId: conflict.conflictId,
      choice: 'candidate',
      baseRevision: 1,
    });
    expect(resolved.kind).toBe('saved');
  }

  // 3. Submit failing answer sheet (5 correct = 50/100 -> fails)
  const failingAnswers: Record<string, string> = {};
  for (let i = 0; i < 5; i++) {
    failingAnswers[fullQuiz1.questions[i].id] = fullQuiz1.questions[i].correctChoiceId;
  }
  for (let i = 5; i < 10; i++) {
    // Pick an incorrect choice
    const q = fullQuiz1.questions[i];
    const wrong = q.choices.find(c => c.id !== q.correctChoiceId)!;
    failingAnswers[q.id] = wrong.id;
  }

  const failResult = await quizSubmissions.submit(actor, {
    topicId: topic1,
    requestKey: 'submit-fail-1',
    answers: failingAnswers,
    assessmentRevision: fullQuiz1.revision,
  });

  expect(failResult.evaluation.score).toEqual({ earned: 50, possible: 100 });
  expect(failResult.evaluation.passed).toBe(false);
  expect(failResult.progress.completed).toBe(false);
  expect(failResult.progress.canMarkComplete).toBe(false);
  expect(failResult.progress.nextTopicAvailable).toBe(false);

  // Cannot mark complete with failing score
  await expect(quizSubmissions.markComplete(actor, topic1)).rejects.toThrow(/A passing score of at least 60\/100 is required/i);

  // 4. Submit passing answer sheet (7 correct = 70/100 -> passes)
  const passingAnswers: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    passingAnswers[fullQuiz1.questions[i].id] = fullQuiz1.questions[i].correctChoiceId;
  }
  for (let i = 7; i < 10; i++) {
    const q = fullQuiz1.questions[i];
    const wrong = q.choices.find(c => c.id !== q.correctChoiceId)!;
    passingAnswers[q.id] = wrong.id;
  }

  const passResult = await quizSubmissions.submit(actor, {
    topicId: topic1,
    requestKey: 'submit-pass-1',
    answers: passingAnswers,
    assessmentRevision: fullQuiz1.revision,
  });

  expect(passResult.evaluation.score).toEqual({ earned: 70, possible: 100 });
  expect(passResult.evaluation.passed).toBe(true);
  // CRITICAL INVARIANT UC-13-AC2: Passing does NOT complete topic or unlock next topic yet!
  expect(passResult.progress.completed).toBe(false);
  expect(passResult.progress.nextTopicAvailable).toBe(false);
  expect(passResult.progress.canMarkComplete).toBe(true);

  // 5. Retry with a lower score (4 correct = 40/100 -> fails)
  // INVARIANT INV-14, INV-15: Retained best score remains 70/100, and canMarkComplete remains true!
  const lowerAnswers: Record<string, string> = {};
  for (let i = 0; i < 4; i++) {
    lowerAnswers[fullQuiz1.questions[i].id] = fullQuiz1.questions[i].correctChoiceId;
  }
  for (let i = 4; i < 10; i++) {
    const q = fullQuiz1.questions[i];
    const wrong = q.choices.find(c => c.id !== q.correctChoiceId)!;
    lowerAnswers[q.id] = wrong.id;
  }

  const retryResult = await quizSubmissions.submit(actor, {
    topicId: topic1,
    requestKey: 'submit-retry-lower-1',
    answers: lowerAnswers,
    assessmentRevision: fullQuiz1.revision,
  });

  expect(retryResult.evaluation.score).toEqual({ earned: 40, possible: 100 });
  expect(retryResult.progress.bestScore).toEqual({ earned: 70, possible: 100 });
  expect(retryResult.progress.completed).toBe(false);
  expect(retryResult.progress.canMarkComplete).toBe(true); // Still eligible to mark complete!
  expect(retryResult.progress.nextTopicAvailable).toBe(false);

  // 6. Explicit UC-14 "Mark complete" action
  const completeResult = await quizSubmissions.markComplete(actor, topic1);
  expect(completeResult.completed).toBe(true);
  expect(completeResult.nextTopicAvailable).toBe(true);

  // Calling mark complete again is idempotent
  const repeatComplete = await quizSubmissions.markComplete(actor, topic1);
  expect(repeatComplete.completed).toBe(true);

  // 7. Verify Topic 2 is now unlocked!
  const ws2 = await quizSubmissions.workspace(actor, topic2);
  expect(ws2.quiz.topicId).toBe(topic2);
  expect(ws2.progress.completed).toBe(false);
  expect(ws2.progress.canMarkComplete).toBe(false);

  // Submit Topic 2 quiz with 10/10 = 100/100
  const fullQuiz2 = await readQuiz(topic2);
  const perfectAnswers: Record<string, string> = {};
  for (const q of fullQuiz2.questions) {
    perfectAnswers[q.id] = q.correctChoiceId;
  }

  const t2Result = await quizSubmissions.submit(actor, {
    topicId: topic2,
    requestKey: 'submit-t2-perfect',
    answers: perfectAnswers,
    assessmentRevision: fullQuiz2.revision,
  });
  expect(t2Result.evaluation.score).toEqual({ earned: 100, possible: 100 });
  expect(t2Result.progress.canMarkComplete).toBe(true);

  // Mark Topic 2 complete
  await quizSubmissions.markComplete(actor, topic2);

  // Verify Topic 3 (Hello World coding topic) is now unlocked for this learner!
  const t3Progress = (await pool.query('SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2', [actor.learnerId, 'running-the-first-cangjie-program'])).rows[0];
  expect(t3Progress.available).toBe(true);
});
