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

it('finalizes concurrent replays once and rejects a changed snapshot under the same identity', async () => {
  const actor = await freshFixture(pool);
  const topicId = 'getting-started-with-cangjie';
  const quiz = await readQuiz(topicId);
  const workspace = await quizSubmissions.workspace(actor, topicId);
  const request = {
    topicId, attemptId: workspace.currentAttempt.attemptId, requestKey: 'recovery-concurrent-test', assessmentRevision: workspace.currentAttempt.assessmentRevision,
    answers: { [quiz.questions[0].id]: quiz.questions[0].correctChoiceId },
  };
  const [first, replay] = await Promise.all([
    quizSubmissions.submit(actor, request), quizSubmissions.submit(actor, request),
  ]);
  expect(replay.submissionId).toBe(first.submissionId);
  expect(replay.evaluation).toEqual(first.evaluation);
  await expect(quizSubmissions.submit(actor, { ...request, answers: {} })).rejects.toThrow(/identity was reused/i);
  const retryReceipt = await quizSubmissions.startRetry(actor, topicId, {
    sourceSubmissionId: first.submissionId,
    expectedAttemptId: workspace.currentAttempt.attemptId,
    baseRevision: workspace.draft.workRevision,
  });
  await expect(quizSubmissions.submit(actor, {
    ...request,
    attemptId: retryReceipt.attemptId,
  })).rejects.toThrow(/identity was reused/i);
  const retry = await quizSubmissions.submit(actor, {
    ...request,
    attemptId: retryReceipt.attemptId,
    requestKey: 'recovery-intentional-retry',
    assessmentRevision: (await quizSubmissions.workspace(actor, topicId)).currentAttempt.assessmentRevision,
    answers: {},
  });
  expect(retry.submissionId).not.toBe(first.submissionId);
  const recovered = await quizSubmissions.submit(actor, request);
  expect(recovered.submissionId).toBe(first.submissionId);
  expect(recovered.attemptId).toBe(first.attemptId);
  const afterHistoricalReplay = await quizSubmissions.workspace(actor, topicId);
  expect(afterHistoricalReplay.currentAttempt.attemptId).toBe(retry.attemptId);
  expect(afterHistoricalReplay.currentSubmission?.submissionId).toBe(retry.submissionId);
  expect(afterHistoricalReplay.currentSubmission?.evaluation.questionResults[0].correctChoiceId).toBeDefined();
  const records = await pool.query('SELECT request_key, snapshot FROM topic_submissions WHERE learner_id=$1 ORDER BY created_at', [actor.learnerId]);
  expect(records.rowCount).toBe(2);
  expect(records.rows.find(row => row.request_key === request.requestKey).snapshot.answers).toEqual(request.answers);
});

it('restores and advances multiple conflicts without changing submitted history', async () => {
  const actor = await freshFixture(pool);
  const topic = 'getting-started-with-cangjie';
  const attemptId = (await quizSubmissions.workspace(actor, topic)).currentAttempt.attemptId;
  await quizSubmissions.saveDraft(actor, topic, { attemptId, baseRevision: 0, answers: { q: 'server' } });
  const result = await quizSubmissions.saveDraft(actor, topic, { attemptId, baseRevision: 0, answers: { q: 'candidate' } });
  const second = await quizSubmissions.saveDraft(actor, topic, { attemptId, baseRevision: 0, answers: { q: 'later' } });
  expect(result.kind).toBe('conflict');
  const workspace = await quizSubmissions.workspace(actor, topic);
  expect(workspace.conflict).toEqual(result);
  if (result.kind !== 'conflict') throw new Error('Expected conflict');
  const resolved = await quizSubmissions.resolveDraft(actor, topic, { attemptId, conflictId: result.conflictId, choice: 'candidate', baseRevision: result.server.workRevision });
  expect(resolved.kind).toBe('saved');
  if (resolved.kind !== 'saved' || second.kind !== 'conflict') throw new Error('Expected saved conflict');
  expect(resolved.nextConflict?.conflictId).toBe(second.conflictId);
  expect(resolved.nextConflict?.server.answers).toEqual({ q: 'candidate' });
  await quizSubmissions.resolveDraft(actor, topic, { attemptId, conflictId: second.conflictId, choice: 'server', baseRevision: resolved.workRevision });
  expect((await quizSubmissions.workspace(actor, topic)).conflict).toBeNull();
});

