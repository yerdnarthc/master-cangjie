"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PublicQuiz,
  PublicQuestion,
} from "../../../../modules/roadmap/adapters/quiz-content.ts";
import type { QuizEvaluation } from "../../../../modules/topic-submission/domain/quiz-evaluation.ts";
import type { Score } from "../../../../modules/topic-submission/domain/evaluation.ts";
import { browserDrafts } from "../../../../modules/activity-draft/adapters/browser-drafts.ts";

type QuizWorkspaceData = {
  learnerId: string;
  topicId: string;
  quiz: PublicQuiz;
  draft: { answers: Record<string, string>; workRevision: number };
  conflict?: Extract<DraftResult, { kind: "conflict" }> | null;
  progress: {
    bestScore: Score | null;
    completed: boolean;
    canMarkComplete: boolean;
    nextTopicAvailable: boolean;
  };
  latestSubmission?: {
    submissionId: string;
    evaluation: QuizEvaluation;
    submittedAt: string;
  };
};

type QuizDraft = { answers: Record<string, string>; workRevision: number };
type DraftResult =
  | { kind: "saved"; workRevision: number; nextConflict?: Extract<DraftResult, { kind: "conflict" }> | null }
  | { kind: "conflict"; conflictId: string; server: QuizDraft; candidate: QuizDraft };

class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : method,
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new RequestError(
      data.error ?? "The request could not be completed.",
      response.status,
    );
  }
  return data as T;
}

