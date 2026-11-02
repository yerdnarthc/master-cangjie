import type pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { transaction } from '../../../infrastructure/persistence/connection.ts';
import { OperationError, type Actor } from '../../learner-account/application/actor.ts';
import {
  HELLO_PROBLEM,
  HELLO_TOPIC,
  assessmentFor,
  getProblems,
  problemFromAssessment,
  type Assessment,
  type CodingAssessment,
} from '../../roadmap/application/content.ts';
import { publicProblem } from '../../roadmap/adapters/hello-world-content.ts';
import {
  accessible,
  readDraft,
  markParticipated,
  saveDraftIn,
  resolveDraftIn,
} from '../../activity-draft/adapters/postgres.ts';
import {
  evaluate,
  isEligibleBatch,
  sameBytes,
  type EvaluationContext,
} from '../domain/evaluation.ts';
import { betterScore } from '../domain/progress.ts';
import { passes } from '../domain/evaluation.ts';
import type {
  EvaluationRequest,
  FixedContext,
  Result,
  OperationView,
  Feedback,
} from '../application/operations.ts';
import type { ExecutionOutcome } from '../../../infrastructure/evaluation-transport/contracts.ts';

export class InvalidExecutionEvidence extends Error {}

export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const keyValid = (key: string) => {
  if (typeof key !== 'string' || !key.length || key.length > 100)
    throw new OperationError(400, 'A request identity is required.');
};
const lockActor = async (c: pg.PoolClient, a: Actor) => {
  if (
    !(
      await c.query(
        'SELECT id FROM learner_accounts WHERE id=$1 FOR NO KEY UPDATE',
        [a.learnerId],
      )
    ).rowCount
  )
    throw new OperationError(401, 'Unknown learner.');
};

export class PostgresSubmissions {
  constructor(readonly pool: pg.Pool) {}

  async save(
    actor: Actor,
    request: { problemId: string; baseRevision: number; source: string },
  ) {
    return transaction(this.pool, async (c) => {
      const topicId = request.problemId.includes('/')
        ? request.problemId.split('/')[0]
        : HELLO_TOPIC;
      const a = await assessmentFor(c, topicId);
      const prob = problemFromAssessment(a, request.problemId);
      return saveDraftIn(c, actor, prob, request);
    });
  }

  async resolve(
    actor: Actor,
    request: {
      conflictId: string;
      choice: 'server' | 'candidate';
      baseRevision: number;
    },
  ) {
    return transaction(this.pool, async (c) => {
      const conflict = (
        await c.query(
          'SELECT problem_id FROM draft_conflicts WHERE id=$1',
          [request.conflictId],
        )
      ).rows[0];
      const topicId = conflict?.problem_id?.includes('/')
        ? conflict.problem_id.split('/')[0]
        : HELLO_TOPIC;
      const a = await assessmentFor(c, topicId);
      const prob = problemFromAssessment(a, conflict?.problem_id);
      return resolveDraftIn(c, actor, prob, request);
    });
  }

  // Reads reconcile durable work even when the continuation host is unavailable.
  async recoverStalled(actor: Actor) {
    await transaction(this.pool, async (c) => {
      await lockActor(c, actor);
      const pending = (
        await c.query(
          "SELECT *,COALESCE(retry_requested_at,created_at)<=now()-interval '2 minutes' AS stale FROM evaluation_attempts WHERE learner_id=$1 AND state='pending' ORDER BY id FOR UPDATE",
          [actor.learnerId],
        )
      ).rows;
      for (const e of pending) {
        const job = (
          await c.query(
            'SELECT *,lease_until>now() AS live FROM evaluation_exchange.jobs WHERE id=$1 FOR UPDATE',
            [e.id],
          )
        ).rows[0];
        if (job?.outcome || job?.live || (!e.stale && !(job?.deliveries >= 3)))
          continue;
        if (job)
          await c.query(
            'UPDATE evaluation_exchange.jobs SET acknowledged=true,generation=generation+1,lease_until=NULL WHERE id=$1',
            [e.id],
          );
        await c.query(
          "UPDATE evaluation_attempts SET state='retryable-error' WHERE id=$1",
          [e.id],
        );
        await c.query(
          'UPDATE validation_windows SET pending_batch=NULL WHERE pending_batch=$1',
          [e.id],
        );
        await c.query(
          "UPDATE topic_submissions SET state='retryable-error' WHERE evaluation_id=$1 AND state='pending'",
          [e.id],
        );
      }
    });
  }