it('keeps an attempt editable when submission is attempted with an unresolved draft conflict', async () => {
  const actor = await freshFixture(pool);
  const topicId = 'getting-started-with-cangjie';
  const quiz = await readQuiz(topicId);
  const workspace = await quizSubmissions.workspace(actor, topicId);
  const firstQuestion = quiz.questions[0];
  const serverAnswers = { [firstQuestion.id]: firstQuestion.choices[0].id };
  const candidateAnswers = { [firstQuestion.id]: firstQuestion.choices[1].id };

  await quizSubmissions.saveDraft(actor, topicId, {
    attemptId: workspace.currentAttempt.attemptId,
    baseRevision: workspace.draft.workRevision,
    answers: serverAnswers,
  });
  const conflict = await quizSubmissions.saveDraft(actor, topicId, {
    attemptId: workspace.currentAttempt.attemptId,
    baseRevision: workspace.draft.workRevision,
    answers: candidateAnswers,
  });
  expect(conflict.kind).toBe('conflict');
  if (conflict.kind !== 'conflict') throw new Error('Expected an unresolved draft conflict.');

  const request = {
    topicId,
    attemptId: workspace.currentAttempt.attemptId,
    requestKey: 'submit-with-open-draft-conflict',
    answers: candidateAnswers,
    assessmentRevision: workspace.currentAttempt.assessmentRevision,
  };
  await expect(quizSubmissions.submit(actor, request)).rejects.toThrow(/resolve the open quiz draft conflict/i);

  const blocked = await quizSubmissions.workspace(actor, topicId);
  expect(blocked.currentAttempt).toMatchObject({
    attemptId: workspace.currentAttempt.attemptId,
    state: 'answering',
    submissionId: null,
  });
  expect(blocked.currentSubmission).toBeUndefined();
  expect(blocked.latestSubmission).toBeUndefined();
  expect(blocked.progress.bestScore).toBeNull();
  expect(blocked.conflict).toMatchObject({ conflictId: conflict.conflictId });

  const resolved = await quizSubmissions.resolveDraft(actor, topicId, {
    attemptId: workspace.currentAttempt.attemptId,
    conflictId: conflict.conflictId,
    choice: 'candidate',
    baseRevision: conflict.server.workRevision,
  });
  expect(resolved.kind).toBe('saved');
  const submitted = await quizSubmissions.submit(actor, request);
  expect(submitted.attemptId).toBe(workspace.currentAttempt.attemptId);
  expect((await quizSubmissions.workspace(actor, topicId)).conflict).toBeNull();
});

it('acknowledges an identical stale quiz draft replay and accepts a newer snapshot', async () => {
  const actor = await freshFixture(pool);
  const topic = 'getting-started-with-cangjie';
  const attemptId = (await quizSubmissions.workspace(actor, topic)).currentAttempt.attemptId;
  const quiz = await readQuiz(topic);
  const firstQuestion = quiz.questions[0];
  const secondQuestion = quiz.questions[1];
  const firstChoice = firstQuestion.choices[0];
  const secondChoice = secondQuestion.choices[0];
  const firstSnapshot = {
    [firstQuestion.id]: firstChoice.id,
  };

  const firstSave = await quizSubmissions.saveDraft(actor, topic, {
    attemptId,
    baseRevision: 0,
    answers: firstSnapshot,
  });
  expect(firstSave).toEqual({ kind: 'saved', workRevision: 1 });

  const replay = await quizSubmissions.saveDraft(actor, topic, {
    attemptId,
    baseRevision: 0,
    answers: firstSnapshot,
  });
  expect(replay).toEqual({ kind: 'saved', workRevision: 1 });
  if (replay.kind !== 'saved') throw new Error('Expected identical replay to be acknowledged.');
  const afterReplay = await quizSubmissions.workspace(actor, topic);
  expect(afterReplay.conflict).toBeNull();
  expect(afterReplay.draft).toEqual({ answers: firstSnapshot, workRevision: 1 });

  const latestSnapshot = {
    ...firstSnapshot,
    [secondQuestion.id]: secondChoice.id,
  };
  const latestSave = await quizSubmissions.saveDraft(actor, topic, {
    attemptId,
    baseRevision: replay.workRevision,
    answers: latestSnapshot,
  });
  expect(latestSave).toEqual({ kind: 'saved', workRevision: 2 });

  const finalWorkspace = await quizSubmissions.workspace(actor, topic);
  expect(finalWorkspace.conflict).toBeNull();
  expect(finalWorkspace.draft).toEqual({ answers: latestSnapshot, workRevision: 2 });
});

