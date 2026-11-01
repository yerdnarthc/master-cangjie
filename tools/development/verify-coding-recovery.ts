/** Real Linux process-boundary checks. Run alone; all writes require a dedicated *_test database. */
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type pg from 'pg';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { connect } from '../../infrastructure/persistence/connection.ts';
import { requireEnv, root } from '../../infrastructure/runtime/config.ts';
import { migrate } from '../../infrastructure/persistence/migrate.ts';
import { setupRoles } from '../../infrastructure/persistence/setup-roles.ts';
import { seed } from '../../infrastructure/persistence/seed-milestone.ts';
import { PostgresSubmissions } from '../../modules/topic-submission/adapters/postgres.ts';
import { assessmentFor } from '../../modules/roadmap/application/content.ts';
import { dispatch } from '../../infrastructure/evaluation-transport/postgres.ts';
import { queue } from '../../infrastructure/evaluation-transport/queue.ts';
import { reconcileSandboxes } from '../../apps/evaluation-worker/src/sandbox.ts';

const testUrl = requireEnv('TEST_DATABASE_URL');
const target = new URL(testUrl);
if (!target.pathname.endsWith('_test')) throw new Error('A dedicated *_test database is required.');
if (process.platform !== 'linux') throw new Error('Run on the Linux Docker/gVisor host.');
// Never permit a child to inherit a development-database target.
process.env.DATABASE_URL = testUrl;
process.env.MIGRATION_DATABASE_URL = testUrl;
const workerUrl = new URL(requireEnv('WORKER_DATABASE_URL'));
workerUrl.host = target.host;
workerUrl.pathname = target.pathname;
process.env.WORKER_DATABASE_URL = workerUrl.toString();
const { pool } = connect(testUrl);
const app = new PostgresSubmissions(pool);
const script = fileURLToPath(import.meta.url);
const dockerExec = promisify(execFile);
const children = new Set<ChildProcess>();
let leaseDirectory: string | undefined;
let guard: pg.PoolClient | undefined;
let queueLock: pg.PoolClient | undefined;