  private async recoverAvailable(actor: Actor) {
    await this.recoverStalled(actor);
    const rows = (
      await this.pool.query(
        'SELECT j.id,j.generation,j.outcome FROM evaluation_exchange.jobs j JOIN evaluation_attempts e ON e.id=j.id WHERE e.learner_id=$1 AND j.outcome IS NOT NULL AND j.acknowledged=false LIMIT 20',
        [actor.learnerId],
      )
    ).rows;
    for (const row of rows) {
      try {
        await this.ingest(row.id, row.outcome, row.generation);
      } catch (error) {
        if (!(error instanceof InvalidExecutionEvidence)) throw error;
        await this.rejectEvidence(row.id, row.outcome, row.generation);
      }
    }
    await this.continueSubmissions(actor);
  }

  async workspace(
    actor: Actor,
    topicId: string = HELLO_TOPIC,
    problemId?: string,
  ) {
    await this.recoverAvailable(actor);
    const content = await assessmentFor<CodingAssessment>(this.pool, topicId);
    const problems = getProblems(content);
    const activeProblem = problemId
      ? (problems.find(
          (p) => p.problemId === problemId || p.slug === problemId,
        ) ?? problems[0])
      : problems[0];
    const draft = await readDraft(this.pool, actor, activeProblem);

    const p = (
      await this.pool.query(
        'SELECT * FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2',
        [actor.learnerId, topicId],
      )
    ).rows[0];

    if (!p || !p.available) {
      throw new OperationError(
        403,
        'Complete the preceding topic to unlock this activity.',
      );
    }

    const next = (
      await this.pool.query(
        'SELECT id, (SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=t.id) as available FROM topics t WHERE position=(SELECT position+1 FROM topics WHERE id=$2)',
        [actor.learnerId, topicId],
      )
    ).rows[0];

    const evaluation = (
      await this.pool.query(
        "SELECT id FROM evaluation_attempts WHERE learner_id=$1 AND context->>'problemId'=$2 ORDER BY created_at DESC LIMIT 1",
        [actor.learnerId, activeProblem.problemId],
      )
    ).rows[0];

    const submission = (
      await this.pool.query(
        "SELECT id FROM topic_submissions WHERE learner_id=$1 AND (snapshot->>'topicId'=$2 OR snapshot->'assessment'->>'topicId'=$2 OR snapshot->>'problemId'=$3) ORDER BY created_at DESC LIMIT 1",
        [actor.learnerId, topicId, activeProblem.problemId],
      )
    ).rows[0];

    const unresolved = (
      await this.pool.query(
        "SELECT id FROM topic_submissions WHERE learner_id=$1 AND (snapshot->>'topicId'=$2 OR snapshot->'assessment'->>'topicId'=$2 OR snapshot->>'problemId'=$3) AND state<>'finalized' ORDER BY created_at DESC LIMIT 1",
        [actor.learnerId, topicId, activeProblem.problemId],
      )
    ).rows[0];

    const solvedRows = await this.pool.query(
      'SELECT problem_id FROM solved_achievements WHERE learner_id=$1 AND problem_id = ANY($2)',
      [actor.learnerId, problems.map((pr) => pr.problemId)],
    );
    const solvedSet = new Set(solvedRows.rows.map((r) => r.problem_id));

    const draftRows = await this.pool.query(
      'SELECT problem_id, attempted FROM coding_drafts WHERE learner_id=$1 AND problem_id = ANY($2)',
      [actor.learnerId, problems.map((pr) => pr.problemId)],
    );
    const attemptedMap = new Map(
      draftRows.rows.map((r) => [r.problem_id, r.attempted]),
    );

    return {
      learnerId: actor.learnerId,
      problem: publicProblem(activeProblem),
      problems: problems.map((pr) => ({
        problemId: pr.problemId,
        slug: pr.slug,
        title: pr.title,
        testCount: pr.tests.length,
        solved: solvedSet.has(pr.problemId),
        attempted: attemptedMap.get(pr.problemId) ?? false,
      })),
      draft,
      progress: {
        bestScore: p.best_score,
        completed: p.completed,
        nextTopicAvailable: !!next?.available,
        nextTopicId: next?.id ?? null,
      },
      unresolvedSubmission: unresolved
        ? await this.read(actor, unresolved.id)
        : undefined,
      latestEvaluation: evaluation
        ? await this.read(actor, evaluation.id)
        : undefined,
      latestSubmission: submission
        ? await this.read(actor, submission.id)
        : undefined,
    };
  }