export default function QuizWorkspace({ topicId }: { topicId: string }) {
  const [data, setData] = useState<QuizWorkspaceData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<string>("Loading activity…");
  const [saveVersion, setSaveVersion] = useState(0);
  const [error, setError] = useState<string>("");
  const [unauthorized, setUnauthorized] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [completing, setCompleting] = useState<boolean>(false);
  const [showConfirmUnanswered, setShowConfirmUnanswered] =
    useState<boolean>(false);
  const [evaluation, setEvaluation] = useState<QuizEvaluation | null>(null);
  const [conflict, setConflict] = useState<Extract<DraftResult, { kind: "conflict" }> | null>(null);
  const [resolving, setResolving] = useState(false);
  const [conflictChanged, setConflictChanged] = useState(false);

  const workRevision = useRef<number>(0);
  const answersRef = useRef<Record<string, string>>({});
  const dirty = useRef<boolean>(false);
  const saving = useRef<boolean>(false);
  const conflictRef = useRef<Extract<DraftResult, { kind: "conflict" }> | null>(null);
  const pendingLocal = useRef<QuizDraft | null>(null);
  const localWrites = useRef<Promise<unknown>>(Promise.resolve());
  const storageKey = useRef("");
  const preserveLocal = (learnerId: string, snapshot: QuizDraft | null) => {
    pendingLocal.current = snapshot;
    const key = storageKey.current;
    localWrites.current = localWrites.current.catch(() => {}).then(() => browserDrafts.save({
      learnerId, problemId: key, source: JSON.stringify(snapshot?.answers ?? {}),
      baseRevision: snapshot?.workRevision ?? 0, dirty: !!snapshot,
    }));
    void localWrites.current.catch(() => setError("Browser storage is unavailable. Keep this page open until your answers are saved."));
  };

  const load = useCallback(async () => {
    setError("");
    try {
      const ws = await request<QuizWorkspaceData>(
        `/api/topics/${encodeURIComponent(topicId)}/quiz`,
      );
      let tabId = sessionStorage.getItem('mcj-quiz-tab');
      if (!tabId) { tabId = crypto.randomUUID(); sessionStorage.setItem('mcj-quiz-tab', tabId); }
      storageKey.current = `quiz:${topicId}:${tabId}`;
      await localWrites.current.catch(() => {});
      const local = ws.learnerId ? await browserDrafts.read(ws.learnerId, storageKey.current) : undefined;
      pendingLocal.current = local?.dirty ? { answers: JSON.parse(local.source), workRevision: local.baseRevision } : null;
      setData(ws);
      workRevision.current = ws.draft.workRevision;
      conflictRef.current = ws.conflict ?? null;
      setConflict(ws.conflict ?? null);
      const initialAnswers = ws.conflict?.candidate.answers ?? pendingLocal.current?.answers ?? ws.draft.answers ?? {};
      answersRef.current = initialAnswers;
      setAnswers(initialAnswers);
      dirty.current = !ws.conflict && !!pendingLocal.current;
      if (dirty.current) workRevision.current = pendingLocal.current!.workRevision;
      setSaveStatus(ws.conflict ? "Choose which draft to keep" : dirty.current ? "Unsaved changes" : "All changes saved");

      if (ws.latestSubmission) {
        setEvaluation(ws.latestSubmission.evaluation);
      }
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) {
        setUnauthorized(true);
      } else {
        setError(
          e instanceof Error
            ? e.message
            : "Unable to open multiple-choice activity.",
        );
      }
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (): Promise<boolean> => {
    if (saving.current || conflictRef.current || !dirty.current || !data) return false;
    saving.current = true;
    const sentAnswers = answersRef.current;
    setSaveStatus("Saving draft…");
    try {
      const res = await request<DraftResult>(
        `/api/topics/${encodeURIComponent(topicId)}/quiz/draft`,
        {
          baseRevision: workRevision.current,
          answers: sentAnswers,
        },
        "PUT",
      );

      if (res.kind === "saved" && res.workRevision !== undefined) {
        workRevision.current = res.workRevision;
        dirty.current = answersRef.current !== sentAnswers;
        preserveLocal(data.learnerId, dirty.current ? { answers: answersRef.current, workRevision: res.workRevision } : null);
        setSaveStatus(dirty.current ? "Unsaved changes" : "Saved on server");
        if (dirty.current) setSaveVersion(version => version + 1);
        return !dirty.current;
      }
      if (res.kind === "conflict") {
        conflictRef.current = res;
        setConflict(res);
        answersRef.current = res.candidate.answers;
        setAnswers(res.candidate.answers);
        setConflictChanged(false);
        setSaveStatus("Choose which draft to keep");
        return false;
      }
      return false;
    } catch (err) {
      setSaveStatus("Failed to save draft");
      setError(err instanceof Error ? err.message : "Failed to save draft.");
      return false;
    } finally {
      saving.current = false;
    }
  }, [data, topicId]);

  const resolveConflict = async (choice: "server" | "candidate") => {
    const current = conflictRef.current;
    if (!current || saving.current) return;
    saving.current = true;
    setResolving(true);
    setError("");
    try {
      const result = await request<DraftResult>(
        `/api/topics/${encodeURIComponent(topicId)}/quiz/draft/resolve`,
        { conflictId: current.conflictId, choice, baseRevision: current.server.workRevision },
      );
      if (result.kind === "conflict") {
        conflictRef.current = result;
        setConflict(result);
        setConflictChanged(true);
        return;
      }
      workRevision.current = result.workRevision;
      const chosen = choice === 'server' ? current.server.answers : current.candidate.answers;
      const local = pendingLocal.current;
      if (local && JSON.stringify(local.answers) === JSON.stringify(current.candidate.answers)) {
        preserveLocal(data!.learnerId, null);
      }
      let next = result.nextConflict ?? null;
      // Preserve newer local edits as a competing draft rather than overwriting the chosen work.
      if (!next && pendingLocal.current) {
        const pending = pendingLocal.current;
        const saved = await request<DraftResult>(`/api/topics/${encodeURIComponent(topicId)}/quiz/draft`, {
          baseRevision: pending.workRevision, answers: pending.answers,
        }, 'PUT');
        if (saved.kind === 'conflict') next = saved;
        else { workRevision.current = saved.workRevision; preserveLocal(data!.learnerId, null); }
      }
      await localWrites.current;
      conflictRef.current = next;
      setConflict(next);
      const displayed = next?.candidate.answers ?? (pendingLocal.current?.answers ?? chosen);
      answersRef.current = displayed;
      setAnswers(displayed);
      dirty.current = false;
      setSaveStatus(next ? "Choose which draft to keep" : "Draft choice saved");
    } catch (err) {
      await load();
      setError(err instanceof Error ? err.message : "Could not save your choice. Try again.");
    } finally {
      saving.current = false;
      setResolving(false);
    }
  };

  const handleSelect = (questionId: string, choiceId: string) => {
    setError("");
    const updated = { ...answersRef.current, [questionId]: choiceId };
    answersRef.current = updated;
    preserveLocal(data!.learnerId, { answers: updated, workRevision: workRevision.current });
    setAnswers(updated);
    dirty.current = true;
    setSaveStatus("Unsaved changes");
  };

  // Debounced auto-save on answer change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (dirty.current) {
        void save();
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [answers, save, saveVersion]);

  const questions = data?.quiz.questions ?? [];
  const answeredCount = Object.keys(answers).filter(
    (k) => answers[k] && answers[k].trim() !== "",
  ).length;
  const unansweredCount = Math.max(0, 10 - answeredCount);

  const handleSubmit = async (bypassUnansweredCheck = false) => {
    if (!data) return;
    if (!bypassUnansweredCheck && unansweredCount > 0) {
      setShowConfirmUnanswered(true);
      return;
    }
    setShowConfirmUnanswered(false);
    setSubmitting(true);
    setError("");

    try {
      // First ensure latest draft is saved
      if (conflictRef.current || (dirty.current && !(await save()))) return;

      const requestKey = `submit-quiz-${topicId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = await request<{
        submissionId: string;
        evaluation: QuizEvaluation;
        progress: {
          bestScore: Score | null;
          completed: boolean;
          canMarkComplete: boolean;
          nextTopicAvailable: boolean;
        };
      }>(`/api/topics/${encodeURIComponent(topicId)}/quiz/submit`, {
        requestKey,
        answers: answersRef.current,
        assessmentRevision: data.quiz.revision,
      });

      setEvaluation(result.evaluation);
      setData((prev) => (prev ? { ...prev, progress: result.progress } : prev));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!data) return;
    setCompleting(true);
    setError("");
    try {
      const result = await request<{
        completed: boolean;
        nextTopicAvailable: boolean;
      }>(`/api/topics/${encodeURIComponent(topicId)}/complete`, {});
      setData((prev) =>
        prev
          ? {
              ...prev,
              progress: {
                ...prev.progress,
                completed: result.completed,
                nextTopicAvailable: result.nextTopicAvailable,
                canMarkComplete: false,
              },
            }
          : prev,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not mark topic complete.",
      );
    } finally {
      setCompleting(false);
    }
  };

  if (unauthorized) {
    return (
      <main className="entry-panel">
        <p className="eyebrow">MasterCangjie · Development Session</p>
        <h1>Multiple-choice Activity</h1>
        <p>Open the development learner workspace to practice this multiple-choice activity.</p>
        <p>
          <Link href={`/topics/${topicId}`}>Back to lesson</Link>
        </p>
        <button
          type="button"
          className="primary"
          onClick={async () => {
            await request('/api/session', {});
            setUnauthorized(false);
            void load();
          }}
        >
          Open development workspace
        </button>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  }

  if (!data && !error) {
    return (
      <div className="workspace-shell">
        <header className="topbar">
          <Link href="/">MasterCangjie</Link>
          <span className="muted">Multiple-choice activity</span>
        </header>
        <main>
          <p>Loading multiple-choice assessment…</p>
        </main>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="workspace-shell">
        <header className="topbar">
          <Link href="/">MasterCangjie</Link>
          <span className="muted">Multiple-choice activity</span>
        </header>
        <main>
          <div className="panel error">
            <h2>Unable to load activity</h2>
            <p>{error}</p>
            <Link href={`/topics/${topicId}`}>Return to topic handout</Link>
          </div>
        </main>
      </div>
    );
  }

  const resultFeedbackMap = new Map(
    evaluation?.questionResults.map((r) => [r.questionId, r]) ?? [],
  );

  return (
    <div className="workspace-shell">
      <header className="topbar">
        <Link href="/">MasterCangjie</Link>
        <span className="muted">Getting Started with Cangjie</span>
        <div style={{ marginLeft: "auto" }}>
          <Link href={`/topics/${topicId}`}>← Back to lesson</Link>
        </div>
      </header>

      <main>
        <div className="breadcrumb">
          <Link href="/">Onboarding</Link>
          <span>/</span>
          <Link href={`/topics/${topicId}`}>{data?.quiz.title}</Link>
          <span>/</span>
          <span>Activity</span>
        </div>

        <div className="workspace-heading">
          <div>
            <p className="eyebrow">Multiple-choice Activity (10 Questions)</p>
            <h1>{data?.quiz.title}</h1>
          </div>
          <div className="progress-summary">
            <span>
              Best score:{" "}
              {data?.progress.bestScore
                ? `${data.progress.bestScore.earned}/${data.progress.bestScore.possible} (${data.progress.bestScore.earned}%)`
                : "Not submitted"}
            </span>
            <span>
              Status:{" "}
              {data?.progress.completed ? (
                <strong style={{ color: "#128361" }}>Completed</strong>
              ) : data?.progress.canMarkComplete ? (
                <strong style={{ color: "#b57c00" }}>
                  Passed · Awaiting completion
                </strong>
              ) : (
                "Not completed"
              )}
            </span>
          </div>
        </div>

        {error && (
          <div className="panel error" style={{ marginBottom: "1.5rem" }}>
            <p>{error}</p>
          </div>
        )}

        {conflict && (
          <section className="panel notice" aria-labelledby="draft-conflict-heading">
            <h2 id="draft-conflict-heading">Choose which answers to keep</h2>
            <p>Another version of this draft was saved. Compare the answers and choose which version to use.</p>
            {conflictChanged && <p role="status">The saved answers changed again. Review both versions and choose again.</p>}
            {([
              ["Saved answers", conflict.server.answers],
              ["My answers", answers],
            ] as const).map(([label, version]) => (
              <div key={label}>
                <h3>{label}</h3>
                <ul>{questions.map(q => <li key={q.id}>{q.prompt}: {q.choices.find(c => c.id === version[q.id])?.text ?? "Unanswered"}</li>)}</ul>
              </div>
            ))}
            <div className="actions">
              <button type="button" disabled={resolving} onClick={() => void resolveConflict("server")}>Keep saved answers</button>
              <button type="button" disabled={resolving} onClick={() => void resolveConflict("candidate")}>Keep my answers</button>
            </div>
          </section>
        )}

        {/* Post-submission score banner */}
        {evaluation && (
          <div
            className="panel"
            style={{
              marginBottom: "1.5rem",
              borderColor: evaluation.passed ? "#128361" : "#b22c2c",
              backgroundColor: evaluation.passed ? "#f0f9f6" : "#fff5f5",
            }}
          >
            <p className="eyebrow">Latest Submission Result</p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div>
                <p
                  className="score"
                  style={{
                    margin: 0,
                    color: evaluation.passed ? "#128361" : "#b22c2c",
                  }}
                >
                  {evaluation.score.earned} / {evaluation.score.possible} (
                  {evaluation.passed ? "Passed!" : "Needs at least 60 to pass"})
                </p>
                <p className="muted" style={{ margin: ".4rem 0 0" }}>
                  {evaluation.correctCount} correct ·{" "}
                  {10 - evaluation.correctCount - evaluation.unansweredCount}{" "}
                  incorrect · {evaluation.unansweredCount} unanswered
                </p>
              </div>

              {/* UC-14: Mark complete action */}
              {data?.progress.canMarkComplete && !data?.progress.completed && (
                <div style={{ textAlign: "right" }}>
                  <p
                    style={{
                      margin: "0 0 .5rem",
                      fontSize: ".9rem",
                      color: "#31665e",
                      fontWeight: 600,
                    }}
                  >
                    You passed! Mark this topic complete to unlock the next
                    topic:
                  </p>
                  <button
                    type="button"
                    className="primary"
                    onClick={handleMarkComplete}
                    disabled={completing}
                    style={{ fontSize: "1.05rem", padding: ".7rem 1.4rem" }}
                  >
                    {completing ? "Completing topic…" : "Mark complete ✓"}
                  </button>
                </div>
              )}

              {data?.progress.completed && (
                <div style={{ textAlign: "right" }}>
                  <p
                    style={{
                      margin: "0 0 .5rem",
                      fontWeight: 700,
                      color: "#128361",
                    }}
                  >
                    ✓ Topic completed!
                  </p>
                  <Link
                    className="activity-link"
                    style={{ margin: 0 }}
                    href={
                      topicId === "getting-started-with-cangjie"
                        ? "/topics/installing-the-cangjie-toolchain"
                        : "/topics/running-the-first-cangjie-program"
                    }
                  >
                    Continue to next topic →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Confirmation dialog for unanswered questions */}
        {showConfirmUnanswered && (
          <div className="panel notice" style={{ marginBottom: "1.5rem" }}>
            <h3>Incomplete Activity Warning</h3>
            <p>
              You have {unansweredCount} unanswered question
              {unansweredCount > 1 ? "s" : ""}. Unanswered questions receive 0
              points with no partial credit.
            </p>
            <div className="actions" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="primary"
                onClick={() => handleSubmit(true)}
                disabled={submitting}
              >
                Submit anyway (0 points for unanswered)
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmUnanswered(false)}
              >
                Return to questions
              </button>
            </div>
          </div>
        )}

        {/* Question cards */}
        <div style={{ display: "grid", gap: "1.25rem" }}>
          {questions.map((q: PublicQuestion, idx: number) => {
            const selected = answers[q.id];
            const feedback = resultFeedbackMap.get(q.id);

            return (
              <div
                key={q.id}
                className="panel"
                id={`q-${q.id}`}
                style={{
                  borderColor: feedback
                    ? feedback.correct
                      ? "#128361"
                      : "#b22c2c"
                    : undefined,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "1rem",
                  }}
                >
                  <p className="eyebrow" style={{ margin: 0 }}>
                    Question {idx + 1} of 10
                  </p>
                  {feedback ? (
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: ".9rem",
                        color: feedback.correct ? "#128361" : "#b22c2c",
                      }}
                    >
                      {feedback.correct
                        ? "✓ Correct (+10 pts)"
                        : feedback.selectedChoiceId
                          ? "✗ Incorrect (0 pts)"
                          : "Unanswered (0 pts)"}
                    </span>
                  ) : (
                    <span className="muted" style={{ fontSize: ".85rem" }}>
                      {selected ? "● Answered" : "○ Not answered"}
                    </span>
                  )}
                </div>

                <h2 style={{ fontSize: "1.15rem", margin: ".6rem 0 1rem" }}>
                  {q.prompt}
                </h2>

                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="sr-only" style={{ display: "none" }}>
                    Choices for Question {idx + 1}
                  </legend>
                  <div style={{ display: "grid", gap: ".6rem" }}>
                    {q.choices.map((c) => {
                      const isChosen = selected === c.id;
                      return (
                        <label
                          key={c.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: ".75rem",
                            padding: ".75rem 1rem",
                            border: `2px solid ${isChosen ? "var(--accent)" : "var(--line)"}`,
                            borderRadius: "7px",
                            cursor: "pointer",
                            background: isChosen ? "#e7f2f0" : "#fff",
                            fontWeight: isChosen ? 600 : 400,
                          }}
                        >
                          <input
                            type="radio"
                            disabled={!!conflict}
                            name={`q-${q.id}`}
                            value={c.id}
                            checked={isChosen}
                            onChange={() => handleSelect(q.id, c.id)}
                            style={{ width: "18px", height: "18px" }}
                          />
                          <span>{c.text}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Tutor explanation after submission */}
                {feedback && (
                  <div
                    style={{
                      marginTop: "1rem",
                      padding: ".85rem 1rem",
                      background: "#f8fafb",
                      borderLeft: `4px solid ${feedback.correct ? "#128361" : "#b57c00"}`,
                      borderRadius: "4px",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 .3rem",
                        fontWeight: 700,
                        fontSize: ".9rem",
                      }}
                    >
                      Cangjie Tutor Explanation:
                    </p>
                    <p style={{ margin: 0, fontSize: ".95rem" }}>
                      {feedback.explanation}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom submit bar */}
        <div
          className="panel"
          style={{
            marginTop: "2rem",
            position: "sticky",
            bottom: "1rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 10,
          }}
        >
          <div className="save-row">
            <div>
              <p style={{ fontWeight: 600, margin: 0 }}>
                {answeredCount} of 10 answered{" "}
                {unansweredCount > 0
                  ? `(${unansweredCount} remaining)`
                  : "(Complete)"}
              </p>
              <p
                className="muted"
                style={{ fontSize: ".8rem", margin: ".2rem 0 0" }}
              >
                {saveStatus}
              </p>
            </div>

            <div className="actions">
              <button
                type="button"
                onClick={() => void save()}
                disabled={!!conflict || saving.current || !dirty.current}
              >
                Save draft
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => handleSubmit(false)}
                disabled={submitting || !!conflict}
              >
                {submitting
                  ? "Evaluating answers…"
                  : evaluation
                    ? "Submit retry"
                    : "Submit activity"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