async function until<T>(description: string, probe: () => Promise<T | undefined | false>, timeout = 90_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) return value;
    await delay(50);
  }
  throw new Error(`Timed out: ${description}`);
}
async function docker(args: string[]) {
  return (await dockerExec('docker', args, { timeout: 20_000, maxBuffer: 1024 * 1024 })).stdout.trim();
}
function launch(file: string, args: string[] = []): ChildProcess {
  const child = spawn(process.execPath, ['--experimental-transform-types', file, ...args], {
    cwd: root, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  children.add(child);
  // Do not echo child errors: database/provider exceptions may contain private configuration.
  let log = '';
  child.stdout?.on('data', chunk => { log = (log + String(chunk)).slice(-8192); });
  child.stderr?.on('data', () => undefined);
  child.on('exit', () => children.delete(child));
  child.on('error', () => undefined);
  (child as ChildProcess & { auditLog: () => string }).auditLog = () => log;
  return child;
}
async function kill(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>(resolveClose => child.once('close', () => resolveClose()));
  if (child.pid) {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  }
  await Promise.race([closed, delay(5000).then(() => { throw new Error('Child did not stop.'); })]);
}
async function boundary(mode: string, payload: object) {
  const child = launch(script, ['--child', mode, JSON.stringify(payload)]);
  await until(`trusted process ${mode}`, async () => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Trusted process ${mode} exited early.`);
    return (child as ChildProcess & { auditLog: () => string }).auditLog().includes('BOUNDARY_READY') || undefined;
  });
  await kill(child);
}
async function worker() {
  const child = launch(resolve(root, 'apps/evaluation-worker/src/main.ts'));
  await until('worker startup', async () => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Worker exited during startup.');
    return (child as ChildProcess & { auditLog: () => string }).auditLog().includes('Isolated Cangjie worker started') || undefined;
  });
  return child;
}

async function childMain(mode: string, payload: { actor: { learnerId: string }; operationId: string; requestKey: string; source: string; reviewToken: string }) {
  if (mode === 'intent-before-commit') {
    const assessment = await assessmentFor(pool);
    const original = pool.connect.bind(pool);
    pool.connect = (async () => {
      const client = await original();
      const query = client.query.bind(client);
      client.query = ((...args: unknown[]) => {
        if (args[0] === 'COMMIT') { console.log('BOUNDARY_READY'); return new Promise(() => undefined); }
        return (query as (...input: unknown[]) => unknown)(...args);
      }) as typeof client.query;
      return client;
    }) as typeof pool.connect;
    await app.request(payload.actor, { requestKey: payload.requestKey, problemId: assessment.problemId, workRevision: 1,
      assessment: { topicId: assessment.topicId, revision: assessment.revision }, kind: 'batch' });
  } else if (mode === 'intent-after-commit') {
    const assessment = await assessmentFor(pool);
    await app.request(payload.actor, { requestKey: payload.requestKey, problemId: assessment.problemId, workRevision: 1,
      assessment: { topicId: assessment.topicId, revision: assessment.revision }, kind: 'batch' });
  } else if (mode === 'dispatch-after-commit') {
    const boss = queue(testUrl); await boss.start();
    await dispatch(pool, boss); await boss.stop();
  } else if (mode === 'ingestion-before-continuation') {
    const row = (await pool.query('SELECT generation,outcome FROM evaluation_exchange.jobs WHERE id=$1', [payload.operationId])).rows[0];
    assert.ok(row?.outcome);
    await app.ingest(payload.operationId, row.outcome, row.generation);
  } else if (mode === 'finalization-before-commit') {
    const client = await pool.connect();
    await client.query('BEGIN'); await app.finalizeIn(client, payload.operationId);
    console.log('BOUNDARY_READY');
    await new Promise(() => undefined);
  } else if (mode === 'finalization-after-commit') {
    await app.continueSubmissions();
  } else throw new Error('Unknown boundary.');
  console.log('BOUNDARY_READY');
  await new Promise(() => undefined);
}

const mode = process.argv[2] === '--child' ? process.argv[3] : undefined;
if (mode) {
  await childMain(mode, JSON.parse(process.argv[4]));
} else {
  try {
    await migrate(testUrl); await setupRoles(testUrl); await seed(testUrl);
    // A host advisory lock prevents simultaneous runs of this harness. Other test
    // suites must also be stopped because the application has a global worker slot.
    guard = await pool.connect();
    assert.equal((await guard.query('SELECT pg_try_advisory_lock(582049) AS held')).rows[0].held, true, 'Another recovery harness is running.');
    leaseDirectory = await mkdtemp(join(tmpdir(), 'mcj-process-recovery-'));
    process.env.MCJ_EVALUATOR_LEASE_DIRECTORY = leaseDirectory;
    console.log(`Recovery lease directory: ${leaseDirectory}`);
    requireEnv('MCJ_EVALUATOR_IMAGE'); requireEnv('MCJ_EVALUATOR_RUNTIME');
    const assessment = await assessmentFor(pool);
    const source = 'main(): Int64 { println("Hello, World!"); return 0 }';
    async function fixture(value = source) {
      const actor = { learnerId: randomUUID() };
      await pool.query('INSERT INTO learner_accounts VALUES($1,$2)', [actor.learnerId, `process-${actor.learnerId}`]);
      await pool.query('INSERT INTO learner_topic_progress(learner_id,topic_id,available,completed) SELECT $1,id,position<3,position<2 FROM topics', [actor.learnerId]);
      const saved = await app.save(actor, { problemId: assessment.problemId, baseRevision: 0, source: value });
      assert.equal(saved.kind, 'saved');
      return actor;
    }
    async function request(actor: { learnerId: string }, requestKey = randomUUID()) {
      return app.request(actor, { requestKey, problemId: assessment.problemId, workRevision: 1,
        assessment: { topicId: assessment.topicId, revision: assessment.revision }, kind: 'batch' });
    }
    async function outcome(id: string) {
      // Mirror the trusted continuation loop. A same-key send inside pg-boss's
      // ten-second singleton slot may be suppressed, so one send is insufficient
      // after retry. dispatch itself honors its notification and lease guards.
      let nextDispatch = Date.now() + 10_000;
      return until('durable real worker outcome', async () => {
        if (Date.now() >= nextDispatch) {
          await send();
          nextDispatch = Date.now() + 10_000;
        }
        const row = (await pool.query('SELECT * FROM evaluation_exchange.jobs WHERE id=$1', [id])).rows[0];
        return row?.outcome ? row : undefined;
      });
    }
    async function send() { const boss = queue(testUrl); await boss.start(); try { await dispatch(pool, boss); } finally { await boss.stop(); } }

    const beforeActor = await fixture();
    const uncommittedKey = `uncommitted-${randomUUID()}`;
    await boundary('intent-before-commit', { actor: beforeActor, requestKey: uncommittedKey });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM evaluation_attempts WHERE learner_id=$1', [beforeActor.learnerId])).rows[0].n, 0);
    console.log('PASS before dispatch-intent commit: hard trusted-process death rolls back accepted work and outbox together.');

    const actor = await fixture();
    const key = randomUUID();
    await boundary('intent-after-commit', { actor, requestKey:key });
    const op = await request(actor, key);
    assert.equal((await request(actor, key)).operationId, op.operationId);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM evaluation_attempts WHERE learner_id=$1 AND request_key=$2', [actor.learnerId,key])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT notified_at FROM evaluation_dispatch WHERE evaluation_id=$1', [op.operationId])).rows[0].notified_at, null);
    const review = await app.review(actor, assessment.topicId);
    const sub = await app.confirm(actor, { requestKey: randomUUID(), reviewToken: review.reviewToken, acknowledgeUnattempted: false });
    await boundary('dispatch-after-commit', { actor, operationId: op.operationId });
    let running = await worker();
    await outcome(op.operationId); await kill(running);
    console.log('PASS after intent commit/before notification: restarted trusted process dispatches durable intent and real worker supplies outcome.');

    await boundary('ingestion-before-continuation', { actor, operationId: op.operationId });
    await boundary('ingestion-before-continuation', { actor, operationId: op.operationId });
    assert.equal((await pool.query('SELECT state FROM evaluation_attempts WHERE id=$1', [op.operationId])).rows[0].state, 'confirmed');
    assert.equal((await pool.query('SELECT state FROM topic_submissions WHERE id=$1', [sub.operationId])).rows[0].state, 'pending');
    await boundary('finalization-before-commit', { actor, operationId: sub.operationId });
    assert.equal((await pool.query('SELECT state FROM topic_submissions WHERE id=$1', [sub.operationId])).rows[0].state, 'pending');
    const rolledBackProgress = (await pool.query('SELECT best_score,completed FROM learner_topic_progress WHERE learner_id=$1 AND topic_id=$2', [actor.learnerId,assessment.topicId])).rows[0];
    assert.deepEqual(rolledBackProgress, {best_score:null,completed:false});
    assert.equal((await pool.query("SELECT available FROM learner_topic_progress WHERE learner_id=$1 AND topic_id='identifiers'", [actor.learnerId])).rows[0].available, false);
    await boundary('finalization-after-commit', { actor, operationId: sub.operationId });
    await boundary('finalization-after-commit', { actor, operationId: sub.operationId });
    assert.equal((await app.read(actor, sub.operationId)).state, 'confirmed');
    assert.deepEqual((await app.workspace(actor)).progress.bestScore, { earned: 10, possible: 10 });
    assert.equal((await app.workspace(actor)).progress.nextTopicAvailable, true);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM solved_achievements WHERE learner_id=$1', [actor.learnerId])).rows[0].n, 1);
    console.log('PASS ingestion before continuation and before/after finalization commit: process deaths preserve atomic progress and finalize once after restart.');

    for (const phase of ['compile', 'execute'] as const) {
      const killedActor = await fixture(phase === 'compile' ? source : 'main(): Int64 { while (true) {}\n return 0 }');
      const killedOp = await request(killedActor);
      await send(); running = await worker();
      const container = await until(`sandbox ${phase} phase`, async () => {
        const id = await docker(['ps', '-q', '--filter', `label=io.mastercangjie.request=${killedOp.operationId}`]);
        if (!id) return undefined;
        // runsc's Docker top view is not the guest PID namespace. Read guest
        // cmdlines with bash builtins; the evaluator image need not contain ps.
        const commands = await docker(['exec', id, '/bin/bash', '-c',
          'for path in /proc/[0-9]*/cmdline; do [ -r "$path" ] || continue; line=""; while IFS= read -r -d "" arg; do line="$line $arg"; done < "$path"; printf "%s\\n" "$line"; done'
        ]).catch(() => '');
        // Match complete argv lines so the inspection shell's own embedded
        // script cannot be mistaken for a running compiler/program.
        return commands.split('\n').some(line => phase === 'compile'
          ? /^\s*\S*\bcjc\s+main\.cj(?:\s|$)/.test(line)
          : /^\s*\.\/program(?:\s|$)/.test(line)) ? id : undefined;
      });
      const generation = (await pool.query('SELECT generation FROM evaluation_exchange.jobs WHERE id=$1', [killedOp.operationId])).rows[0].generation;
      await kill(running);
      assert.ok(await docker(['ps', '-aq', '--filter', `id=${container}`]), 'Abrupt worker death should leave recoverable container.');
      // Advance only persisted test-clock inputs, avoiding a literal 90s lease and
      // 120s stale wait; real child death and sandbox cleanup are not simulated.
      await pool.query("UPDATE evaluation_exchange.jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [killedOp.operationId]);
      await pool.query("UPDATE evaluation_attempts SET created_at=now()-interval '3 minutes',retry_requested_at=NULL WHERE id=$1", [killedOp.operationId]);
      assert.equal((await app.read(killedActor, killedOp.operationId)).state, 'retryable-error');
      assert.equal((await pool.query('SELECT evaluation_exchange.heartbeat($1,$2) AS alive', [killedOp.operationId, generation])).rows[0].alive, false);
      running = await worker();
      assert.equal(await docker(['ps', '-aq', '--filter', `id=${container}`]), '', 'Restart must reconcile orphan sandbox.');
      assert.equal((await app.retry(killedActor, killedOp.operationId)).operationId, killedOp.operationId);
      await send(); const recovered = await outcome(killedOp.operationId); await kill(running);
      assert.ok(recovered.generation > generation);
      await boundary('ingestion-before-continuation', { actor: killedActor, operationId: killedOp.operationId });
      const result = await app.read(killedActor, killedOp.operationId);
      assert.equal(result.state, 'confirmed');
      assert.deepEqual(result.score, { earned: phase === 'compile' ? 10 : 0, possible: 10 });
      console.log(`PASS hard worker death during ${phase}: restart removes orphan, fences old generation and retries same operation with real compiler.`);
    }

    const ackActor = await fixture();
    const ackOp = await request(ackActor); await send(); running = await worker();
    await until('worker exchange claim', async () => (await pool.query('SELECT generation FROM evaluation_exchange.jobs WHERE id=$1', [ackOp.operationId])).rows[0]?.generation > 0 || undefined);
    queueLock = await pool.connect();
    await queueLock.query('BEGIN');
    const locked = await queueLock.query("SELECT id FROM evaluation_queue.job WHERE data->>'requestId'=$1 AND state='active' FOR UPDATE", [ackOp.operationId]);
    assert.ok(locked.rowCount, 'Must hold active queue delivery before acknowledgement.');
    await outcome(ackOp.operationId);
    await kill(running);
    await queueLock.query('ROLLBACK'); queueLock.release(); queueLock = undefined;
    running = await worker();
    await boundary('ingestion-before-continuation', { actor: ackActor, operationId: ackOp.operationId });
    await kill(running);
    assert.equal((await app.read(ackActor, ackOp.operationId)).state, 'confirmed');
    assert.equal((await pool.query('SELECT acknowledged FROM evaluation_exchange.jobs WHERE id=$1', [ackOp.operationId])).rows[0].acknowledged, true);
    console.log('PASS durable outcome before queue acknowledgement: hard worker death preserves evidence for trusted ingestion after restart.');
    const clean = await reconcileSandboxes(leaseDirectory);
    assert.deepEqual(clean.active, []);
    assert.deepEqual(clean.refused, []);
    await guard.query('SELECT pg_advisory_unlock(582049)'); guard.release(); guard = undefined;
    console.log('PASS complete real-process recovery matrix. Test-clock lease/stale expiry was accelerated explicitly; production timeout durations were not measured.');
  } finally {
    await Promise.allSettled([...children].map(kill));
    if (queueLock) { await queueLock.query('ROLLBACK').catch(() => undefined); queueLock.release(); }
    if (guard) { await guard.query('SELECT pg_advisory_unlock(582049)').catch(() => undefined); guard.release(); }
    try { if (leaseDirectory) await reconcileSandboxes(leaseDirectory); }
    finally { await pool.end(); }
  }
}