  private async createEvaluation(
    c: pg.PoolClient,
    actor: Actor,
    key: string,
    kind: 'single' | 'batch',
    context: FixedContext,
    manual: boolean,
  ) {
    const intent = hash(JSON.stringify({ kind, context }));
    const existing = (
      await c.query(
        'SELECT * FROM evaluation_attempts WHERE learner_id=$1 AND request_key=$2',
        [actor.learnerId, key],
      )
    ).rows[0];
    if (existing) {
      if (existing.intent_hash !== intent)
        throw new OperationError(
          409,
          'Request identity was reused for different work.',
        );
      return existing.id as string;
    }
    await c.query(
      'INSERT INTO validation_windows(learner_id,problem_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [actor.learnerId, context.problemId],
    );
    const w = (
      await c.query(
        'SELECT * FROM validation_windows WHERE learner_id=$1 AND problem_id=$2 FOR UPDATE',
        [actor.learnerId, context.problemId],
      )
    ).rows[0];
    if (kind === 'batch') {
      if (w.pending_batch) {
        const pending = (
          await c.query(
            'SELECT * FROM evaluation_attempts WHERE id=$1',
            [w.pending_batch],
          )
        ).rows[0];
        if (pending?.state === 'pending') {
          if (
            !manual &&
            pending.context.source === context.source &&
            pending.context.assessment.revision ===
              context.assessment.revision
          )
            return pending.id as string;
          throw new OperationError(
            409,
            'A validation is already pending for this problem.',
          );
        }
      }
      if (
        manual &&
        w.last_manual_at &&
        Date.now() - new Date(w.last_manual_at).getTime() < 5000
      )
        throw new OperationError(
          429,
          'Wait five seconds before validating this problem again.',
        );
    } else {
      const pending = await c.query(
        "SELECT id FROM evaluation_attempts WHERE learner_id=$1 AND context->>'problemId'=$2 AND kind='single' AND state='pending'",
        [actor.learnerId, context.problemId],
      );
      if (pending.rowCount)
        throw new OperationError(409, 'A run is already pending.');
    }
    if (
      Number(
        (
          await c.query(
            "SELECT count(*) FROM evaluation_attempts WHERE state='pending'",
          )
        ).rows[0].count,
      ) >= 20
    )
      throw new OperationError(
        503,
        'The evaluator is busy. Your work is saved; retry shortly.',
      );
    const id = randomUUID();
    await c.query(
      'INSERT INTO evaluation_attempts(id,learner_id,request_key,intent_hash,kind,context) VALUES($1,$2,$3,$4,$5,$6)',
      [id, actor.learnerId, key, intent, kind, context],
    );
    await c.query(
      'INSERT INTO evaluation_dispatch(evaluation_id) VALUES($1)',
      [id],
    );
    if (kind === 'batch')
      await c.query(
        'UPDATE validation_windows SET pending_batch=$3,last_manual_at=CASE WHEN $4 THEN now() ELSE last_manual_at END WHERE learner_id=$1 AND problem_id=$2',
        [actor.learnerId, context.problemId, id, manual],
      );
    return id;
  }

  async request(actor: Actor, request: EvaluationRequest) {
    keyValid(request.requestKey);
    if (!['single', 'batch'].includes(request.kind))
      throw new OperationError(400, 'Choose Run or Validate.');
    const id = await transaction(this.pool, async (c) => {
      await lockActor(c, actor);
      // Reconnect with the original key succeeds even if the current draft changed.
      const prior = (
        await c.query(
          'SELECT * FROM evaluation_attempts WHERE learner_id=$1 AND request_key=$2',
          [actor.learnerId, request.requestKey],
        )
      ).rows[0];
      if (prior) {
        const x = prior.context;
        if (
          prior.kind !== request.kind ||
          x.problemId !== request.problemId ||
          x.workRevision !== request.workRevision ||
          x.assessment.topicId !== request.assessment.topicId ||
          x.assessment.revision !== request.assessment.revision ||
          (request.kind === 'single' && x.caseIds[0] !== request.caseId)
        )
          throw new OperationError(
            409,
            'Request identity was reused for different work.',
          );
        return prior.id as string;
      }
      const a = await assessmentFor(
        c,
        request.assessment.topicId,
        request.assessment.revision,
      );
      const prob = problemFromAssessment(a, request.problemId);
      const draft = await readDraft(c, actor, prob, true);
      if (
        request.problemId !== prob.problemId ||
        request.assessment.topicId !== prob.topicId ||
        request.assessment.revision !== prob.revision ||
        request.workRevision !== draft.workRevision
      )
        throw new OperationError(
          409,
          'Save your latest work and refresh the assessment before evaluation.',
        );
      const ids =
        request.kind === 'batch'
          ? prob.tests.map((t) => t.id)
          : [request.caseId ?? ''];
      if (ids.some((id) => !prob.tests.some((t) => t.id === id)))
        throw new OperationError(400, 'Unknown test case.');
      const context: FixedContext = {
        ...draft,
        attempted: true,
        learnerId: actor.learnerId,
        problemId: prob.problemId,
        languageVersion: prob.languageVersion,
        assessment: { topicId: prob.topicId, revision: prob.revision },
        caseIds: ids,
      };
      const id = await this.createEvaluation(
        c,
        actor,
        request.requestKey,
        request.kind,
        context,
        request.kind === 'batch',
      );
      await markParticipated(c, actor, prob.problemId);
      return id;
    });
    return this.read(actor, id);
  }