it('tests the complete multiple-choice workflow: draft, submit, retry retention, and automatic passing completion unlocking next topic', async () => {
  const actor = await freshFixture(pool);
  const topic1 = 'getting-started-with-cangjie';
  const topic2 = 'installing-the-cangjie-toolchain';

  // 1. Verify Topic 1 is available, but Topic 2 is locked
  const ws1 = await quizSubmissions.workspace(actor, topic1);
  expect(ws1.quiz.topicId).toBe(topic1);
  expect(ws1.quiz.questions.length).toBe(10);
  expect(ws1.progress.completed).toBe(false);
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
    attemptId: ws1.currentAttempt.attemptId,
    baseRevision: 0,
    answers: { [qIds[0]]: 'a' },
  });
  expect(save1.kind).toBe('saved');
  if (save1.kind === 'saved') expect(save1.workRevision).toBe(1);

  // Concurrent conflicting save with stale revision
  const conflict = await quizSubmissions.saveDraft(actor, topic1, {
    attemptId: ws1.currentAttempt.attemptId,
    baseRevision: 0,
    answers: { [qIds[0]]: 'b' },
  });
  expect(conflict.kind).toBe('conflict');
  if (conflict.kind === 'conflict') {
    expect(conflict.conflictId).toBeDefined();
    // Resolve conflict choosing candidate
    const resolved = await quizSubmissions.resolveDraft(actor, topic1, {
      attemptId: ws1.currentAttempt.attemptId,
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
    attemptId: ws1.currentAttempt.attemptId,
    requestKey: 'submit-fail-1',
    answers: failingAnswers,
    assessmentRevision: ws1.currentAttempt.assessmentRevision,
  });

  expect(failResult.evaluation.score).toEqual({ earned: 50, possible: 100 });
  expect(failResult.evaluation.passed).toBe(false);
  expect(failResult.progress.completed).toBe(false);
  expect(failResult.progress.nextTopicAvailable).toBe(false);

  // Cannot mark complete with failing score

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

  const afterFail = await quizSubmissions.workspace(actor, topic1);
  const passRetry = await quizSubmissions.startRetry(actor, topic1, {
    sourceSubmissionId: failResult.submissionId,
    expectedAttemptId: afterFail.currentAttempt.attemptId,
    baseRevision: afterFail.draft.workRevision,
  });
  const passAttempt = await quizSubmissions.workspace(actor, topic1);
  const passResult = await quizSubmissions.submit(actor, {
    topicId: topic1,
    attemptId: passRetry.attemptId,
    requestKey: 'submit-pass-1',
    answers: passingAnswers,
    assessmentRevision: passAttempt.currentAttempt.assessmentRevision,
  });

  expect(passResult.evaluation.score).toEqual({ earned: 70, possible: 100 });
  expect(passResult.evaluation.passed).toBe(true);
  // Passing finalization completes and unlocks atomically.
  expect(passResult.progress.completed).toBe(true);
  expect(passResult.progress.nextTopicAvailable).toBe(true);

  // 5. Retry with a lower score (4 correct = 40/100 -> fails)
  const lowerAnswers: Record<string, string> = {};
  for (let i = 0; i < 4; i++) {
    lowerAnswers[fullQuiz1.questions[i].id] = fullQuiz1.questions[i].correctChoiceId;
  }
  for (let i = 4; i < 10; i++) {
    const q = fullQuiz1.questions[i];
    const wrong = q.choices.find(c => c.id !== q.correctChoiceId)!;
    lowerAnswers[q.id] = wrong.id;
  }

  const afterPass = await quizSubmissions.workspace(actor, topic1);
  const lowerRetry = await quizSubmissions.startRetry(actor, topic1, {
    sourceSubmissionId: passResult.submissionId,
    expectedAttemptId: afterPass.currentAttempt.attemptId,
    baseRevision: afterPass.draft.workRevision,
  });
  const lowerAttempt = await quizSubmissions.workspace(actor, topic1);
  expect(lowerAttempt.draft.answers).toEqual({});
  expect(lowerAttempt.progress.bestScore).toEqual({ earned: 70, possible: 100 });
  const retryResult = await quizSubmissions.submit(actor, {
    topicId: topic1,
    attemptId: lowerRetry.attemptId,
    requestKey: 'submit-retry-lower-1',
    answers: lowerAnswers,
    assessmentRevision: lowerAttempt.currentAttempt.assessmentRevision,
  });

  expect(retryResult.evaluation.score).toEqual({ earned: 40, possible: 100 });
  expect(retryResult.progress.bestScore).toEqual({ earned: 70, possible: 100 });
  expect(retryResult.progress.completed).toBe(true);
  expect(retryResult.progress.nextTopicAvailable).toBe(true);

  // 6. Repeating Mark complete is idempotent after completing during Retry.

  // Calling mark complete again is idempotent

  // 7. Verify Topic 2 is now unlocked!
  const ws2 = await quizSubmissions.workspace(actor, topic2);
  expect(ws2.quiz.topicId).toBe(topic2);
  expect(ws2.progress.completed).toBe(false);

  // Submit Topic 2 quiz with 10/10 = 100/100
  const fullQuiz2 = await readQuiz(topic2);
  const perfectAnswers: Record<string, string> = {};
  for (const q of fullQuiz2.questions) {
    perfectAnswers[q.id] = q.correctChoiceId;
  }

  const t2Result = await quizSubmissions.submit(actor, {
    topicId: topic2,
    attemptId: ws2.currentAttempt.attemptId,
    requestKey: 'submit-t2-perfect',
    answers: perfectAnswers,
    assessmentRevision: ws2.currentAttempt.assessmentRevision,
  });
  expect(t2Result.evaluation.score).toEqual({ earned: 100, possible: 100 });

  // Mark Topic 2 complete

  // Verify Topic 3 (Hello World coding topic) is now unlocked for this learner!
  const t3Progress = (await pool.query('SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2', [actor.learnerId, 'running-the-first-cangjie-program'])).rows[0];
  expect(t3Progress.available).toBe(true);
});
