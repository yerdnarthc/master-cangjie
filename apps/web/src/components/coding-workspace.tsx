'use client';
import dynamic from 'next/dynamic';
import Markdown from 'react-markdown';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserDrafts, type PendingRequest } from '../../../../modules/activity-draft/adapters/browser-drafts.ts';
import type { OperationView, Review, SaveResult, Workspace } from './workspace-contract.ts';

const CodeEditor = dynamic(() => import('./code-editor.tsx'), { ssr: false, loading: () => <p role="status">Loading the editor…</p> });
class RequestError extends Error { constructor(message: string, public status: number, public retryAfter = 0) { super(message); } }
async function request<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? 'GET' : method, credentials: 'same-origin', cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new RequestError(data.error ?? 'The request could not be completed.', response.status, data.retryAfter ?? 0);
  return data as T;
}

export default function CodingWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [source, setSource] = useState('');
  const [saveStatus, setSaveStatus] = useState('Loading your work…');
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Extract<SaveResult, { kind: 'conflict' }>>();
  const [operation, setOperation] = useState<OperationView>();
  const [pending, setPending] = useState<PendingRequest>();
  const [review, setReview] = useState<Review>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [online, setOnline] = useState(true);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const current = useRef<Workspace | undefined>(undefined);
  const sourceRef = useRef('');
  const revision = useRef(0);
  const dirty = useRef(false);
  const conflictRef = useRef(false);
  const actor = useRef('');
  const saving = useRef<Promise<boolean> | undefined>(undefined);
  const acting = useRef(false);

  const cache = useCallback(async () => {
    const w = current.current;
    if (!w) return;
    await browserDrafts.save({ learnerId: w.learnerId, problemId: w.problem.problemId,
      source: sourceRef.current, baseRevision: revision.current, dirty: dirty.current });
  }, []);
  const storageError = useCallback(() => { setError('This browser could not preserve local work. Keep this page open until your code is saved on the server.'); }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const w = await request<Workspace>('/api/workspace');
      const local = await browserDrafts.read(w.learnerId, w.problem.problemId).catch(() => undefined);
      const unfinished = await browserDrafts.pending(w.learnerId, w.problem.problemId).catch(() => undefined);
      actor.current = w.learnerId; current.current = w;
      sourceRef.current = local?.dirty ? local.source : w.draft.source;
      revision.current = local?.dirty ? local.baseRevision : w.draft.workRevision;
      dirty.current = local?.dirty ?? false;
      setWorkspace(w); setSource(sourceRef.current); setUnauthorized(false);
      setSaveStatus(dirty.current ? 'Unsynced local changes' : 'Saved on server');
      setPending(unfinished);
      setOperation(w.latestSubmission?.state === 'pending' ? w.latestSubmission : w.latestEvaluation ?? w.latestSubmission);
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) setUnauthorized(true);
      else setError(e instanceof Error ? e.message : 'Unable to open your work.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);

  const save = useCallback(async (): Promise<boolean> => {
    if (saving.current) return saving.current;
    const w = current.current;
    if (!w || conflictRef.current) return false;
    if (!dirty.current) return true;
    if (!navigator.onLine) { await cache().catch(storageError); setSaveStatus('Offline · changes kept on this device'); return false; }
    const sentSource = sourceRef.current;
    const sentRevision = revision.current;
    const promise = (async () => {
      setSaveStatus('Saving…');
      try {
        const result = await request<SaveResult>('/api/drafts', { problemId: w.problem.problemId, source: sentSource, baseRevision: sentRevision }, 'PUT');
        if (actor.current !== w.learnerId) return false;
        if (result.kind === 'conflict') {
          conflictRef.current = true; setConflict(result); setSaveStatus('Draft conflict · both versions preserved'); return false;
        }
        revision.current = result.workRevision;
        dirty.current = sourceRef.current !== sentSource;
        setSaveStatus(dirty.current ? 'Unsynced local changes' : 'Saved on server');
        setWorkspace(previous => previous ? { ...previous, draft: { source: sentSource, workRevision: result.workRevision, attempted: true } } : previous);
        await cache().catch(storageError);
        return !dirty.current;
      } catch (e) {
        setSaveStatus('Unsynced local changes');
        setError(e instanceof Error ? e.message : 'Save failed. Your local code is preserved.');
        await cache().catch(storageError); return false;
      }
    })();
    saving.current = promise;
    try { return await promise; } finally { saving.current = undefined; }
  }, [cache, storageError]);

  useEffect(() => {
    if (!workspace || !online || busy || conflict) return;
    const timer = setTimeout(() => { if (dirty.current) void save(); }, 800);
    return () => clearTimeout(timer);
  }, [source, workspace, online, busy, conflict, save]);

  const refreshProgress = useCallback(async () => {
    const fresh = await request<Workspace>('/api/workspace');
    if (actor.current !== fresh.learnerId) return;
    setWorkspace(previous => previous ? { ...previous, progress: fresh.progress } : previous);
  }, []);
  const acceptOperation = useCallback(async (result: OperationView) => {
    const w = current.current;
    if (!w || actor.current !== w.learnerId) return;
    setOperation(result);
    if (result.state !== 'pending') {
      await browserDrafts.forgetRequest(w.learnerId, w.problem.problemId).catch(storageError);
      setPending(undefined); await refreshProgress().catch(() => undefined);
    }
  }, [refreshProgress, storageError]);

  const pollId = pending?.operationId ?? (operation?.state === 'pending' ? operation.operationId : undefined);
  useEffect(() => {
    if (!pollId || !workspace || !online) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await request<OperationView>(`/api/operations/${encodeURIComponent(pollId)}`);
        if (cancelled) return;
        await acceptOperation(result);
        if (result.state === 'pending') timer = setTimeout(poll, 1000);
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Reconnecting to your result…'); timer = setTimeout(poll, 2500); }
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pollId, workspace?.learnerId, online, acceptOperation]);

  async function sendRemembered(record: PendingRequest) {
    const result = await request<OperationView>(record.url, record.body);
    if (actor.current !== record.learnerId) return;
    const linked = { ...record, operationId: result.operationId };
    await browserDrafts.rememberRequest(linked);
    setPending(linked); await acceptOperation(result);
  }
  async function act(work: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true; setBusy(true); setError('');
    try { await work(); }
    catch (e) {
      setError(e instanceof Error ? e.message : 'The request could not be confirmed.');
      if (e instanceof RequestError) {
        if (e.retryAfter) setCooldownUntil(Date.now() + e.retryAfter);
        if (e.status >= 400 && e.status < 500) {
          const w = current.current;
          if (w) await browserDrafts.forgetRequest(w.learnerId, w.problem.problemId).catch(storageError);
          setPending(undefined);
        }
      }
    } finally { acting.current = false; setBusy(false); }
  }
  async function evaluate(kind: 'single' | 'batch') {
    await act(async () => {
      if (!await save()) return;
      const w = current.current!;
      const record: PendingRequest = { key: browserDrafts.key(w.learnerId, w.problem.problemId), learnerId: w.learnerId, problemId: w.problem.problemId,
        url: '/api/evaluations', body: { requestKey: crypto.randomUUID(), problemId: w.problem.problemId, workRevision: revision.current,
          assessment: { topicId: w.problem.topicId, revision: w.problem.revision }, kind,
          ...(kind === 'single' ? { caseId: w.problem.tests[0].id } : {}) } };
      await browserDrafts.rememberRequest(record); setPending(record);
      if (kind === 'batch') setCooldownUntil(Date.now() + 5000);
      await sendRemembered(record);
    });
  }
  async function reviewSubmission() {
    await act(async () => {
      if (!await save()) return;
      const value = await request<Review>('/api/submissions/review', { topicId: current.current!.problem.topicId });
      setAcknowledged(false); setReview(value);
    });
  }
  async function confirmSubmission() {
    if (!review) return;
    await act(async () => {
      const w = current.current!;
      const record: PendingRequest = { key: browserDrafts.key(w.learnerId, w.problem.problemId), learnerId: w.learnerId, problemId: w.problem.problemId,
        url: '/api/submissions', body: { requestKey: crypto.randomUUID(), reviewToken: review.reviewToken, acknowledgeUnattempted: acknowledged } };
      await browserDrafts.rememberRequest(record); setPending(record); setReview(undefined);
      await sendRemembered(record);
    });
  }
  async function resolve(choice: 'server' | 'candidate') {
    if (!conflict) return;
    await act(async () => {
      const selected = conflict[choice].source;
      const beforeResolution = sourceRef.current;
      const result = await request<SaveResult>('/api/drafts/resolve', { conflictId: conflict.conflictId, choice, baseRevision: conflict.server.workRevision });
      if (result.kind === 'conflict') { setConflict(result); return; }
      const editedWhileResolving = sourceRef.current !== beforeResolution;
      if (!editedWhileResolving) sourceRef.current = selected;
      revision.current = result.workRevision; dirty.current = editedWhileResolving;
      conflictRef.current = false; setConflict(undefined); setSource(sourceRef.current); setSaveStatus(dirty.current ? 'Unsynced local changes' : 'Saved on server');
      await cache().catch(storageError);
    });
  }

  if (unauthorized) return <main className="entry-panel"><p className="eyebrow">MasterCangjie · Local milestone</p><h1>Your first Cangjie program</h1>
    <p>Open the development learner workspace to practice running and submitting Hello World.</p>
    <button disabled={busy} onClick={() => void act(async () => { await request('/api/session', {}); await load(); })}>Open development workspace</button>
    {error && <p role="alert">{error}</p>}</main>;
  if (!workspace) return <main className="entry-panel"><h1>MasterCangjie</h1><p role="status">{error || 'Opening your workspace…'}</p>{error && <button onClick={() => void load()}>Try again</button>}</main>;
  const waiting = operation?.state === 'pending' || !!pending;
  const remaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const old = operation?.type === 'evaluation' && (!operation.currentForDraft || dirty.current);
  return <div className="workspace-shell">
    <header className="topbar"><a href="/">MasterCangjie</a><span className="muted">Coding workspace</span><button onClick={() => void act(async () => {
      await request('/api/session/logout', {}); actor.current = ''; current.current = undefined;
      setWorkspace(undefined); setSource(''); sourceRef.current = ''; setOperation(undefined); setPending(undefined); setReview(undefined); setUnauthorized(true);
    })}>Sign out</button></header>
    <main>
      <nav aria-label="Learning path" className="breadcrumb">Getting Started with Cangjie <span aria-hidden="true">/</span> Running the First Cangjie Program</nav>
      <div className="workspace-heading"><div><p className="eyebrow">Your first coding activity</p><h1>{workspace.problem.title}</h1></div>
        <div className="progress-summary"><span>Best topic score: <strong>{workspace.progress.bestScore ? `${workspace.progress.bestScore.earned}/${workspace.progress.bestScore.possible}` : 'Not submitted'}</strong></span>
          <span>{workspace.progress.completed ? 'Topic complete' : 'Topic not yet complete'}</span></div></div>
      <div className="workspace-columns">
        <section className="panel instructions" aria-label="Problem instructions"><Markdown>{workspace.problem.statement}</Markdown>
          <h2>Test cases</h2>{workspace.problem.tests.map(test => <details key={test.id}><summary>{test.id} · {test.visibility === 'visible' ? 'Visible test' : 'Hidden test'}</summary>
            {test.visibility === 'visible' ? <><h3>Input</h3><pre>{test.input || '(No input)'}</pre><h3>Expected output</h3><pre>{test.expected}</pre></> : <p>This test case is hidden.</p>}</details>)}
        </section>
        <section className="practice-area" aria-label="Code and results">
          <div className="panel"><CodeEditor value={source} onChange={value => {
            sourceRef.current = value; dirty.current = true; setSource(value); setReview(undefined);
            setSaveStatus(navigator.onLine ? 'Unsynced local changes' : 'Offline · unsynced local changes');
            void cache().then(() => { if (!navigator.onLine && sourceRef.current === value) setSaveStatus('Offline · changes kept on this device'); }).catch(storageError);
          }} />
            <div className="save-row"><p role="status" aria-atomic="true">{saveStatus}</p><button disabled={busy || !!conflict} onClick={() => void act(async () => { await save(); })}>Save code</button></div>
            {!online && <p className="notice">You are offline. Your edits stay on this device until saved on the server.</p>}
            {waiting && <p className="notice" role="status" aria-live="polite">⏳ Evaluation in progress… compiling and running your Cangjie code.</p>}
            <div className="actions"><button disabled={busy || waiting || !!conflict || !online} onClick={() => void evaluate('single')}>Run test</button>
              <button disabled={busy || waiting || !!conflict || !online || remaining > 0} onClick={() => void evaluate('batch')}>{remaining > 0 ? `Validate (${remaining}s)` : 'Validate'}</button>
              <button className="primary" disabled={busy || waiting || !!conflict || !online} onClick={() => void reviewSubmission()}>Review submission</button></div>
          </div>
          {error && <div className="panel error" role="alert">{error}</div>}
          {conflict && <section className="panel" aria-label="Draft conflict"><h2>Choose which code to keep</h2><p>Another version was saved. Both versions are preserved until you choose.</p>
            <h3>Saved on server</h3><pre>{conflict.server.source}</pre><h3>Your competing code</h3><pre>{conflict.candidate.source}</pre>
            <div className="actions"><button disabled={busy} onClick={() => void resolve('server')}>Keep server version</button><button disabled={busy} onClick={() => void resolve('candidate')}>Keep my version</button></div></section>}
          {review && <section className="panel" aria-label="Submission review"><h2>Review your topic submission</h2>
            <p>{review.unattempted ? 'This problem is unattempted and will contribute 0/10.' : 'This code will be submitted. Current matching validation may be reused.'}</p><pre>{review.source}</pre>
            {review.unattempted && <label className="acknowledgement"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I understand this unattempted problem earns zero points.</label>}
            <div className="actions"><button disabled={busy || (review.unattempted && !acknowledged)} onClick={() => void confirmSubmission()}>Confirm submission</button><button disabled={busy} onClick={() => setReview(undefined)}>Cancel</button></div></section>}
          {pending && !pending.operationId && <section className="panel"><p>The request has not been confirmed. Recover it using the same request identity.</p><button disabled={busy || !online} onClick={() => void act(() => sendRemembered(pending))}>Recover request</button></section>}
          {operation && <section className="panel results" aria-label="Evaluation results" aria-busy={operation.state === 'pending'}>
            <h2>{operation.type === 'submission' ? 'Topic submission' : operation.kind === 'batch' ? 'Batch validation' : 'Individual test run'}</h2>
            <p role="status" aria-atomic="true">{operation.state === 'pending' ? 'Evaluation in progress. You can return to this result after reopening the page.' : operation.state === 'retryable-error' ? 'Evaluation could not be completed. Your prior progress is preserved.' : 'Result confirmed.'}</p>
            {old && <p className="notice">Changed since last validation. This result belongs to an earlier code version.</p>}
            {operation.score && <p className="score">{operation.score.earned}/{operation.score.possible}</p>}
            {operation.type === 'evaluation' && operation.kind === 'single' && <p className="muted">Individual runs give feedback and award no points.</p>}
            {operation.message && <p>{operation.message}</p>}
            {operation.feedback.map(result => <article className={`test-result ${result.status === 'pass' ? 'pass' : result.status.includes('format') ? 'format' : 'fail'}`} key={result.caseId}>
              <h3>{result.caseId}: {result.status}</h3>
              {result.expected !== undefined && <><h4>Expected output</h4><pre>{result.expected}</pre></>}
              {result.actual !== undefined && <><h4>Actual output</h4><pre>{result.actual}</pre></>}
              {result.diagnostics && <><h4>Diagnostics</h4><pre>{result.diagnostics}</pre></>}
            </article>)}
            {operation.state === 'retryable-error' && <button disabled={busy || !online} onClick={() => void act(async () => { await acceptOperation(await request<OperationView>(`/api/operations/${operation.operationId}/retry`, {})); })}>Retry evaluation</button>}
          </section>}
          {workspace.progress.nextTopicAvailable && <aside className="panel next-topic"><h2>Next: Identifiers</h2><p>Unlocked. Its multiple-choice activity is not available in this local milestone yet.</p></aside>}
        </section>
      </div>
    </main>
  </div>;
}