  async review(actor: Actor, topicId: string) {
    return transaction(this.pool, async (c) => {
      await lockActor(c, actor);
      const a = await assessmentFor(c, topicId);
      const problems = getProblems(a);
      const p = (
        await c.query(
          'SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2',
          [actor.learnerId, topicId],
        )
      ).rows[0];
      if (!p || !p.available)
        throw new OperationError(
          403,
          'Complete the preceding topic to unlock this activity.',
        );

      const problemSnapshots = [];
      let anyUnattempted = false;
      for (const pr of problems) {
        const draft = await readDraft(c, actor, pr, true);
        if (!draft.attempted) anyUnattempted = true;
        problemSnapshots.push({
          problemId: pr.problemId,
          slug: pr.slug,
          workRevision: draft.workRevision,
          source: draft.source,
          attempted: draft.attempted,
          caseIds: pr.tests.map((t) => t.id),
        });
      }

      const id = randomUUID();
      const first = problemSnapshots[0];
      const snapshot = {
        topicId,
        learnerId: actor.learnerId,
        problemId: problems[0].problemId,
        workRevision: first.workRevision,
        source: first.source,
        attempted: first.attempted,
        caseIds: first.caseIds,
        assessment: { topicId, revision: a.revision },
        problems: problemSnapshots,
      };

      await c.query(
        'INSERT INTO submission_reviews(id,learner_id,snapshot) VALUES($1,$2,$3)',
        [id, actor.learnerId, snapshot],
      );
      return {
        reviewToken: id,
        unattempted: anyUnattempted,
        workRevision: first.workRevision,
        source: first.source,
        assessment: snapshot.assessment,
        problems: problemSnapshots.map((pr) => ({
          problemId: pr.problemId,
          slug: pr.slug,
          attempted: pr.attempted,
          caseCount: pr.caseIds.length,
        })),
      };
    });
  }

  async confirm(
    actor: Actor,
    request: {
      requestKey: string;
      reviewToken: string;
      acknowledgeUnattempted: boolean;
    },
  ) {
    keyValid(request.requestKey);
    const confirmedId = await transaction(this.pool, async (c) => {
      await lockActor(c, actor);
      const subId = randomUUID();
      const intent = hash(
        JSON.stringify({
          reviewToken: request.reviewToken,
          acknowledgeUnattempted: request.acknowledgeUnattempted,
        }),
      );
      const old = (
        await c.query(
          'SELECT * FROM topic_submissions WHERE learner_id=$1 AND request_key=$2',
          [actor.learnerId, request.requestKey],
        )
      ).rows[0];
      if (old) {
        if (old.intent_hash !== intent)
          throw new OperationError(409, 'Request identity was reused.');
        return old.id as string;
      }
      const review = (
        await c.query(
          "SELECT * FROM submission_reviews WHERE id=$1 AND learner_id=$2 AND created_at>now()-interval '10 minutes'",
          [request.reviewToken, actor.learnerId],
        )
      ).rows[0];
      if (!review)
        throw new OperationError(409, 'Review your submission again.');

      const fixed = review.snapshot;
      const topicId = fixed.topicId || fixed.assessment.topicId;
      const a = await assessmentFor(c, topicId);
      const problems = getProblems(a);
      if (a.revision !== fixed.assessment.revision)
        throw new OperationError(
          409,
          'The assessment content was updated. Review your submission again.',
        );

      const problemSnaps = fixed.problems || [fixed];
      let hasUnattempted = false;
      const evaluationsToLink: {
        problemId: string;
        evaluationId: string | null;
      }[] = [];

      for (const pr of problems) {
        const snap =
          problemSnaps.find((s: any) => s.problemId === pr.problemId) ||
          problemSnaps[0];
        const draft = await readDraft(c, actor, pr, true);
        if (
          draft.workRevision !== snap.workRevision ||
          draft.source !== snap.source ||
          draft.attempted !== snap.attempted
        ) {
          throw new OperationError(
            409,
            'Your work changed after review. Review it again before confirming.',
          );
        }
        if (!snap.attempted) {
          hasUnattempted = true;
          evaluationsToLink.push({
            problemId: pr.problemId,
            evaluationId: null,
          });
        } else {
          const fixedContext: FixedContext = {
            ...draft,
            attempted: true,
            learnerId: actor.learnerId,
            problemId: pr.problemId,
            languageVersion: pr.languageVersion,
            assessment: { topicId, revision: a.revision },
            caseIds: pr.tests.map((t) => t.id),
          };
          const batches = (
            await c.query(
              "SELECT * FROM evaluation_attempts WHERE learner_id=$1 AND kind='batch' AND state='confirmed' ORDER BY created_at DESC",
              [actor.learnerId],
            )
          ).rows;
          let evalId =
            batches.find((b) =>
              isEligibleBatch(
                {
                  context: b.context as EvaluationContext,
                  kind: 'batch',
                  decision: { kind: 'confirmed', ...b.result },
                },
                fixedContext,
              ),
            )?.id ?? null;
          evalId ??= await this.createEvaluation(
            c,
            actor,
            `submission-${subId}-${pr.slug}`,
            'batch',
            fixedContext,
            false,
          );
          evaluationsToLink.push({
            problemId: pr.problemId,
            evaluationId: evalId,
          });
        }
      }

      if (hasUnattempted && !request.acknowledgeUnattempted)
        throw new OperationError(
          400,
          'Confirm that the unattempted problem contributes zero.',
        );
      const firstEvalId =
        evaluationsToLink.find((e) => e.evaluationId)?.evaluationId ?? null;
      const submissionSnapshot = {
        ...fixed,
        evaluations: evaluationsToLink,
      };

      await c.query(
        'INSERT INTO topic_submissions(id,learner_id,request_key,review_id,intent_hash,snapshot,evaluation_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          subId,
          actor.learnerId,
          request.requestKey,
          request.reviewToken,
          intent,
          submissionSnapshot,
          firstEvalId,
        ],
      );
      await this.finalizeIn(c, subId);
      return subId;
    });
    return this.read(actor, confirmedId);
  }

  async finalizeIn(c: pg.PoolClient, id: string) {
    const s = (
      await c.query(
        'SELECT * FROM topic_submissions WHERE id=$1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!s || s.state === 'finalized') return;

    const topicId = s.snapshot.topicId || s.snapshot.assessment.topicId;
    const a = await assessmentFor(c, topicId);
    const problems = getProblems(a);
    const totalPossible = problems.reduce(
      (sum, pr) => sum + pr.tests.length * 10,
      0,
    );

    const evaluationsList: {
      problemId: string;
      evaluationId: string | null;
    }[] =
      s.snapshot.evaluations ||
      (s.evaluation_id
        ? [
            {
              problemId: s.snapshot.problemId,
              evaluationId: s.evaluation_id,
            },
          ]
        : []);

    let totalEarned = 0;
    let anyPending = false;
    let anyRetryable = false;

    for (const item of evaluationsList) {
      if (!item.evaluationId) continue;
      const evalRow = (
        await c.query(
          'SELECT * FROM evaluation_attempts WHERE id=$1',
          [item.evaluationId],
        )
      ).rows[0];
      if (!evalRow || evalRow.state === 'pending') {
        anyPending = true;
      } else if (evalRow.state === 'retryable-error') {
        anyRetryable = true;
      } else if (evalRow.state === 'confirmed') {
        totalEarned += evalRow.result?.score?.earned ?? 0;
      }
    }

    if (anyPending) {
      await c.query(
        "UPDATE topic_submissions SET state='pending' WHERE id=$1",
        [id],
      );
      return;
    }
    if (anyRetryable) {
      await c.query(
        "UPDATE topic_submissions SET state='retryable-error' WHERE id=$1",
        [id],
      );
      return;
    }

    const score = { earned: totalEarned, possible: totalPossible };
    const p = (
      await c.query(
        'SELECT * FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2 FOR UPDATE',
        [s.learner_id, topicId],
      )
    ).rows[0];
    if (!p.best_score || betterScore(score, p.best_score))
      await c.query(
        'UPDATE learner_topic_progress SET best_score=$3,best_submission=$4 WHERE learner_id=$1 AND topic_id=$2',
        [s.learner_id, topicId, score, id],
      );
    if (passes(score)) {
      await c.query(
        'UPDATE learner_topic_progress SET completed=true WHERE learner_id=$1 AND topic_id=$2',
        [s.learner_id, topicId],
      );
      await c.query(
        'UPDATE learner_topic_progress SET available=true WHERE learner_id=$1 AND topic_id=(SELECT id FROM topics WHERE position=(SELECT position+1 FROM topics WHERE id=$2))',
        [s.learner_id, topicId],
      );
    }
    await c.query(
      "UPDATE topic_submissions SET state='finalized',score=$2 WHERE id=$1",
      [id, score],
    );
  }

  async read(actor: Actor, id: string): Promise<OperationView> {
    await this.recoverAvailable(actor);
    let row = (
      await this.pool.query(
        'SELECT * FROM evaluation_attempts WHERE id=$1 AND learner_id=$2',
        [id, actor.learnerId],
      )
    ).rows[0];
    const type = row ? 'evaluation' : 'submission';
    row ??= (
      await this.pool.query(
        'SELECT * FROM topic_submissions WHERE id=$1 AND learner_id=$2',
        [id, actor.learnerId],
      )
    ).rows[0];
    if (!row) throw new OperationError(404, 'Operation not found.');

    if (type === 'evaluation') {
      const context = row.context as FixedContext;
      const a = await assessmentFor(
        this.pool,
        context.assessment.topicId,
        context.assessment.revision,
      );
      const prob = problemFromAssessment(a, context.problemId);
      const draft = await readDraft(this.pool, actor, prob);
      const result = (row.result ?? { feedback: [] }) as Result;
      const job =
        row.state === 'pending'
          ? (
              await this.pool.query(
                'SELECT lease_until>now() AS live,outcome IS NOT NULL AS finished FROM evaluation_exchange.jobs WHERE id=$1',
                [row.id],
              )
            ).rows[0]
          : undefined;
      const pendingMessage = job?.finished
        ? 'Execution finished. Recording the result.'
        : job?.live
        ? 'Evaluation is running.'
        : 'Evaluation is queued. If execution cannot start, recovery becomes available after two minutes.';
      const feedback = result.feedback.map((f) =>
        prob.tests.find((t) => t.id === f.caseId)?.visibility === 'hidden'
          ? { caseId: f.caseId, status: f.status }
          : f,
      );
      return {
        operationId: row.id,
        type,
        kind: row.kind,
        state: row.state === 'finalized' ? 'confirmed' : row.state,
        currentForDraft:
          draft.source === context.source &&
          draft.workRevision === context.workRevision,
        score: result.score,
        feedback,
        message:
          row.state === 'retryable-error'
            ? 'Evaluation service interrupted. Your work and earlier progress are preserved. Retry this operation.'
            : row.state === 'pending'
            ? pendingMessage
            : undefined,
      };
    } else {
      const snap = row.snapshot;
      const topicId = snap.topicId || snap.assessment.topicId;
      const a = await assessmentFor(
        this.pool,
        topicId,
        snap.assessment.revision,
      );
      const problems = getProblems(a);
      const prob =
        problems.find((p) => p.problemId === snap.problemId) || problems[0];
      const draft = await readDraft(this.pool, actor, prob);
      const job =
        row.state === 'pending' && row.evaluation_id
          ? (
              await this.pool.query(
                'SELECT lease_until>now() AS live,outcome IS NOT NULL AS finished FROM evaluation_exchange.jobs WHERE id=$1',
                [row.evaluation_id],
              )
            ).rows[0]
          : undefined;
      const pendingMessage = job?.finished
        ? 'Execution finished. Recording the result.'
        : job?.live
        ? 'Evaluation is running.'
        : 'Evaluation is queued. If execution cannot start, recovery becomes available after two minutes.';
      return {
        operationId: row.id,
        type,
        state: row.state === 'finalized' ? 'confirmed' : row.state,
        currentForDraft:
          draft.source === snap.source &&
          draft.workRevision === snap.workRevision,
        score: row.score ?? undefined,
        feedback: [],
        message:
          row.state === 'retryable-error'
            ? 'Submission service interrupted. Your work and earlier progress are preserved. Retry this operation.'
            : row.state === 'pending'
            ? pendingMessage
            : undefined,
      };
    }
  }

  async retry(actor: Actor, id: string) {
    await transaction(this.pool, async (c) => {
      await lockActor(c, actor);
      let e = (
        await c.query(
          'SELECT * FROM evaluation_attempts WHERE id=$1 AND learner_id=$2 FOR UPDATE',
          [id, actor.learnerId],
        )
      ).rows[0];
      if (!e) {
        const s = (
          await c.query(
            'SELECT * FROM topic_submissions WHERE id=$1 AND learner_id=$2 FOR UPDATE',
            [id, actor.learnerId],
          )
        ).rows[0];
        if (!s) throw new OperationError(404, 'Operation not found.');
        if (s.state !== 'retryable-error') return;
        e = (
          await c.query(
            'SELECT * FROM evaluation_attempts WHERE id=$1 FOR UPDATE',
            [s.evaluation_id],
          )
        ).rows[0];
        await c.query(
          "UPDATE topic_submissions SET state='pending' WHERE id=$1",
          [id],
        );
      }
      if (e.state !== 'retryable-error') return;
      const job = (
        await c.query(
          'SELECT *,lease_until>now() AS live FROM evaluation_exchange.jobs WHERE id=$1 FOR UPDATE',
          [e.id],
        )
      ).rows[0];
      if (job?.live && !job.outcome)
        throw new OperationError(
          409,
          'Evaluation is still running. Reconnect to its result.',
        );
      if (job?.outcome && !job.acknowledged) return;
      if (e.kind === 'batch') {
        const window = (
          await c.query(
            'SELECT pending_batch FROM validation_windows WHERE learner_id=$1 AND problem_id=$2 FOR UPDATE',
            [actor.learnerId, e.context.problemId],
          )
        ).rows[0];
        if (window?.pending_batch && window.pending_batch !== e.id) {
          const other = (
            await c.query(
              'SELECT state FROM evaluation_attempts WHERE id=$1',
              [window.pending_batch],
            )
          ).rows[0];
          if (other?.state === 'pending')
            throw new OperationError(
              409,
              'A validation is already pending for this problem.',
            );
        }
        await c.query(
          'UPDATE validation_windows SET pending_batch=$3 WHERE learner_id=$1 AND problem_id=$2',
          [actor.learnerId, e.context.problemId, e.id],
        );
      } else {
        const other = await c.query(
          "SELECT id FROM evaluation_attempts WHERE learner_id=$1 AND context->>'problemId'=$2 AND kind='single' AND state='pending' AND id<>$3",
          [actor.learnerId, e.context.problemId, e.id],
        );
        if (other.rowCount)
          throw new OperationError(409, 'A run is already pending.');
      }
      await c.query(
        "UPDATE evaluation_attempts SET state='pending',result=NULL,retry_requested_at=now() WHERE id=$1",
        [e.id],
      );
      await c.query(
        "UPDATE topic_submissions SET state='pending' WHERE evaluation_id=$1 AND state='retryable-error'",
        [e.id],
      );
      await c.query(
        'UPDATE evaluation_exchange.jobs SET deliveries=0,outcome=NULL,acknowledged=false,lease_until=NULL,retry_after=now() WHERE id=$1 AND (lease_until IS NULL OR lease_until<=now() OR outcome IS NOT NULL)',
        [e.id],
      );
      await c.query(
        'UPDATE evaluation_dispatch SET notified_at=NULL WHERE evaluation_id=$1',
        [e.id],
      );
    });
    return this.read(actor, id);
  }

  async ingest(id: string, outcome: ExecutionOutcome, generation: number) {
    return transaction(this.pool, async (c) => {
      const e = (
        await c.query(
          'SELECT * FROM evaluation_attempts WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!e || e.state === 'confirmed') return;
      const exchange = (
        await c.query(
          'SELECT generation,outcome,acknowledged,outcome=$2::jsonb AS same_evidence FROM evaluation_exchange.jobs WHERE id=$1 FOR UPDATE',
          [id, JSON.stringify(outcome)],
        )
      ).rows[0];
      if (
        !exchange ||
        exchange.generation !== generation ||
        exchange.acknowledged ||
        !exchange.same_evidence
      )
        return;
      if (
        !outcome ||
        !Array.isArray(outcome.cases) ||
        outcome.cases.some(
          (x) =>
            !x ||
            typeof x.stdoutBase64 !== 'string' ||
            typeof x.diagnostics !== 'string' ||
            typeof x.compilerVersion !== 'string' ||
            typeof x.caseId !== 'string' ||
            typeof x.cleanupConfirmed !== 'boolean' ||
            ![
              'completed',
              'compile-failure',
              'runtime-failure',
              'timeout',
              'output-limit',
              'operational-error',
              'interrupted',
            ].includes(x.outcome),
        )
      )
        throw new InvalidExecutionEvidence('Malformed execution evidence.');
      if (
        !exchange ||
        exchange.generation !== generation ||
        outcome.generation !== generation ||
        outcome.requestId !== id ||
        outcome.sourceHash !== hash(e.context.source) ||
        outcome.assessment?.topicId !== e.context.assessment.topicId ||
        outcome.assessment?.revision !== e.context.assessment.revision ||
        outcome.contractVersion !== 1
      )
        throw new InvalidExecutionEvidence(
          'Execution evidence association mismatch.',
        );
      const a = await assessmentFor(
        c,
        e.context.assessment.topicId,
        e.context.assessment.revision,
      );
      const prob = problemFromAssessment(a, e.context.problemId);
      if (
        outcome.cases.length !== e.context.caseIds.length ||
        new Set(outcome.cases.map((x) => x.caseId)).size !==
          outcome.cases.length ||
        outcome.cases.some((x) => !e.context.caseIds.includes(x.caseId))
      )
        throw new InvalidExecutionEvidence('Execution scope mismatch.');
      if (
        outcome.cases.some(
          (x) =>
            !x.cleanupConfirmed ||
            ['operational-error', 'interrupted'].includes(x.outcome),
        )
      ) {
        await c.query(
          "UPDATE evaluation_attempts SET state='retryable-error' WHERE id=$1",
          [id],
        );
      } else {
        const feedback: Feedback[] = outcome.cases.map((x) => {
          if (
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
              x.stdoutBase64,
            ) ||
            x.stdoutBase64.length > 1400000 ||
            x.diagnostics.length > 1048576 ||
            !x.compilerVersion.includes('1.0.5')
          )
            throw new InvalidExecutionEvidence(
              'Invalid bounded execution evidence.',
            );
          const expected = prob.tests.find((t) => t.id === x.caseId)!;
          const actual = Buffer.from(x.stdoutBase64, 'base64'),
            wanted = Buffer.from(expected.expectedBase64, 'base64');
          const isFormat =
            !sameBytes(actual, wanted) &&
            actual
              .toString('utf8')
              .replace(/\r\n/g, '\n')
              .split('\n')
              .map((l) => l.trimEnd())
              .join('\n')
              .trimEnd() ===
              wanted
                .toString('utf8')
                .replace(/\r\n/g, '\n')
                .split('\n')
                .map((l) => l.trimEnd())
                .join('\n')
                .trimEnd();
          const status =
            x.outcome === 'completed'
              ? sameBytes(actual, wanted)
                ? 'pass'
                : isFormat
                ? 'format-mismatch'
                : 'fail'
              : x.outcome === 'compile-failure'
              ? 'compile-error'
              : x.outcome;
          return {
            caseId: x.caseId,
            status,
            actual: actual.toString('utf8'),
            expected: wanted.toString('utf8'),
            diagnostics: x.diagnostics,
          };
        });
        const compile = outcome.cases.some(
          (x) => x.outcome === 'compile-failure',
        );
        const decision = evaluate(
          e.kind,
          e.context.caseIds,
          compile
            ? { kind: 'compile-failure' }
            : {
                kind: 'executed',
                cases: feedback.map((f) => ({
                  caseId: f.caseId,
                  outcome:
                    f.status === 'pass'
                      ? 'pass'
                      : f.status === 'timeout'
                      ? 'timeout'
                      : f.status === 'output-limit'
                      ? 'output-limit'
                      : 'fail',
                })),
              },
        );
        if (decision.kind !== 'confirmed')
          throw new InvalidExecutionEvidence(
            'Incomplete outcome cannot be confirmed.',
          );
        const result: Result = { ...decision, feedback };
        await c.query(
          "UPDATE evaluation_attempts SET state='confirmed',result=$2 WHERE id=$1",
          [id, result],
        );
        if (decision.solved)
          await c.query(
            'INSERT INTO solved_achievements VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
            [e.learner_id, e.context.problemId, id],
          );
      }
      await c.query(
        'UPDATE evaluation_exchange.jobs SET acknowledged=true WHERE id=$1',
        [id],
      );
      await c.query(
        'UPDATE validation_windows SET pending_batch=NULL WHERE pending_batch=$1',
        [id],
      );
    });
  }

  async rejectEvidence(
    id: string,
    outcome: ExecutionOutcome,
    generation: number,
  ) {
    await transaction(this.pool, async (c) => {
      const e = (
        await c.query(
          'SELECT state FROM evaluation_attempts WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      const j = (
        await c.query(
          'SELECT *,outcome=$2::jsonb AS same_evidence FROM evaluation_exchange.jobs WHERE id=$1 FOR UPDATE',
          [id, JSON.stringify(outcome)],
        )
      ).rows[0];
      if (
        !e ||
        e.state === 'confirmed' ||
        !j ||
        j.generation !== generation ||
        j.acknowledged ||
        !j.same_evidence
      )
        return;
      await c.query(
        "UPDATE evaluation_attempts SET state='retryable-error' WHERE id=$1",
        [id],
      );
      await c.query(
        'UPDATE evaluation_exchange.jobs SET acknowledged=true WHERE id=$1',
        [id],
      );
      await c.query(
        'UPDATE validation_windows SET pending_batch=NULL WHERE pending_batch=$1',
        [id],
      );
    });
  }

  async continueSubmissions(actor?: Actor) {
    const rows = (
      await this.pool.query(
        "SELECT s.id,s.learner_id FROM topic_submissions s LEFT JOIN evaluation_attempts e ON e.id=s.evaluation_id WHERE ($1::uuid IS NULL OR s.learner_id=$1) AND (s.state='pending' OR (s.state='retryable-error' AND e.state IN ('pending','confirmed'))) ORDER BY s.created_at LIMIT 20",
        [actor?.learnerId ?? null],
      )
    ).rows;
    for (const row of rows)
      await transaction(this.pool, async (c) => {
        await lockActor(c, { learnerId: row.learner_id });
        await this.finalizeIn(c, row.id);
      });
  }
}
